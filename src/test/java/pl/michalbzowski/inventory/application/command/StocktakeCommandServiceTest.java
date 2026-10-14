package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.FoundState;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.Stocktake;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLine;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeStatus;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Stocktake use-cases with mocked repositories/roster: snapshot composition,
 * ACTIVE-member counting validation (B10 live roster), editability window
 * (IN_PROGRESS only) and the duplicate-extra rule.
 */
class StocktakeCommandServiceTest {

    private InventoryItemRepository items;
    private StocktakeRepository stocktakes;
    private StocktakeLineRepository lines;
    private BandDirectory directory;
    private StocktakeCommandService service;

    @BeforeEach
    void setUp() {
        items = mock(InventoryItemRepository.class);
        stocktakes = mock(StocktakeRepository.class);
        lines = mock(StocktakeLineRepository.class);
        directory = mock(BandDirectory.class);
        service = new StocktakeCommandService(items, stocktakes, lines, directory);
        when(stocktakes.save(any(Stocktake.class))).thenAnswer(inv -> inv.getArgument(0));
        when(lines.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        when(lines.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private InventoryItem instrument(String name, ItemLifecycleStatus status) {
        InventoryItem item = InventoryItem.create(7L, name, ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        item.setId((long) name.hashCode());
        item.setLifecycleStatus(status);
        return item;
    }

    private void persistStocktake(Stocktake stocktake) {
        when(stocktakes.findById(anyLong())).thenReturn(Optional.of(stocktake));
    }

    private Stocktake running() {
        return running(1L);
    }

    private Stocktake running(long id) {
        Stocktake stocktake = Stocktake.start(7L, "sub", null);
        stocktake.setId(id);
        return stocktake;
    }

    @Test
    void startSnapshotsGivenItemsAndPersistsInProgress() {
        when(items.findAll(any(org.springframework.data.jpa.domain.Specification.class)))
                .thenReturn(List.of(
                        instrument("Flet", ItemLifecycleStatus.AVAILABLE),
                        instrument("Tuba", ItemLifecycleStatus.ASSIGNED)));

        Stocktake stocktake = service.start("tok", 7L, "sub-1", null, null, null, "spis wstępny");

        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.IN_PROGRESS);
        ArgumentCaptor<List<StocktakeLine>> captor = ArgumentCaptor.forClass(List.class);
        verify(lines).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(2);
        assertThat(captor.getValue()).extracting(StocktakeLine::getFoundState).containsOnlyNulls();
    }

    @Test
    void countValidatesActiveRosterMember() {
        Stocktake stocktake = running();
        persistStocktake(stocktake);
        StocktakeLine line = StocktakeLine.expected(stocktake, instrument("Flet", ItemLifecycleStatus.AVAILABLE));
        when(lines.findById(anyLong())).thenReturn(Optional.of(line));
        when(directory.members(anyString(), anyLong()))
                .thenReturn(List.of(new BandMember(11L, "Jan", "Kowalski", true),
                        new BandMember(13L, "Stefan", "Stary", false)));

        service.count("tok", 1L, 5L, FoundState.OK, null, 11L);

        assertThat(line.getFoundState()).isEqualTo(FoundState.OK);
        assertThat(line.getCountedByMemberName()).isEqualTo("Jan Kowalski");

        assertThatThrownBy(() -> service.count("tok", 1L, 5L, FoundState.OK, null, 13L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nieaktywny");
        assertThatThrownBy(() -> service.count("tok", 1L, 5L, FoundState.OK, null, 999L))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void countOnPausedStocktakeIsRejectedBeforeRosterCall() {
        Stocktake stocktake = running();
        stocktake.pause();
        persistStocktake(stocktake);

        assertThatThrownBy(() -> service.count("tok", 1L, 5L, FoundState.OK, null, 11L))
                .isInstanceOf(IllegalStateException.class);
        verify(directory, never()).members(anyString(), anyLong());
    }

    @Test
    void countOnClosedStocktakeIsRejected() {
        Stocktake stocktake = running();
        stocktake.close();
        persistStocktake(stocktake);

        assertThatThrownBy(() -> service.count("tok", 1L, 5L, FoundState.OK, null, 11L))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void lineOfAnotherStocktakeIsNotFound() {
        persistStocktake(running());
        StocktakeLine foreign = StocktakeLine.expected(running(2L),
                instrument("Flet", ItemLifecycleStatus.AVAILABLE));
        when(lines.findById(5L)).thenReturn(Optional.of(foreign));

        assertThatThrownBy(() -> service.count("tok", 1L, 5L, FoundState.OK, null, 11L))
                .isInstanceOf(StocktakeLineNotFoundException.class);
    }

    @Test
    void extraUnitFromForeignBandOrDuplicateIsRejected() {
        Stocktake stocktake = running();
        persistStocktake(stocktake);
        when(directory.members(anyString(), anyLong()))
                .thenReturn(List.of(new BandMember(11L, "Jan", "Kowalski", true)));

        InventoryItem foreign = InventoryItem.create(3L, "Obój bandu 3", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        foreign.setId(70L);
        when(items.findById(70L)).thenReturn(Optional.of(foreign));
        assertThatThrownBy(() -> service.addExtra("tok", 1L, 70L, null, 11L))
                .isInstanceOf(IllegalArgumentException.class);

        InventoryItem sameBand = instrument("Flet", ItemLifecycleStatus.AVAILABLE);
        when(items.findById(sameBand.getId())).thenReturn(Optional.of(sameBand));
        when(lines.existsByStocktake_IdAndItem_Id(1L, sameBand.getId())).thenReturn(true);
        assertThatThrownBy(() -> service.addExtra("tok", 1L, sameBand.getId(), null, 11L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("już");
    }

    @Test
    void closeIsSingleShotAndDoubleCloseRejected() {
        Stocktake stocktake = running();
        persistStocktake(stocktake);

        service.close("tok", 1L);
        assertThat(stocktake.getStatus()).isEqualTo(StocktakeStatus.CLOSED);
        assertThat(stocktake.getFinishedAt()).isNotNull();

        assertThatThrownBy(() -> service.close("tok", 1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("IN_PROGRESS");
    }

    @Test
    void startRejectedWhileAnotherStocktakeIsStillOpen() {
        // Hub/join/report semantics require at most one editable stocktake per band.
        when(stocktakes.existsByBandIdAndStatusIn(anyLong(), any())).thenReturn(true);

        assertThatThrownBy(() -> service.start("tok", 7L, "subj", null, null, null, "drugi"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("spis");
        verify(stocktakes, never()).save(any());
    }
}
