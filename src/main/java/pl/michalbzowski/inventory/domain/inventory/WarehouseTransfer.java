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
 * One warehouse-movement event (decision B6: MAIN/SERVICE/ARCHIVE +
 * {@code WarehouseTransfer} history). Rows are append-only evidence — the
 * current location of an item lives on {@link InventoryItem#moveTo}.
 *
 * <p>Mirrors the {@link ItemAssignment} pairing rule: the item move and this
 * row are written in ONE transaction, so lists can never diverge from the
 * movement log.
 *
 * <p>{@code bandId} is denormalized from the item (B1 scoping — band-filtered
 * lookups without a join); no acting-user id is stored because the B10 WM
 * contract does not expose "who am I" as a member id (same reason assignment
 * history has no performedBy).
 */
@Entity
@Table(name = "warehouse_transfers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WarehouseTransfer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_warehouse", nullable = false, length = 16)
    private WarehouseType fromWarehouse;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_warehouse", nullable = false, length = 16)
    private WarehouseType toWarehouse;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "transferred_at", nullable = false)
    private LocalDateTime transferredAt;

    /** Records a completed move of an already-persisted item. */
    public static WarehouseTransfer record(InventoryItem item, WarehouseType from,
            WarehouseType to, String note) {
        Objects.requireNonNull(item, "item required");
        Objects.requireNonNull(from, "source warehouse required");
        Objects.requireNonNull(to, "target warehouse required");
        if (from == to) {
            throw new IllegalArgumentException("Transfer nie może zaczynać się i kończyć w tym samym magazynie");
        }
        WarehouseTransfer t = new WarehouseTransfer();
        t.bandId = item.getBandId();
        t.item = item;
        t.fromWarehouse = from;
        t.toWarehouse = to;
        t.note = blankToNull(note);
        t.transferredAt = LocalDateTime.now();
        return t;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
