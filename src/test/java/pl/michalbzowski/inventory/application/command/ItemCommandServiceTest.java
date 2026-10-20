package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

@ExtendWith(MockitoExtension.class)
class ItemCommandServiceTest {

    @Mock
    private InventoryItemRepository items;

    @Mock
    private AttributeScopeValidator scopeValidator;

    @Mock
    private ItemSerialAllocator serials;

    @Mock
    private ItemAssignmentRepository assignments;

    @Mock
    private ItemServiceEventRepository serviceEvents;

    @Mock
    private WarehouseTransferRepository warehouseTransfers;

    @Mock
    private pl.michalbzowski.inventory.domain.inventory.InventoryNeedRepository needs;

    @Mock
    private pl.michalbzowski.inventory.domain.inventory.OwnershipDeclarationRepository declarations;

    @Mock
    private StocktakeLineRepository stocktakeLines;
    @Mock
    private ServiceJobRepository serviceJobs;

    @Mock
    private pl.michalbzowski.inventory.domain.inventory.PurchaseRequestRepository purchases;

    @InjectMocks
    private ItemCommandService service;

    @Test
    void rejectsTakenSerialNumber() {
        InventoryItem taken = InventoryItem.create(7L, "Inna", ItemType.UNIFORM, null,
                "SN-1", null, null);
        taken.setId(55L);
        when(items.findByBandIdAndSerialNumber(7L, "SN-1")).thenReturn(Optional.of(taken));

        assertThatThrownBy(() -> service.create(7L, new ItemWriteCommand("Nowa", ItemType.UNIFORM,
                null, "SN-1", null, null, List.of())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("zajęty");
    }

    @Test
    void deleteBlockedWhenTransferHistoryExists() {
        InventoryItem item = InventoryItem.create(7L, "Flet", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        when(items.findById(1L)).thenReturn(Optional.of(item));
        when(warehouseTransfers.existsByItemId(1L)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("histori");
        verify(items, never()).delete(item);
    }

    @Test
    void deleteBlockedWhenClosedAssignmentHistoryExists() {
        InventoryItem item = InventoryItem.create(7L, "Flet", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        item.assignTo(11L, "Jan Kowalski");
        item.unassign(null); // snapshot cleared, but history row remains
        when(items.findById(1L)).thenReturn(Optional.of(item));
        when(assignments.existsByItemId(1L)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(1L))
                .isInstanceOf(IllegalStateException.class);
        verify(items, never()).delete(item);
    }

    @Test
    void deleteOfFreshItemWithoutHistoryPasses() {
        InventoryItem item = InventoryItem.create(7L, "Flet", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        when(items.findById(1L)).thenReturn(Optional.of(item));

        service.delete(1L);

        verify(items).delete(item);
    }

    @Test
    void deleteBlockedWhenStocktakeEvidenceExists() {
        InventoryItem item = InventoryItem.create(7L, "Flet", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        when(items.findById(1L)).thenReturn(Optional.of(item));
        when(stocktakeLines.existsByItem_Id(1L)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(1L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("spisy");
        verify(items, never()).delete(item);
    }
}
