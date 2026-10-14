package pl.michalbzowski.inventory.domain.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * Pure domain rules of assignment/return (analysis 3.1): legal source
 * states, snapshot bookkeeping and the closed vocabulary of return states.
 */
class AssignmentTransitionTest {

    private InventoryItem availableItem() {
        return InventoryItem.create(7L, "Flet", ItemType.INSTRUMENT,
                WarehouseType.MAIN, "SER-1", null, null);
    }

    @Test
    void assignFromAvailableSetsSnapshotAndAssignedStatus() {
        InventoryItem item = availableItem();

        item.assignTo(11L, "Jan Kowalski");

        assertThat(item.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.ASSIGNED);
        assertThat(item.getAssignedMemberId()).isEqualTo(11L);
        assertThat(item.getAssignedMemberName()).isEqualTo("Jan Kowalski");
    }

    @Test
    void assignTwiceIsRejected() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");

        assertThatThrownBy(() -> item.assignTo(12L, "Anna Nowak"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("AVAILABLE");
    }

    @Test
    void unassignOfNonAssignedItemIsRejected() {
        InventoryItem item = availableItem();

        assertThatThrownBy(() -> item.unassign(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ASSIGNED");
    }

    @Test
    void returnWithoutStateGoesBackToAvailableAndClearsSnapshot() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");

        item.unassign(null);

        assertThat(item.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.AVAILABLE);
        assertThat(item.getAssignedMemberId()).isNull();
        assertThat(item.getAssignedMemberName()).isNull();
    }

    @Test
    void damagedReturnGoesToServiceAndLostReturnStaysLost() {
        InventoryItem damaged = availableItem();
        damaged.assignTo(11L, "Jan Kowalski");
        damaged.unassign(ItemLifecycleStatus.IN_SERVICE);
        assertThat(damaged.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.IN_SERVICE);

        InventoryItem lost = availableItem();
        lost.assignTo(11L, "Jan Kowalski");
        lost.unassign(ItemLifecycleStatus.LOST);
        assertThat(lost.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.LOST);
    }

    @Test
    void returningIntoRetiredOrDisposedLiesAndIsRejected() {
        InventoryItem item = availableItem();
        item.assignTo(11L, "Jan Kowalski");

        assertThatThrownBy(() -> item.unassign(ItemLifecycleStatus.RETIRED))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("AVAILABLE, IN_SERVICE lub LOST");
    }
}
