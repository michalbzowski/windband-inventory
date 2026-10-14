package pl.michalbzowski.inventory.application.query;

import java.util.List;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.MemberNotFoundException;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemSummaryView;
import pl.michalbzowski.inventory.application.query.MemberPictureViews.AssignmentHistoryView;
import pl.michalbzowski.inventory.application.query.MemberPictureViews.ExpectedItemView;
import pl.michalbzowski.inventory.application.query.MemberPictureViews.MemberPictureView;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;

/**
 * F3 (backlog v1.x item 1): the per-member full picture — what WM expects the
 * member to hold ({@code expectedSet}, decision B10) versus what inventory
 * actually has assigned to them, the resulting gap, and the view-only
 * assignment history ({@code item_assignments} rows are evidence, never edited).
 *
 * <p>Expected-vs-held matching is a name heuristic, frozen here so UI and API
 * share one truth: an item satisfies an expected instrument when the trimmed,
 * lower-cased item name equals the instrument or extends it with another word
 * ({@code "Flet"} ← {@code "Flet piccolo"}). No item type filter: uniforms are
 * simply never expected as instruments.
 *
 * <p>Reads only. The roster comes from the live WM port (never cached — B10);
 * a member absent from the band roster is 404, so cross-band ids never leak.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MemberPictureQueryService {

    private static final int HISTORY_LIMIT = 50;

    private final BandDirectory bandDirectory;
    private final ItemQueryService items;
    private final ItemAssignmentRepository assignments;

    /** Full picture for one roster member of one band. */
    public MemberPictureView picture(String bearerToken, long bandId, long memberId) {
        BandMember member = bandDirectory.members(bearerToken, bandId).stream()
                .filter(m -> m.memberId() == memberId)
                .findFirst()
                .orElseThrow(() -> new MemberNotFoundException(memberId));

        List<ItemSummaryView> actual = items.list(bandId, null, ItemLifecycleStatus.ASSIGNED,
                null, null, memberId, null, null);

        List<ExpectedItemView> expected = member.expectedSet().stream()
                .map(e -> {
                    List<Long> matched = actual.stream()
                            .filter(i -> nameMatches(e.instrument(), i.name()))
                            .map(ItemSummaryView::id)
                            .toList();
                    return new ExpectedItemView(e.instrument(), e.primary(), !matched.isEmpty(), matched);
                })
                .toList();
        int gapCount = (int) expected.stream().filter(e -> !e.satisfied()).count();

        List<AssignmentHistoryView> history = assignments
                .findByBandIdAndMemberIdOrderByAssignedAtDesc(bandId, memberId).stream()
                .limit(HISTORY_LIMIT)
                .map(a -> new AssignmentHistoryView(a.getId(), a.getItem().getId(),
                        a.getItem().getName(), a.getAssignedAt(), a.getReturnedAt(),
                        a.getReturnedState(), a.getAssignNote(), a.getReturnNote()))
                .toList();

        return new MemberPictureView(memberId, member.fullName(), member.active(),
                expected, actual, gapCount, history);
    }

    /** Frozen heuristic: "Flet" matches item "Flet" and "Flet piccolo", not "Fletnik". */
    private static boolean nameMatches(String instrument, String itemName) {
        String want = normalize(instrument);
        String have = normalize(itemName);
        return !want.isEmpty() && (have.equals(want) || have.startsWith(want + " "));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
