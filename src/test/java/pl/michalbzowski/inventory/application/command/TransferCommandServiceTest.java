package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransfer;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Transfer use-case with mocked repositories: item move + history row are a
 * pair (single transaction), conflicts abort BEFORE any write, and the
 * history captures the warehouse the item actually left.
 */
class TransferCommandServiceTest {

    private InventoryItemRepository items;
    private WarehouseTransferRepository transfers;
    private TransferCommandService service;
    private InventoryItem item;

    @BeforeEach
    void setUp() {
        items = mock(InventoryItemRepository.class);
        transfers = mock(WarehouseTransferRepository.class);
        service = new TransferCommandService(items, transfers);
        item = InventoryItem.create(7L, "Puzon", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        when(items.findById(anyLong())).thenReturn(Optional.of(item));
    }

    @Test
    void transferMovesItemAndWritesHistoryFromTheOldWarehouse() {
        InventoryItem result = service.transfer(1L, WarehouseType.SERVICE, "do przeglądu");

        assertThat(result.getWarehouse()).isEqualTo(WarehouseType.SERVICE);
        ArgumentCaptor<WarehouseTransfer> captor = ArgumentCaptor.forClass(WarehouseTransfer.class);
        verify(transfers).save(captor.capture());
        WarehouseTransfer saved = captor.getValue();
        assertThat(saved.getFromWarehouse()).isEqualTo(WarehouseType.MAIN);
        assertThat(saved.getToWarehouse()).isEqualTo(WarehouseType.SERVICE);
        assertThat(saved.getBandId()).isEqualTo(7L);
        assertThat(saved.getItem()).isSameAs(item);
        assertThat(saved.getNote()).isEqualTo("do przeglądu");
    }

    @Test
    void unknownItemIsNotFoundBeforeAnyWrite() {
        when(items.findById(anyLong())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.transfer(99L, WarehouseType.SERVICE, null))
                .isInstanceOf(ItemNotFoundException.class);
        verify(transfers, never()).save(any());
    }

    @Test
    void sameWarehouseRejectsWithoutWrites() {
        assertThatThrownBy(() -> service.transfer(1L, WarehouseType.MAIN, null))
                .isInstanceOf(IllegalArgumentException.class);

        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
        verify(transfers, never()).save(any());
    }

    @Test
    void assignedItemConflictAbortsBeforeWrite() {
        item.assignTo(11L, "Jan Kowalski");

        assertThatThrownBy(() -> service.transfer(1L, WarehouseType.ARCHIVE, null))
                .isInstanceOf(IllegalStateException.class);

        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
        verify(transfers, never()).save(any());
    }

    @Test
    void disposedItemConflictAbortsBeforeWrite() {
        item.setLifecycleStatus(ItemLifecycleStatus.DISPOSED);

        assertThatThrownBy(() -> service.transfer(1L, WarehouseType.ARCHIVE, null))
                .isInstanceOf(IllegalStateException.class);
        verify(transfers, never()).save(any());
    }
}
