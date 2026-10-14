package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One service-workflow record (F4, analysis §4 item 2): opened by
 * {@code sendToService} (or by a return straight into IN_SERVICE) and closed
 * by {@code completeService}. While {@code completedAt} is NULL it is the
 * ACTIVE service of the item (DB partial-unique index uq_item_service_events_open).
 *
 * <p>Rows are evidence — never deleted — and mirror the assignment-history
 * pattern. {@code bandId} is denormalized from the item (B1 scoping);
 * {@code nextServiceDate} on close records the planned date passed to
 * {@code completeService} (audit of "why this date" without rewriting the item).
 */
@Entity
@Table(name = "item_service_events")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemServiceEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    @Column(name = "sent_note", columnDefinition = "TEXT")
    private String sentNote;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "completed_note", columnDefinition = "TEXT")
    private String completedNote;

    @Column(name = "next_service_date")
    private LocalDate nextServiceDate;

    /** Opens the service event for an already-persisted, IN_SERVICE-bound item. */
    public static ItemServiceEvent open(InventoryItem item, String note) {
        Objects.requireNonNull(item, "item required");
        ItemServiceEvent event = new ItemServiceEvent();
        event.bandId = item.getBandId();
        event.item = item;
        event.sentAt = LocalDateTime.now();
        event.sentNote = note;
        return event;
    }

    /** Closes the event; idempotent guard — a closed row never reopens (evidence). */
    public void complete(String note, LocalDate nextServiceDate) {
        if (completedAt != null) {
            throw new IllegalStateException("Zdarzenie serwisowe jest już zamknięte");
        }
        this.completedAt = LocalDateTime.now();
        this.completedNote = note;
        this.nextServiceDate = nextServiceDate;
    }
}
