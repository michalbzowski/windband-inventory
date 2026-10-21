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
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A need/order (backlog v1.x item 3): something the band is missing and has
 * requested (BRAK action from the stocktake report, B9 unfreeze). The row
 * snapshots the item's name/serial at request time — like stocktake lines —
 * so later edits or archival of the item never rewrite the evidence.
 *
 * <p>Status flow: OPEN → ORDERED → RECEIVED; OPEN/ORDERED → CANCELLED
 * (terminal states never reopen). At most one non-terminal need per item at
 * DB level (partial unique index uq_inventory_needs_open).
 */
@Entity
@Table(name = "inventory_needs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryNeed {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "serial_number", length = 120)
    private String serialNumber;

    @Column(name = "quantity", nullable = false)
    private int quantity;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private NeedStatus status;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "resolution_note", columnDefinition = "TEXT")
    private String resolutionNote;

    @Column(name = "created_member_id")
    private Long createdMemberId;

    @Column(name = "created_member_name", length = 200)
    private String createdMemberName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    /** Records a new need; identity/name/serial are snapshots from the item (B1 scoping). */
    public static InventoryNeed request(InventoryItem item, int quantity, String note,
            Long createdMemberId, String createdMemberName) {
        Objects.requireNonNull(item, "item required");
        if (quantity < 1) {
            throw new IllegalArgumentException("Ilość musi być większa niż zero");
        }
        InventoryNeed need = new InventoryNeed();
        need.bandId = item.getBandId();
        need.item = item;
        need.name = item.getName();
        need.serialNumber = item.getSerialNumber();
        need.quantity = quantity;
        need.status = NeedStatus.OPEN;
        need.note = note;
        need.createdMemberId = createdMemberId;
        need.createdMemberName = createdMemberName;
        need.createdAt = LocalDateTime.now();
        return need;
    }

    public void order(String note) {
        require(NeedStatus.OPEN, "Zamówić można tylko potrzebę otwartą (OPEN)");
        this.status = NeedStatus.ORDERED;
        keepNote(note);
    }

    public void receive(String note) {
        require(NeedStatus.ORDERED, "Odebrać można tylko potrzebę zamówioną (ORDERED)");
        this.status = NeedStatus.RECEIVED;
        keepNote(note);
        this.resolvedAt = LocalDateTime.now();
    }

    public void cancel(String note) {
        if (status != NeedStatus.OPEN && status != NeedStatus.ORDERED) {
            throw new IllegalStateException("Anulować można tylko potrzebę otwartą lub zamówioną");
        }
        this.status = NeedStatus.CANCELLED;
        keepNote(note);
        this.resolvedAt = LocalDateTime.now();
    }

    public boolean isOpen() {
        return status == NeedStatus.OPEN || status == NeedStatus.ORDERED;
    }

    /** A later blank note never erases earlier evidence (e.g. order remark survives receipt). */
    private void keepNote(String note) {
        if (note != null && !note.isBlank()) {
            this.resolutionNote = note;
        }
    }

    private void require(NeedStatus expected, String message) {
        if (status != expected) {
            throw new IllegalStateException(message + " — obecny status: " + status);
        }
    }
}
