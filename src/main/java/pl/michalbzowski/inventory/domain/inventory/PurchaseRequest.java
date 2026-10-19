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
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Purchase request for a NEW item on behalf of a named member
 * (roadmap 2026-10-19). Owns the six-step flow REQUESTED → SENT →
 * IN_PROGRESS → DELIVERED → READY_FOR_PICKUP → RECEIVED (+ CANCELLED
 * before delivery). The row is evidence: member name and item name are
 * snapshotted, and the physical side effects happen in the command
 * service — DELIVERED links the freshly created {@link InventoryItem},
 * RECEIVED is valid only once that item has been assigned to the member.
 */
@Entity
@Table(name = "purchase_requests")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PurchaseRequest {

    /** Statuses from which the purchase may still be cancelled. */
    private static final List<PurchaseStatus> CANCELLABLE =
            List.of(PurchaseStatus.REQUESTED, PurchaseStatus.SENT, PurchaseStatus.IN_PROGRESS);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 20)
    private ItemType itemType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PurchaseStatus status;

    @Column(name = "requested_for_member_id", nullable = false)
    private Long requestedForMemberId;

    @Column(name = "requested_for_name", nullable = false, length = 200)
    private String requestedForName;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "resolution_note", columnDefinition = "TEXT")
    private String resolutionNote;

    @Column(name = "created_member_id")
    private Long createdMemberId;

    @Column(name = "created_member_name", length = 200)
    private String createdMemberName;

    /** Set when the purchase is delivered: the item that entered the warehouse. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "item_id")
    private InventoryItem item;

    /**
     * Snapshotted attribute values (JSON array of {attributeDefId, name, value})
     * captured when the order was placed — evidence for what we are buying. On
     * DELIVERED the pairs are re-validated against live defs and attached to the
     * freshly created item; null = legacy order without attributes.
     */
    @Column(name = "attribute_snapshot", columnDefinition = "TEXT")
    private String attributeSnapshot;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    @Column(name = "received_at")
    private LocalDateTime receivedAt;

    public static PurchaseRequest request(Long bandId, String name, ItemType itemType,
            long requestedForMemberId, String requestedForName, String note,
            Long createdMemberId, String createdMemberName, String attributeSnapshot) {
        Objects.requireNonNull(bandId, "bandId required");
        Objects.requireNonNull(name, "name required");
        Objects.requireNonNull(itemType, "itemType required");
        Objects.requireNonNull(requestedForName, "requestedForName required");
        PurchaseRequest purchase = new PurchaseRequest();
        purchase.bandId = bandId;
        purchase.name = requireNotBlank(name, "name required");
        purchase.itemType = itemType;
        purchase.requestedForMemberId = requestedForMemberId;
        purchase.requestedForName = requireNotBlank(requestedForName, "requestedForName required");
        purchase.note = blankToNull(note);
        purchase.createdMemberId = createdMemberId;
        purchase.createdMemberName = createdMemberName;
        purchase.attributeSnapshot = blankToNull(attributeSnapshot);
        purchase.status = PurchaseStatus.REQUESTED;
        purchase.createdAt = LocalDateTime.now();
        return purchase;
    }

    /** REQUESTED → SENT: handed over for execution. */
    public void sendToExecution() {
        require(PurchaseStatus.REQUESTED, "Przekazać do realizacji można tylko zamówienie zgłoszone (REQUESTED)");
        this.status = PurchaseStatus.SENT;
    }

    /** SENT → IN_PROGRESS. */
    public void startExecution() {
        require(PurchaseStatus.SENT, "Rozpocząć można tylko zamówienie przekazane do realizacji (SENT)");
        this.status = PurchaseStatus.IN_PROGRESS;
    }

    /** IN_PROGRESS → DELIVERED. The command service creates the item first; this row links it. */
    public void deliver(InventoryItem item, String note) {
        require(PurchaseStatus.IN_PROGRESS, "Dostarczyć można tylko zamówienie w realizacji (IN_PROGRESS)");
        this.item = Objects.requireNonNull(item, "dostarczone zamówienie musi wskazywać pozycję");
        this.status = PurchaseStatus.DELIVERED;
        this.deliveredAt = LocalDateTime.now();
        keepNote(note);
    }

    /** DELIVERED → READY_FOR_PICKUP: goods are on the shelf, waiting for the person. */
    public void readyForPickup(String note) {
        require(PurchaseStatus.DELIVERED, "Do odbioru przygotować można tylko zamówienie dostarczone (DELIVERED)");
        this.status = PurchaseStatus.READY_FOR_PICKUP;
        keepNote(note);
    }

    /** READY_FOR_PICKUP → RECEIVED. Valid only after the item has been assigned to the member. */
    public void receive(String note) {
        require(PurchaseStatus.READY_FOR_PICKUP, "Odebrać można tylko zamówienie do odbioru (READY_FOR_PICKUP)");
        this.status = PurchaseStatus.RECEIVED;
        this.receivedAt = LocalDateTime.now();
        keepNote(note);
    }

    public void cancel(String note) {
        if (!CANCELLABLE.contains(status)) {
            throw new IllegalStateException(
                    "Anulować można tylko zamówienie przed dostawą (REQUESTED/SENT/IN_PROGRESS)");
        }
        this.status = PurchaseStatus.CANCELLED;
        keepNote(note);
    }

    /** True while the purchase still expects action (drives the "open" list filter). */
    public boolean isOpen() {
        return status != PurchaseStatus.RECEIVED && status != PurchaseStatus.CANCELLED;
    }

    private void keepNote(String note) {
        String trimmed = blankToNull(note);
        if (trimmed != null) {
            this.resolutionNote = trimmed;
        }
    }

    private void require(PurchaseStatus expected, String message) {
        if (status != expected) {
            throw new IllegalStateException(message);
        }
    }

    private static String requireNotBlank(String value, String message) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException(message);
        }
        return trimmed;
    }

    private static String blankToNull(String value) {
        String trimmed = value == null ? null : value.trim();
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }
}
