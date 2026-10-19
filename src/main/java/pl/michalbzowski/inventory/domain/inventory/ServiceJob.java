package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Service job — repair request for an EXISTING item (decision B15). A purchase
 * of a NEW item is the separate purchaseRequests track; this row tracks the
 * physical journey of one band instrument: report → send to service → repaired
 * → pickup → back in stock → handed over to the reporter. The ITEM side effects
 * (assignment off, lifecycle IN_SERVICE, warehouse SERVICE / MAIN, re-assign)
 * are enforced by ServiceJobCommandService in the same transaction — this
 * aggregate only owns its own state machine, mirroring PurchaseRequest.
 *
 * <p>Evidence semantics mirror InventoryNeed: reporter = snapshot of member id
 * + name at request time (roster re-validated at REST, B10); terminal rows are
 * never rewritten; one open job per item via uq_service_jobs_open.
 */
@Entity
@Table(name = "service_jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public final class ServiceJob {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    /** Who the repair concerns (snapshot). Null only for band-level repairs. */
    @Column(name = "reporter_member_id")
    private Long reporterMemberId;

    @Column(name = "reporter_member_name", length = 200)
    private String reporterName;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ServiceJobStatus status;

    /** Note at request time (why it was reported). */
    @Column(length = 2000)
    private String note;

    /** Note attached to the last transition (resolution evidence). */
    @Column(name = "resolution_note", length = 2000)
    private String resolutionNote;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_by_member_name", nullable = false, length = 200)
    private String createdByName;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** Set on SHIPPED. */
    @Column(name = "shipped_at")
    private LocalDateTime shippedAt;

    /** Set on IN_STOCK (physical return). */
    @Column(name = "returned_at")
    private LocalDateTime returnedAt;

    /** Set on HANDLED_OVER (terminal). */
    @Column(name = "handed_over_at")
    private LocalDateTime handedOverAt;

    /** Set on CANCELLED (terminal). */
    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    private ServiceJob(Long bandId, InventoryItem item, Long reporterMemberId, String reporterName,
            String note, Long createdByMemberId, String createdByName) {
        this.bandId = bandId;
        this.item = item;
        this.reporterMemberId = reporterMemberId;
        this.reporterName = reporterName;
        this.status = ServiceJobStatus.REQUESTED;
        this.note = note;
        this.createdByMemberId = createdByMemberId;
        this.createdByName = createdByName;
    }

    /**
     * Factory: a fresh repair request (status REQUESTED). The item must belong
     * to the same band as the job — cross-band rows would poison the evidence.
     */
    public static ServiceJob request(Long bandId, InventoryItem item, Long reporterMemberId,
            String reporterName, String note, Long createdByMemberId, String createdByName) {
        if (item == null || !java.util.Objects.equals(bandId, item.getBandId())) {
            throw new IllegalArgumentException("Zgłoszenie musi dotyczyć pozycji z tego samego zespołu");
        }
        return new ServiceJob(bandId, item, reporterMemberId, reporterName, note, createdByMemberId, createdByName);
    }

    private void requireStatus(ServiceJobStatus expected, String action) {
        if (status != expected) {
            throw new IllegalStateException(
                    action + " — aktualny stan zgłoszenia: " + status.name());
        }
    }

    /** REQUESTED → SHIPPED. Item side effects: application layer. */
    public void ship(String note) {
        requireStatus(ServiceJobStatus.REQUESTED,
                "Wysłać do serwisu można tylko zgłoszenie w stanie 'Zgłoszone'");
        this.status = ServiceJobStatus.SHIPPED;
        this.resolutionNote = note;
        this.shippedAt = LocalDateTime.now();
    }

    /** SHIPPED → REPAIRED. Informational state at the workshop; item untouched. */
    public void markRepaired(String note) {
        requireStatus(ServiceJobStatus.SHIPPED,
                "Stan 'Naprawione' następuje po wysłaniu do serwisu");
        this.status = ServiceJobStatus.REPAIRED;
        this.resolutionNote = note;
    }

    /** REPAIRED → READY_FOR_PICKUP. Item still physically away. */
    public void markReadyForPickup(String note) {
        requireStatus(ServiceJobStatus.REPAIRED,
                "Stan 'Do odbioru' następuje po naprawie");
        this.status = ServiceJobStatus.READY_FOR_PICKUP;
        this.resolutionNote = note;
    }

    /** READY_FOR_PICKUP → IN_STOCK. Item side effect: AVAILABLE + MAIN (app). */
    public void returnToStock(String note) {
        requireStatus(ServiceJobStatus.READY_FOR_PICKUP,
                "Powrót do magazynu następuje z 'Do odbioru'");
        this.status = ServiceJobStatus.IN_STOCK;
        this.resolutionNote = note;
        this.returnedAt = LocalDateTime.now();
    }

    /** IN_STOCK → HANDLED_OVER (terminal). Re-assign side effect: application. */
    public void handOver(String note) {
        requireStatus(ServiceJobStatus.IN_STOCK,
                "Przekazać osobie można tylko zgłoszenie w stanie 'W magazynie'");
        if (reporterMemberId == null) {
            throw new IllegalStateException(
                    "Przekazanie wymaga osoby zgłaszającej — taka nie została zapisana przy zgłoszeniu");
        }
        this.status = ServiceJobStatus.HANDLED_OVER;
        this.resolutionNote = note;
        this.handedOverAt = LocalDateTime.now();
    }

    /** REQUESTED → CANCELLED (terminal). No item side effects by definition. */
    public void cancel(String note) {
        requireStatus(ServiceJobStatus.REQUESTED,
                "Anulować można tylko zgłoszenie w stanie 'Zgłoszone' — po wysłaniu idzie droga fizyczna (powrót + przekazanie)");
        this.status = ServiceJobStatus.CANCELLED;
        this.resolutionNote = note;
        this.cancelledAt = LocalDateTime.now();
    }

    /** True when the row is a finished piece of evidence (never rewritten). */
    public boolean isTerminal() {
        return status == ServiceJobStatus.HANDLED_OVER || status == ServiceJobStatus.CANCELLED;
    }

    @PrePersist
    void onCreate() {
        if (status == null) {
            status = ServiceJobStatus.REQUESTED;
        }
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
