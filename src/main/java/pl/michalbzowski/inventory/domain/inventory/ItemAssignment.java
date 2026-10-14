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
 * One assignment/return record (analysis 3.1: {@code assignTo/unassign} with
 * history — assignedAt, returnedAt, notes, state at return).
 *
 * <p>The row is opened by an ASSIGN and closed by a RETURN; while
 * {@code returnedAt} is NULL it is the ACTIVE assignment of the item (DB
 * partial-unique index uq_assignments_active_item). Historical rows are never
 * deleted — they are the evidence base for member overviews (F3, v1.x).
 *
 * <p>{@code bandId} is denormalized from the item (B1 scoping: every lookup
 * can be band-filtered without a join) and {@code memberName} is a snapshot:
 * WM roster edits must not rewrite history.
 */
@Entity
@Table(name = "item_assignments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemAssignment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    /** WM member id — no FK across the boundary (B1). */
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "member_name", nullable = false)
    private String memberName;

    @Column(name = "assigned_at", nullable = false)
    private LocalDateTime assignedAt;

    @Column(name = "assign_note", columnDefinition = "TEXT")
    private String assignNote;

    @Column(name = "returned_at")
    private LocalDateTime returnedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "returned_state", length = 32)
    private ItemLifecycleStatus returnedState;

    @Column(name = "return_note", columnDefinition = "TEXT")
    private String returnNote;

    /** Opens the assignment for an already-persisted item. */
    public static ItemAssignment open(InventoryItem item, long memberId, String memberName, String note) {
        Objects.requireNonNull(item, "item required");
        Objects.requireNonNull(memberName, "memberName required");
        ItemAssignment a = new ItemAssignment();
        a.bandId = item.getBandId();
        a.item = item;
        a.memberId = memberId;
        a.memberName = memberName;
        a.assignedAt = LocalDateTime.now();
        a.assignNote = blankToNull(note);
        return a;
    }

    /** Records the return: state the item came back in + optional note. */
    public void close(ItemLifecycleStatus returnedState, String note) {
        if (returnedAt != null) {
            throw new IllegalStateException("Ten przydział został już zamknięty");
        }
        this.returnedState = Objects.requireNonNull(returnedState, "returnedState required");
        this.returnedAt = LocalDateTime.now();
        this.returnNote = blankToNull(note);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
