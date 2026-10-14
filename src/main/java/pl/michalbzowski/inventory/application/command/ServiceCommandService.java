package pl.michalbzowski.inventory.application.command;

import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEvent;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;

/**
 * Service-workflow use-cases (F4, analysis §4 item 2; ADMIN-only at the REST
 * boundary — B8). Status precondition lives in the domain (409 on violation);
 * the evidence row always moves WITH the status, in one transaction.
 */
@Service
@RequiredArgsConstructor
public class ServiceCommandService {

    private final InventoryItemRepository items;
    private final ItemServiceEventRepository events;

    @Transactional
    public InventoryItem send(long itemId, String note) {
        InventoryItem item = load(itemId);
        item.sendToService();
        events.save(ItemServiceEvent.open(item, note));
        return item;
    }

    @Transactional
    public InventoryItem complete(long itemId, String note, LocalDate nextServiceDate) {
        InventoryItem item = load(itemId);
        item.completeService(nextServiceDate);
        // Every path INTO IN_SERVICE opens an event (send / return-to-service),
        // so the open row normally exists; a legacy row without one still
        // completes — no phantom close.
        events.findByItemIdAndCompletedAtIsNull(itemId)
                .ifPresent(event -> event.complete(note, nextServiceDate));
        return item;
    }

    private InventoryItem load(long id) {
        return items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
    }
}
