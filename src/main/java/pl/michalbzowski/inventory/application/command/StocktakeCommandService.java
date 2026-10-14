package pl.michalbzowski.inventory.application.command;

import java.util.EnumSet;
import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.StocktakeStatus;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.FoundState;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.Stocktake;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLine;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * F5 stocktake use-cases (analysis 3.2, spec F5/B7/B8).
 *
 * <p>Roles are enforced in REST (start/pause/resume/close ADMIN, counting any
 * band member); here the INVARIANTS live: snapshot = AVAILABLE/ASSIGNED items
 * of the band (optionally narrowed by start filters), counted states follow
 * the mobile vocabulary, and every write checks the editable window
 * (IN_PROGRESS) before anything else cheap fails, then the roster.
 *
 * <p>Counter identity: WM deliberately has no member↔user mapping, so the
 * client sends the roster member doing the counting and we re-validate it
 * against the LIVE roster on every write (B10) — same rule as assignments.
 */
@Service
@RequiredArgsConstructor
public class StocktakeCommandService {

    private static final Set<ItemLifecycleStatus> SNAPSHOT_STATUSES =
            EnumSet.of(ItemLifecycleStatus.AVAILABLE, ItemLifecycleStatus.ASSIGNED);

    private final InventoryItemRepository items;
    private final StocktakeRepository stocktakes;
    private final StocktakeLineRepository lines;
    private final BandDirectory bandDirectory;

    /** ADMIN: open a stocktake; snapshot lines are written in the same tx. */
    @Transactional
    public Stocktake start(String bearerToken, long bandId, String startedBySubject,
            ItemType type, ItemLifecycleStatus status, WarehouseType warehouse, String notes) {
        // The hub, "dołącz do liczenia" and the report all assume ONE editable
        // stocktake per band; a second open would silently split the counts.
        if (stocktakes.existsByBandIdAndStatusIn(bandId,
                List.of(StocktakeStatus.DRAFT, StocktakeStatus.IN_PROGRESS))) {
            throw new IllegalStateException(
                    "Zespół ma już otwarty spis (w toku lub wstrzymany) — dokończ i zamknij go przed nowym");
        }
        if (status != null && !SNAPSHOT_STATUSES.contains(status)) {
            throw new IllegalArgumentException(
                    "Spis może zawężać tylko do statusów AVAILABLE/ASSIGNED — reszta nie jest spodziewana w magazynie");
        }
        Specification<InventoryItem> spec = (root, query, cb) -> cb.and(
                cb.equal(root.get("bandId"), bandId),
                status != null
                        ? cb.equal(root.get("lifecycleStatus"), status)
                        : root.get("lifecycleStatus").in(SNAPSHOT_STATUSES),
                type != null ? cb.equal(root.get("type"), type) : cb.conjunction(),
                warehouse != null ? cb.equal(root.get("warehouse"), warehouse) : cb.conjunction());

        Stocktake stocktake = stocktakes.save(
                Stocktake.start(bandId, startedBySubject, notes));
        List<InventoryItem> snapshotItems = items.findAll(spec);
        lines.saveAll(snapshotItems.stream().map(item -> StocktakeLine.expected(stocktake, item)).toList());
        return stocktake;
    }

    /** Any band member: (re)count one snapshot line; last word wins. */
    @Transactional
    public StocktakeLine count(String bearerToken, long stocktakeId, long lineId,
            FoundState foundState, String note, Long countedMemberId) {
        Stocktake stocktake = load(stocktakeId);
        stocktake.requireEditable();
        StocktakeLine line = lines.findById(lineId)
                .filter(l -> Objects.equals(l.getStocktake().getId(), stocktakeId))
                .orElseThrow(() -> new StocktakeLineNotFoundException(lineId));
        BandMember counter = requireActiveMember(bearerToken, stocktake.getBandId(), countedMemberId);
        line.countAs(foundState, note, counter.memberId(), counter.fullName());
        return lines.save(line);
    }

    /** Any band member: record a nadwyżka — a physical unit outside the snapshot. */
    @Transactional
    public StocktakeLine addExtra(String bearerToken, long stocktakeId, long itemId,
            String note, Long countedMemberId) {
        Stocktake stocktake = load(stocktakeId);
        stocktake.requireEditable();
        InventoryItem item = items.findById(itemId).orElseThrow(() -> new ItemNotFoundException(itemId));
        if (!Objects.equals(item.getBandId(), stocktake.getBandId())) {
            throw new IllegalArgumentException("Dopisać można tylko pozycję tego samego bandu");
        }
        if (lines.existsByStocktake_IdAndItem_Id(stocktakeId, itemId)) {
            throw new IllegalArgumentException("Ta pozycja jest już ujęta w spisie — użyj poprawki liczonej linii");
        }
        BandMember counter = requireActiveMember(bearerToken, stocktake.getBandId(), countedMemberId);
        return lines.save(StocktakeLine.addedExtra(stocktake, item,
                counter.memberId(), counter.fullName(), note));
    }

    @Transactional
    public Stocktake pause(String bearerToken, long stocktakeId) {
        Stocktake stocktake = load(stocktakeId);
        stocktake.pause();
        return stocktakes.save(stocktake);
    }

    @Transactional
    public Stocktake resume(String bearerToken, long stocktakeId) {
        Stocktake stocktake = load(stocktakeId);
        stocktake.resume();
        return stocktakes.save(stocktake);
    }

    /** ADMIN: terminal close (spec: double close rejected — domain enforces). */
    @Transactional
    public Stocktake close(String bearerToken, long stocktakeId) {
        Stocktake stocktake = load(stocktakeId);
        stocktake.close();
        return stocktakes.save(stocktake);
    }

    private BandMember requireActiveMember(String bearerToken, long bandId, Long countedMemberId) {
        if (countedMemberId == null) {
            throw new IllegalArgumentException("Podaj countedMemberId — liczy konkretny członek bandu");
        }
        BandMember member = bandDirectory.members(bearerToken, bandId).stream()
                .filter(m -> m.memberId() == countedMemberId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Członek o id " + countedMemberId + " nie należy do tego bandu"));
        if (!member.active()) {
            throw new IllegalArgumentException(
                    "Liczyć może tylko aktywny członek bandu — " + member.fullName() + " jest nieaktywny");
        }
        return member;
    }

    private Stocktake load(long id) {
        return stocktakes.findById(id).orElseThrow(() -> new StocktakeNotFoundException(id));
    }
}
