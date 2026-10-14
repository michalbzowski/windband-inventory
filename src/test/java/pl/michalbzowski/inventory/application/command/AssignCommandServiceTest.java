package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignment;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Assign/return use-case rules with mocked repositories and a mocked WM
 * roster: active-member precondition (role matrix §2), history pairing and
 * state conflicts.
 */
class AssignCommandServiceTest {

    private InventoryItemRepository items;
    private ItemAssignmentRepository assignments;
    private ItemServiceEventRepository serviceEvents;
    private BandDirectory directory;
    private AssignCommandService service;
    private InventoryItem item;

    @BeforeEach
    void setUp() {
        items = mock(InventoryItemRepository.class);
        assignments = mock(ItemAssignmentRepository.class);
        serviceEvents = mock(ItemServiceEventRepository.class);
        directory = mock(BandDirectory.class);
        service = new AssignCommandService(items, assignments, serviceEvents, directory);
        item = InventoryItem.create(7L, "Trąbka", ItemType.INSTRUMENT,
                WarehouseType.MAIN, null, null, null);
        when(items.findById(anyLong())).thenReturn(Optional.of(item));
    }

    private void roster(BandMember... members) {
        when(directory.members(anyString(), eq(7L))).thenReturn(List.of(members));
    }

    @Test
    void assignWritesSnapshotAndOpensHistoryRow() {
        roster(new BandMember(11L, "Jan", "Kowalski", true));

        InventoryItem result = service.assign(1L, "tok", 11L, "na koncert");

        assertThat(result.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.ASSIGNED);
        assertThat(result.getAssignedMemberName()).isEqualTo("Jan Kowalski");
        verify(assignments).save(any(ItemAssignment.class));
    }

    @Test
    void unknownMemberIsRejectedBeforeAnyWrite() {
        roster(new BandMember(11L, "Jan", "Kowalski", true));

        assertThatThrownBy(() -> service.assign(1L, "tok", 999L, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nie należy do tego bandu");
        verify(assignments, never()).save(any());
    }

    @Test
    void inactiveMemberIsRejected() {
        roster(new BandMember(13L, "Stefan", "Stary", false));

        assertThatThrownBy(() -> service.assign(1L, "tok", 13L, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nieaktywny");
        verify(assignments, never()).save(any());
    }

    @Test
    void assignOfAlreadyAssignedItemIsAConflict() {
        roster(new BandMember(11L, "Jan", "Kowalski", true));
        item.assignTo(12L, "Anna Nowak");

        assertThatThrownBy(() -> service.assign(1L, "tok", 11L, null))
                .isInstanceOf(IllegalStateException.class);
        verify(assignments, never()).save(any());
    }

    @Test
    void unassignClosesOpenRowAndReturnsIntoRequestedState() {
        item.assignTo(11L, "Jan Kowalski");
        ItemAssignment open = ItemAssignment.open(item, 11L, "Jan Kowalski", "na koncert");
        when(assignments.findByItemIdAndReturnedAtIsNull(1L)).thenReturn(Optional.of(open));

        service.unassign(1L, ItemLifecycleStatus.IN_SERVICE, "pękła struna");

        assertThat(item.getLifecycleStatus()).isEqualTo(ItemLifecycleStatus.IN_SERVICE);
        assertThat(item.getAssignedMemberId()).isNull();
        assertThat(open.getReturnedState()).isEqualTo(ItemLifecycleStatus.IN_SERVICE);
        assertThat(open.getReturnNote()).isEqualTo("pękła struna");
    }

    @Test
    void unassignWithoutOpenHistoryRowIsAConflict() {
        item.assignTo(11L, "Jan Kowalski");
        when(assignments.findByItemIdAndReturnedAtIsNull(1L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.unassign(1L, null, null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("otwartego przydziału");
    }
}
