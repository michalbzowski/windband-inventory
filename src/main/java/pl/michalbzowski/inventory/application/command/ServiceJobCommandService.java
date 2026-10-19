package pl.michalbzowski.inventory.application.command;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignment;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEvent;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;
import pl.michalbzowski.inventory.domain.inventory.ServiceJob;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobRepository;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobStatus;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransfer;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Service-job write use cases (decision B15, ADMIN-only at the REST layer).
 * Every transition atomically applies the agreed item effects in the SAME
 * transaction — job state + item state must never diverge:
 *
 * <ul>
 *   <li>SHIPPED — assignment closed (if any) → IN_SERVICE, evidence row opened, move to SERVICE</li>
 *   <li>REPAIRED / READY_FOR_PICKUP — informational; the item stays outside the band</li>
 *   <li>IN_STOCK — AVAILABLE + back to MAIN (physical return is a fact)</li>
 *   <li>HANDLED_OVER — re-assigned to the reporter (ACTIVE member again, B10), terminal</li>
 *   <li>CANCELLED — only from REQUESTED (before shipping); no item effects</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class ServiceJobCommandService {

    private static final List<ServiceJobStatus> CLOSED = List.of(ServiceJobStatus.HANDLED_OVER, ServiceJobStatus.CANCELLED);

    private final ServiceJobRepository serviceJobs;
    private final InventoryItemRepository items;
    private final ItemAssignmentRepository assignments;
    private final ItemServiceEventRepository serviceEvents;
    private final WarehouseTransferRepository transfers;
    private final BandDirectory bandDirectory;

    /**
     * Report a repair for an existing position (status REQUESTED, no item effects).
     * Reporter is the member the fix concerns (active check per B10); null is
     * allowed for band-level repairs but then HANDLED_OVER is impossible.
     */
    @Transactional
    public ServiceJob create(String bearerToken, long bandId, long itemId, Long reporterMemberId,
            String note, long creatorMemberId) {
        InventoryItem item = items.findById(itemId).orElseThrow(() -> new ItemNotFoundException(itemId));
        if (item.getBandId() == null || item.getBandId().longValue() != bandId) {
            throw new IllegalStateException("Pozycja należy do innego zespołu niż zgłoszono — sprawdź id zespołu");
        }
        if (serviceJobs.countByItemIdAndStatusNotIn(itemId, CLOSED) > 0) {
            throw new IllegalStateException(
                    "Na tę pozycję istnieje już otwarte zgłoszenie serwisowe — dopilnuj je do końca, potem może powstać kolejne");
        }
        BandMember reporter = (reporterMemberId == null) ? null
                : requireActiveMember(bearerToken, bandId, reporterMemberId,
                        "Osoba naprawy musi być aktywnym członkiem bandu");
        BandMember creator = requireActiveMember(bearerToken, bandId, creatorMemberId,
                "Zgłoszenie serwisowe składa konkretny członek — podaj jego id");

        return serviceJobs.save(ServiceJob.request(
                bandId, item,
                reporter == null ? null : reporter.memberId(),
                reporter == null ? null : reporter.fullName(),
                note,
                creator.memberId(), creator.fullName()));
    }

    /**
     * One transition at a time (REQUESTED is creation-only and has no endpoint).
     * Illegal pairs throw {@link IllegalStateException} → HTTP 409.
     */
    @Transactional
    public ServiceJob transition(String bearerToken, long jobId, ServiceJobStatus target, String note) {
        if (target == ServiceJobStatus.REQUESTED) {
            throw new IllegalArgumentException("'Zgłoszone' ustawia się przy utworzeniu zgłoszenia — nie da się do niego wrócić");
        }
        ServiceJob job = serviceJobs.findById(jobId).orElseThrow(() -> new ServiceJobNotFoundException(jobId));
        InventoryItem item = job.getItem();

        switch (target) {
            case SHIPPED -> shipOut(bearerToken, job, item, note);
            case REPAIRED -> job.markRepaired(note);
            case READY_FOR_PICKUP -> job.markReadyForPickup(note);
            case IN_STOCK -> returnToStock(job, item, note);
            case HANDLED_OVER -> handOver(bearerToken, job, item, note);
            case CANCELLED -> job.cancel(note);
            default -> throw new IllegalStateException("Niezrealizowany status serwisu: " + target);
        }
        return job;
    }

    // ------------------------------------------------------------- internals

    private void shipOut(String bearerToken, ServiceJob job, InventoryItem item, String note) {
        ItemAssignment open = assignments.findByItemIdAndReturnedAtIsNull(item.getId()).orElse(null);
        if (item.getLifecycleStatus() == ItemLifecycleStatus.ASSIGNED) {
            if (open == null) {
                throw new IllegalStateException(
                        "Pozycja ma przypisaną osobę, ale nie ma otwartego przydziału — napraw dane albo zwróć ją formalnie");
            }
            // Assignment off, evidence of the journey kept (mirrors unassign).
            item.unassign(ItemLifecycleStatus.IN_SERVICE);
            open.close(ItemLifecycleStatus.IN_SERVICE, note);
            serviceEvents.save(ItemServiceEvent.open(item, note));
        } else if (item.getLifecycleStatus() == ItemLifecycleStatus.AVAILABLE) {
            item.sendToService();
            serviceEvents.save(ItemServiceEvent.open(item, note));
        } else {
            throw new IllegalStateException(
                    "Do serwisu trafić może tylko pozycja wolna lub przypisana; aktualny stan: " + item.getLifecycleStatus());
        }
        moveToWarehouse(item, WarehouseType.SERVICE);
        job.ship(note);
    }

    private void returnToStock(ServiceJob job, InventoryItem item, String note) {
        if (item.getLifecycleStatus() != ItemLifecycleStatus.IN_SERVICE) {
            throw new IllegalStateException("Pozycja nie jest w serwisie — zamknij najpierw ścieżkę serwisową");
        }
        // F4: completeService also clears the planned next_service_date.
        item.completeService(null);
        moveToWarehouse(item, WarehouseType.MAIN);
        job.returnToStock(note);
    }

    private void handOver(String bearerToken, ServiceJob job, InventoryItem item, String note) {
        if (job.getReporterMemberId() == null) {
            throw new IllegalStateException("Przekazanie wymaga osoby zgłaszającej — taka nie została zapisana przy zgłoszeniu");
        }
        BandMember reporter = requireActiveMember(bearerToken, job.getBandId(), job.getReporterMemberId(),
                "Przekazać można tylko aktywnemu członkowi — przywróć go w składzie bandu i spróbuj ponownie");
        // assignTo enforces AVAILABLE → the IN_STOCK step must precede this one.
        item.assignTo(reporter.memberId(), reporter.fullName());
        assignments.save(ItemAssignment.open(item, reporter.memberId(), reporter.fullName(),
                "Przekazanie po naprawie (zgłoszenie serwisowe #" + job.getId() + ")"));
        job.handOver(note);
    }

    private void moveToWarehouse(InventoryItem item, WarehouseType target) {
        WarehouseType from = item.getWarehouse() == null ? WarehouseType.MAIN : item.getWarehouse();
        item.moveTo(target);
        transfers.save(WarehouseTransfer.record(item, from, target, "Przeniesienie serwisowe"));
    }

    /** B10: the WM roster is re-validated with the caller's token (active check), never a local snapshot. */
    private BandMember requireActiveMember(String bearerToken, long bandId, Long memberId, String missingMessage) {
        if (memberId == null) {
            throw new IllegalArgumentException(missingMessage);
        }
        BandMember member = bandDirectory.members(bearerToken, bandId).stream()
                .filter(m -> m.memberId() == memberId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Członek o id " + memberId + " nie należy do tego bandu"));
        if (!member.active()) {
            throw new IllegalArgumentException(missingMessage + " — " + member.fullName() + " jest nieaktywny");
        }
        return member;
    }
}
