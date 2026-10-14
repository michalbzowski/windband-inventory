package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.FoundState;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.Stocktake;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLine;
import pl.michalbzowski.inventory.domain.inventory.StocktakeStatus;

/**
 * Read models for F5. Mobile card data (name+serial+assignee) comes straight
 * from the line snapshot — zero joins, even after the stocktake is closed.
 */
public final class StocktakeViews {

    private StocktakeViews() {
    }

    public record StocktakeView(long id, long bandId, StocktakeStatus status,
            String startedBySubject, String notes,
            LocalDateTime startedAt, LocalDateTime finishedAt,
            int totalLines, int countedLines) {

        static StocktakeView of(Stocktake s, int totalLines, int countedLines) {
            return new StocktakeView(s.getId(), s.getBandId(), s.getStatus(),
                    s.getStartedBySubject(), s.getNotes(), s.getStartedAt(), s.getFinishedAt(),
                    totalLines, countedLines);
        }
    }

    /** Progress + the 4 B9 report sections as counters (live and frozen). */
    public record StocktakeSummaryView(long id, StocktakeStatus status,
            LocalDateTime startedAt, LocalDateTime finishedAt,
            int total, int counted, int uncounted, int divergences,
            int ok, int missing, int broken, int extra) {

        static StocktakeSummaryView of(Stocktake s, List<StocktakeLine> lines) {
            int total = lines.size();
            int ok = countState(lines, FoundState.OK);
            int missing = countState(lines, FoundState.MISSING);
            int broken = countState(lines, FoundState.BROKEN);
            int extra = countState(lines, FoundState.EXTRA);
            int counted = ok + missing + broken + extra;
            return new StocktakeSummaryView(s.getId(), s.getStatus(),
                    s.getStartedAt(), s.getFinishedAt(),
                    total, counted, total - counted,
                    // divergence = counted as not-OK (F5.3 "liczby rozbieżności live")
                    missing + broken + extra, ok, missing, broken, extra);
        }

        private static int countState(List<StocktakeLine> lines, FoundState state) {
            return (int) lines.stream().filter(l -> l.getFoundState() == state).count();
        }
    }

    public record StocktakeLineView(long id, long itemId, String name, String serialNumber,
            String assignedMemberName, ItemLifecycleStatus expectedStatus, FoundState foundState,
            String note, Long countedByMemberId, String countedByMemberName,
            LocalDateTime countedAt, boolean extra) {

        public static StocktakeLineView of(StocktakeLine l) {
            return new StocktakeLineView(l.getId(), l.getItem().getId(), l.getName(),
                    l.getSerialNumber(), l.getAssignedMemberName(), l.getExpectedStatus(),
                    l.getFoundState(), l.getNote(), l.getCountedByMemberId(),
                    l.getCountedByMemberName(), l.getCountedAt(), l.isExtra());
        }
    }

    /** Snapshot list for the counting screen. */
    public static List<StocktakeLineView> lineViews(List<StocktakeLine> lines) {
        return lines.stream().map(StocktakeLineView::of).toList();
    }

    static int counted(List<StocktakeLine> lines) {
        return (int) lines.stream().filter(l -> l.getFoundState() != null).count();
    }
}
