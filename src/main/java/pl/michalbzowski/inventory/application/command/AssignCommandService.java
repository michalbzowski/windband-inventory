package pl.michalbzowski.inventory.application.command;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.port.BandDirectory;
import pl.michalbzowski.inventory.application.port.BandMember;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignment;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;

/**
 * Assign / return use-cases (analysis 3.1; ADMIN-only — role matrix §2).
 *
 * <p>The target member is validated against the LIVE WM roster (B10):
 * unknown → 400, inactive → 400 ("MEMBER aktywny" is the assignment
 * precondition). The item keeps a display snapshot; every event also gets an
 * {@link ItemAssignment} history row — both writes share one transaction,
 * so snapshot and history can never diverge.
 */
@Service
@RequiredArgsConstructor
public class AssignCommandService {

    private final InventoryItemRepository items;
    private final ItemAssignmentRepository assignments;
    private final BandDirectory bandDirectory;

    @Transactional
    public InventoryItem assign(long itemId, String bearerToken, long memberId, String note) {
        InventoryItem item = load(itemId);
        BandMember member = bandDirectory.members(bearerToken, item.getBandId()).stream()
                .filter(m -> m.memberId() == memberId)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Członek o id " + memberId + " nie należy do tego bandu"));
        if (!member.active()) {
            throw new IllegalArgumentException(
                    "Przypisać można tylko aktywnemu członkowi — " + member.fullName() + " jest nieaktywny");
        }
        item.assignTo(member.memberId(), member.fullName());
        assignments.save(ItemAssignment.open(item, member.memberId(), member.fullName(), note));
        return item;
    }

    @Transactional
    public InventoryItem unassign(long itemId, ItemLifecycleStatus returnedState, String note) {
        InventoryItem item = load(itemId);
        ItemAssignment open = assignments.findByItemIdAndReturnedAtIsNull(itemId)
                .orElseThrow(() -> new IllegalStateException(
                        "Pozycja nie ma otwartego przydziału — nie ma czego zwracać"));
        ItemLifecycleStatus state = returnedState == null
                ? ItemLifecycleStatus.AVAILABLE : returnedState;
        item.unassign(state);
        open.close(state, note);
        return item;
    }

    private InventoryItem load(long id) {
        return items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
    }
}
