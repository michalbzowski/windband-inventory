package pl.michalbzowski.inventory.domain.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Pure domain rules of the stocktake module (analysis 3.2, spec F5/B7):
 * start is immediately IN_PROGRESS, pause/resume only between DRAFT and
 * IN_PROGRESS, close ONLY from IN_PROGRESS (double-close rejected), counting
 * vocabulary (EXTRA is reserved for added units) and the snapshot line fields.
 */
class StocktakeTransitionTest {

    private InventoryItem instrument(String name) {
        InventoryItem item = InventoryItem.create(7L, name, ItemType.INSTRUMENT,
                WarehouseType.MAIN, "SER-" + name.length(), null, null);
        item.setId(400L + name.hashCode() % 50);
        return item;
    }

    private Stocktake started() {
        return Stocktake.start(7L, "kc-sub-1", "spis roczny");
    }

    @Test
    void startIsInProgressRightAway() {
        Stocktake stocktake = started();

        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.IN_PROGRESS);
        assertThat(stocktake.getBandId()).isEqualTo(7L);
        assertThat(stocktake.getStartedBySubject()).isEqualTo("kc-sub-1");
        assertThat(stocktake.getNotes()).isEqualTo("spis roczny");
        assertThat(stocktake.getStartedAt()).isNotNull();
        assertThat(stocktake.getFinishedAt()).isNull();
    }

    @Test
    void pauseAndResumeCycle() {
        Stocktake stocktake = started();

        stocktake.pause();
        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.DRAFT);

        stocktake.resume();
        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.IN_PROGRESS);
    }

    @Test
    void pauseOfPausedStocktakeIsRejected() {
        Stocktake stocktake = started();
        stocktake.pause();

        assertThatThrownBy(stocktake::pause)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("IN_PROGRESS");
    }

    @Test
    void resumeOfRunningStocktakeIsRejected() {
        assertThatThrownBy(started()::resume)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void closeOnlyFromInProgressAndDoubleCloseRejected() {
        Stocktake stocktake = started();

        stocktake.close();

        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.CLOSED);
        assertThat(stocktake.getFinishedAt()).isNotNull();
        assertThatThrownBy(stocktake::close)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("IN_PROGRESS");
    }

    @Test
    void pausedStocktakeMustBeResumedBeforeClose() {
        Stocktake stocktake = started();
        stocktake.pause();

        assertThatThrownBy(stocktake::close)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void editableWindowCoversOnlyInProgress() {
        Stocktake paused = started();
        paused.pause();
        assertThatThrownBy(paused::requireEditable)
                .isInstanceOf(IllegalStateException.class);

        Stocktake closed = started();
        closed.close();
        assertThatThrownBy(closed::requireEditable)
                .isInstanceOf(IllegalStateException.class);

        started().requireEditable(); // no throw
    }

    @Test
    void expectedLineSnapshotsDisplayFieldsAndExpectedStatus() {
        InventoryItem item = instrument("Flet");
        item.assignTo(11L, "Jan Kowalski");

        StocktakeLine line = StocktakeLine.expected(started(), item);

        assertThat(line.getItemId()).isEqualTo(item.getId());
        assertThat(line.getBandId()).isEqualTo(7L);
        assertThat(line.getName()).isEqualTo("Flet");
        assertThat(line.getSerialNumber()).isEqualTo(item.getSerialNumber());
        assertThat(line.getAssignedMemberName()).isEqualTo("Jan Kowalski");
        assertThat(line.getExpectedStatus()).isEqualTo(ItemLifecycleStatus.ASSIGNED);
        assertThat(line.getFoundState()).isNull();
        assertThat(line.isExtra()).isFalse();
    }

    @Test
    void countAsStoresStateNoteAndCounterSnapshot() {
        StocktakeLine line = StocktakeLine.expected(started(), instrument("Obój"));

        line.countAs(FoundState.BROKEN, " pęknięta kamerton ", 12L, "Anna Nowak");

        assertThat(line.getFoundState()).isEqualTo(FoundState.BROKEN);
        assertThat(line.getNote()).isEqualTo("pęknięta kamerton");
        assertThat(line.getCountedByMemberId()).isEqualTo(12L);
        assertThat(line.getCountedByMemberName()).isEqualTo("Anna Nowak");
        assertThat(line.getCountedAt()).isNotNull();
    }

    @Test
    void countAsCanBeCorrectedUntilParentCloses() {
        StocktakeLine line = StocktakeLine.expected(started(), instrument("Tuba"));
        line.countAs(FoundState.MISSING, null, 11L, "Jan Kowalski");

        line.countAs(FoundState.OK, "była na haczyku", 11L, "Jan Kowalski");

        assertThat(line.getFoundState()).isEqualTo(FoundState.OK);
        assertThat(line.getNote()).isEqualTo("była na haczyku");
    }

    @Test
    void extraVocabularyIsReservedForAddedUnits() {
        StocktakeLine line = StocktakeLine.expected(started(), instrument("Kotły"));

        assertThatThrownBy(() -> line.countAs(FoundState.EXTRA, null, 11L, "Jan Kowalski"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> line.countAs(null, null, 11L, "Jan Kowalski"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void addedExtraUnitCarriesNoExpectationAndCountsImmediately() {
        InventoryItem lost = instrument("Marimba");
        lost.assignTo(11L, "Jan Kowalski");
        lost.unassign(ItemLifecycleStatus.LOST);

        StocktakeLine line = StocktakeLine.addedExtra(started(), lost, 12L, "Anna Nowak", "znalezione na próbie");

        assertThat(line.getExpectedStatus()).isNull();
        assertThat(line.getFoundState()).isEqualTo(FoundState.EXTRA);
        assertThat(line.isExtra()).isTrue();
        assertThat(line.getCountedByMemberName()).isEqualTo("Anna Nowak");
        assertThat(line.getAssignedMemberName()).isNull();
    }
}
