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
import java.util.EnumSet;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One line of a stocktake = one PHYSICAL unit (D1: no "item kind" entity,
 * attributes define the variant; F5.2 "1 row per physical unit").
 *
 * <p>Snapshot lines carry the item's display fields (name/serial/assignee)
 * copied at start so the mobile card and the frozen report never depend on
 * live item data (the same snapshot philosophy as assignment history).
 * EXTRA units (F5: nadwyżka) are added later via {@link #addedExtra} and
 * carry no expectation. A line can be recounted (correction) until the
 * parent stocktake closes — the LAST count is authoritative.
 *
 * <p>{@code countedByMemberId}/{@code countedByMemberName}: WM exposes no
 * member↔user mapping, so the SPA sends the roster member doing the count
 * and the service re-validates it against the LIVE roster each write (B10).
 */
@Entity
@Table(name = "stocktake_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StocktakeLine {

    private static final EnumSet<FoundState> SNAPSHOT_STATES =
            EnumSet.of(FoundState.OK, FoundState.BROKEN, FoundState.MISSING);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "stocktake_id", nullable = false)
    private Stocktake stocktake;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    @Column(nullable = false)
    private String name;

    @Column(name = "serial_number")
    private String serialNumber;

    @Column(name = "assigned_member_name")
    private String assignedMemberName;

    @Enumerated(EnumType.STRING)
    @Column(name = "expected_status")
    private ItemLifecycleStatus expectedStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "found_state")
    private FoundState foundState;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "counted_by_member_id")
    private Long countedByMemberId;

    @Column(name = "counted_by_member_name")
    private String countedByMemberName;

    @Column(name = "counted_at")
    private LocalDateTime countedAt;

    /** Expected row from the start snapshot — not counted yet. */
    public static StocktakeLine expected(Stocktake stocktake, InventoryItem item) {
        Objects.requireNonNull(item.getId(), "item id");
        StocktakeLine line = new StocktakeLine();
        line.stocktake = stocktake;
        line.bandId = stocktake.getBandId();
        line.item = item;
        line.name = item.getName();
        line.serialNumber = item.getSerialNumber();
        line.assignedMemberName = item.getAssignedMemberName();
        line.expectedStatus = item.getLifecycleStatus();
        return line;
    }

    /** Nadwyżka: a unit outside the snapshot, recorded as found immediately. */
    public static StocktakeLine addedExtra(Stocktake stocktake, InventoryItem item,
            long countedByMemberId, String countedByMemberName, String note) {
        Objects.requireNonNull(item.getId(), "item id");
        StocktakeLine line = new StocktakeLine();
        line.stocktake = stocktake;
        line.bandId = stocktake.getBandId();
        line.item = item;
        line.name = item.getName();
        line.serialNumber = item.getSerialNumber();
        line.expectedStatus = null; // never expected
        line.foundState = FoundState.EXTRA;
        line.note = blankToNull(note);
        line.countedByMemberId = countedByMemberId;
        line.countedByMemberName = countedByMemberName;
        line.countedAt = LocalDateTime.now();
        return line;
    }

    /**
     * (Re)count a snapshot line. EXTRA is reserved for added units — using it
     * here would forge a "found something we did not expect" on an expected
     * row. Re-counts overwrite: the last word of the counter wins (F5.3
     * offline corrections before close).
     */
    public void countAs(FoundState state, String note, long countedByMemberId, String countedByMemberName) {
        if (state == null || !SNAPSHOT_STATES.contains(state)) {
            throw new IllegalArgumentException(
                    "Pozycję ze spisu można oznaczyć tylko OK / BROKEN / MISSING — "
                            + "EXTRA jest zarezerwowane dla dopisanych jednostek");
        }
        this.foundState = state;
        this.note = blankToNull(note);
        this.countedByMemberId = countedByMemberId;
        this.countedByMemberName = countedByMemberName;
        this.countedAt = LocalDateTime.now();
    }

    /** Extra unit ⟺ no expectation. */
    public boolean isExtra() {
        return expectedStatus == null;
    }

    public Long getItemId() {
        return item == null ? null : item.getId();
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
