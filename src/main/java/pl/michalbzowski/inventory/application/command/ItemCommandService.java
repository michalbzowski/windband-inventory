package pl.michalbzowski.inventory.application.command;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeedRepository;
import pl.michalbzowski.inventory.domain.inventory.OwnershipDeclarationRepository;
import pl.michalbzowski.inventory.domain.inventory.PurchaseRequestRepository;
import pl.michalbzowski.inventory.domain.inventory.ServiceJobRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeValue;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;

/**
 * Item write use-cases (ADMIN-checked by the REST layer before reaching here).
 *
 * <p>Attribute rules are enforced by {@link AttributeScopeValidator}
 * (shared with PurchaseCommandService): every submitted value must reference an
 * ACTIVE definition of the SAME band and SAME item type, required definitions
 * without a value reject the whole write, hidden conditional branches are dropped.
 */
@Service
@RequiredArgsConstructor
public class ItemCommandService {

    private final InventoryItemRepository items;
    private final AttributeScopeValidator scopeValidator;
    private final ItemSerialAllocator serials;
    private final ItemAssignmentRepository assignments;
    private final ItemServiceEventRepository serviceEvents;
    private final InventoryNeedRepository needs;
    private final PurchaseRequestRepository purchases;
    private final OwnershipDeclarationRepository declarations;
    private final WarehouseTransferRepository warehouseTransfers;
    private final StocktakeLineRepository stocktakeLines;
    private final ServiceJobRepository serviceJobs;

    @Transactional
    public InventoryItem create(long bandId, ItemWriteCommand cmd) {
        InventoryItem item = InventoryItem.create(bandId, cmd.name(), cmd.type(), cmd.warehouse(),
                cmd.serialNumber(), cmd.description(), cmd.notes());
        serials.ensureSerial(item);
        requireSerialFree(item);
        item.replaceAttributes(resolveValues(item, cmd.attributes()));
        return items.save(item);
    }

    @Transactional
    public InventoryItem update(long id, ItemWriteCommand.Basics cmd) {
        InventoryItem item = items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
        // The serial code is program-assigned at creation and no longer an edit surface.
        item.replaceDetails(cmd.name(), cmd.warehouse(), cmd.description(), cmd.notes());
        requireSerialFree(item);
        item.replaceAttributes(resolveValues(item, cmd.attributes()));
        return item;
    }

    @Transactional
    public void delete(long id) {
        InventoryItem item = items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
        if (item.getAssignedMemberId() != null) {
            throw new IllegalStateException(
                    "Pozycja przypisana do \"" + item.getAssignedMemberName()
                            + "\" — najpierw ją zwróć, potem usuwaj");
        }
        // History rows (assignments, service events, transfers, stocktake lines,
        // needs, purchases, declarations) carry FKs to the item and are the evidence base of
        // v1.x (F3) — such items are archived, not deleted.
        if (assignments.existsByItemId(id) || serviceEvents.existsByItemId(id)
                || needs.existsByItemId(id)
                || purchases.existsByItemId(id)
                || declarations.existsByItemId(id)
                || warehouseTransfers.existsByItemId(id)
                || serviceJobs.existsByItemId(id)
                || stocktakeLines.existsByItem_Id(id)) {
            throw new IllegalStateException(
                    "Pozycja ma historię (przydziały/serwisy/przeniesienia/spisy/potrzeby/zamówienia/deklaracje/service) —"
                            + " nie usuwaj dowodów; do usunięcia tylko pozycje bez żadnej historii");
        }
        items.delete(item);
    }

    /** Business mirror of the DB partial-unique index (band, serial_number). */
    private void requireSerialFree(InventoryItem item) {
        if (item.getSerialNumber() == null) {
            return;
        }
        items.findByBandIdAndSerialNumber(item.getBandId(), item.getSerialNumber())
                .stream()
                .filter(other -> !other.getId().equals(item.getId()))
                .findAny()
                .ifPresent(other -> {
                    throw new IllegalArgumentException(
                            "Numer seryjny \"" + item.getSerialNumber() + "\" jest już zajęty w tym bandzie");
                });
    }

    /**
     * Validates the whole attribute payload at once and builds value rows.
     * A missing/inactive/foreign definition and a mismatching type produce the
     * SAME message so nothing can be probed across bands.
     */
    private List<ItemAttributeValue> resolveValues(InventoryItem item,
            List<AttributeValueCommand> values) {
        return scopeValidator
                .resolve(item.getBandId(), item.getType(), values)
                .stream()
                .map(r -> new ItemAttributeValue(item, r.def(), r.value()))
                .collect(java.util.stream.Collectors.toList());
    }
}
