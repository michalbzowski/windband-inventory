package pl.michalbzowski.inventory.application.query;

import java.time.LocalDateTime;
import java.util.List;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemSummaryView;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;

/** Read models of the F3 member picture (backlog v1.x item 1). */
public final class MemberPictureViews {

    private MemberPictureViews() {
    }

    /** Full picture per member: expected (WM) vs actual (held) vs gap + history. */
    public record MemberPictureView(long memberId, String memberName, boolean active,
            List<ExpectedItemView> expected, List<ItemSummaryView> actual, int gapCount,
            List<AssignmentHistoryView> history) {
    }

    /** One WM expected-set entry resolved against the held items. */
    public record ExpectedItemView(String instrument, boolean primary, boolean satisfied,
            List<Long> matchedItemIds) {
    }

    /** View-only assignment history (analysis: rows are evidence, never edited). */
    public record AssignmentHistoryView(long id, long itemId, String itemName,
            LocalDateTime assignedAt, LocalDateTime returnedAt,
            ItemLifecycleStatus returnedState, String assignNote, String returnNote) {
    }
}
