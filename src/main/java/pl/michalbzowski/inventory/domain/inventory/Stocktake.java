package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One physical-count run of a band (analysis 3.2, spec F5/B7/B8).
 *
 * <p>Start snapshots the band's AVAILABLE/ASSIGNED items into
 * {@link StocktakeLine}s and the status is IN_PROGRESS right away; DRAFT is
 * the paused state (F5.3 "pause/resume"), CLOSED is terminal. Close is
 * allowed ONLY from IN_PROGRESS — the double-close rejection the frozen
 * spec calls out lives here, on the aggregate, not in the controller.
 *
 * <p>{@code startedBySubject} is the Keycloak subject of the ADMIN who
 * opened the stocktake. WM's integration API deliberately has no
 * member↔user mapping (band members need no accounts), so no member id is
 * claimed here — counters are validated roster members instead (B10).
 */
@Entity
@Table(name = "stocktakes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Stocktake {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StocktakeStatus status;

    @Column(name = "started_by_subject")
    private String startedBySubject;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    public static Stocktake start(long bandId, String startedBySubject, String notes) {
        Objects.requireNonNull(startedBySubject, "startedBySubject");
        Stocktake stocktake = new Stocktake();
        stocktake.bandId = bandId;
        stocktake.status = StocktakeStatus.IN_PROGRESS;
        stocktake.startedBySubject = startedBySubject.trim();
        stocktake.notes = blankToNull(notes);
        stocktake.startedAt = LocalDateTime.now();
        return stocktake;
    }

    /** Pause: an offline counting session halts; lines freeze until resume. */
    public void pause() {
        requireStatus(StocktakeStatus.IN_PROGRESS, "Pauzować można tylko spis w toku (IN_PROGRESS)");
        status = StocktakeStatus.DRAFT;
    }

    public void resume() {
        requireStatus(StocktakeStatus.DRAFT, "Wznawiamy tylko spis spauzowany (DRAFT)");
        status = StocktakeStatus.IN_PROGRESS;
    }

    /** Terminal close — the ONLY legal transition is IN_PROGRESS → CLOSED. */
    public void close() {
        requireStatus(StocktakeStatus.IN_PROGRESS,
                "Zamknąć można tylko spis w toku (IN_PROGRESS) — podwójne zamknięcie odrzucone");
        status = StocktakeStatus.CLOSED;
        finishedAt = LocalDateTime.now();
    }

    /** Counting/additional-unit writes are accepted only while IN_PROGRESS. */
    public void requireEditable() {
        requireStatus(StocktakeStatus.IN_PROGRESS,
                "Spis w statusie " + status + " nie przyjmuje zmian — liczyć można tylko w toku (IN_PROGRESS)");
    }

    private void requireStatus(StocktakeStatus expected, String message) {
        if (status != expected) {
            throw new IllegalStateException(message);
        }
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
