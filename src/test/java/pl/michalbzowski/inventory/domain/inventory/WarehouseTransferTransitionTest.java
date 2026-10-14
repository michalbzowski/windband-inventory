package pl.michalbzowski.inventory.domain.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Pure domain rules of warehouse movement (analysis 3.1 / decision B6):
 * which lifecycle states may change warehouse, the no-op rejection and the
 * history-row factory. Item edit ({@code replaceDetails}) must NOT smuggle a
 * warehouse change past the transfer log.
 */
class WarehouseTransferTransitionTest {

    private InventoryItem availableItem() {
        return InventoryItem.create(7L, "Fagot", ItemType.INSTRUMENT,
                WarehouseType.MAIN, "SER-9", null, null);
    }

    @Test
    void moveToChangesWarehouse() {
        InventoryItem item = availableItem();

        item.moveTo(WarehouseType.SERVICE);

        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.SERVICE);
    }

    @Test
    void moveToSameWarehouseIsRejected() {
        InventoryItem item = availableItem();

        assertThatThrownBy(() -> item.moveTo(WarehouseType.MAIN))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("MAIN");
    }

    @Test
    void moveToNullIsRejected() {
        InventoryItem item = availableItem();

        assertThatThrownBy(() -> item.moveTo(null))
                .isInstanceOf(NullPointerException.class);
        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
    }

    @Test
    void assignedItemCannotMove() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");

        assertThatThrownBy(() -> item.moveTo(WarehouseType.ARCHIVE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ASSIGNED");
        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
    }

    @Test
    void lostItemCannotMove() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");
        item.unassign(ItemLifecycleStatus.LOST);

        assertThatThrownBy(() -> item.moveTo(WarehouseType.SERVICE))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("LOST");
    }

    @Test
    void disposedItemCannotMove() {
        InventoryItem item = availableItem();
        item.setLifecycleStatus(ItemLifecycleStatus.DISPOSED);

        assertThatThrownBy(() -> item.moveTo(WarehouseType.ARCHIVE))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void retiredItemArchivingIsAllowed() {
        InventoryItem item = availableItem();
        item.setLifecycleStatus(ItemLifecycleStatus.RETIRED);

        item.moveTo(WarehouseType.ARCHIVE);

        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.ARCHIVE);
    }

    @Test
    void inServiceItemMovesBackFromServiceRoom() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");
        item.unassign(ItemLifecycleStatus.IN_SERVICE);
        item.setWarehouse(WarehouseType.SERVICE);

        item.moveTo(WarehouseType.MAIN);

        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
    }

    @Test
    void recordFactoryCapturesMoveAndTrimsNote() {
        InventoryItem item = availableItem();
        item.moveTo(WarehouseType.SERVICE);

        WarehouseTransfer transfer = WarehouseTransfer.record(item, WarehouseType.MAIN,
                WarehouseType.SERVICE, "  do stroiciela  ");

        assertThat(transfer.getBandId()).isEqualTo(7L);
        assertThat(transfer.getItem()).isSameAs(item);
        assertThat(transfer.getFromWarehouse()).isEqualTo(WarehouseType.MAIN);
        assertThat(transfer.getToWarehouse()).isEqualTo(WarehouseType.SERVICE);
        assertThat(transfer.getNote()).isEqualTo("do stroiciela");
        assertThat(transfer.getTransferredAt()).isNotNull();
    }

    @Test
    void recordWithBlankNoteStoresNull() {
        InventoryItem item = availableItem();

        WarehouseTransfer transfer = WarehouseTransfer.record(item, WarehouseType.MAIN,
                WarehouseType.ARCHIVE, "   ");

        assertThat(transfer.getNote()).isNull();
    }

    @Test
    void recordFromSameToWarehouseIsRejected() {
        InventoryItem item = availableItem();

        assertThatThrownBy(() -> WarehouseTransfer.record(item, WarehouseType.MAIN,
                WarehouseType.MAIN, null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void replaceDetailsRefusesWarehouseChange() {
        InventoryItem item = availableItem();

        assertThatThrownBy(() -> item.replaceDetails("Fagot II", WarehouseType.ARCHIVE,
                "SER-9", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("transfer");
        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
    }

    @Test
    void replaceDetailsAcceptsUnchangedOrAbsentWarehouse() {
        InventoryItem item = availableItem();

        item.replaceDetails("Fagot II", WarehouseType.MAIN, "SER-9", null, null);
        item.replaceDetails("Fagot III", null, "SER-9", "opis", "notka");

        assertThat(item.getName()).isEqualTo("Fagot III");
        assertThat(item.getWarehouse()).isEqualTo(WarehouseType.MAIN);
    }
}
