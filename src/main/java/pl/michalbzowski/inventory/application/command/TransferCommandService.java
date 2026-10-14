package pl.michalbzowski.inventory.application.command;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransfer;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Warehouse transfer use-case (analysis 3.1, decision B6). ADMIN-only at the
 * REST boundary (role matrix §2: "transfery"). The source warehouse is read
 * BEFORE the move so history cannot lie; item update and event row share one
 * transaction (same pairing rule as {@link AssignCommandService}).
 */
@Service
@RequiredArgsConstructor
public class TransferCommandService {

    private final InventoryItemRepository items;
    private final WarehouseTransferRepository transfers;

    @Transactional
    public InventoryItem transfer(long itemId, WarehouseType to, String note) {
        InventoryItem item = items.findById(itemId)
                .orElseThrow(() -> new ItemNotFoundException(itemId));
        WarehouseType from = item.getWarehouse();
        item.moveTo(to);
        transfers.save(WarehouseTransfer.record(item, from, to, note));
        return item;
    }
}
