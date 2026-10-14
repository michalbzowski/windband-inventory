package pl.michalbzowski.inventory.application.command;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueFormat;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.InventoryNeedRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeValue;
import pl.michalbzowski.inventory.domain.inventory.ItemServiceEventRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;

/**
 * Item write use-cases (ADMIN-checked by the REST layer before reaching here).
 *
 * <p>Attribute rules (frozen analysis, section 3.1): every submitted value
 * must reference an ACTIVE definition of the SAME band and SAME item type;
 * values are normalized by {@link AttributeValueFormat}; required definitions
 * without a value reject the whole write.
 */
@Service
@RequiredArgsConstructor
public class ItemCommandService {

    private final InventoryItemRepository items;
    private final ItemAttributeDefRepository defs;
    private final ItemAssignmentRepository assignments;
    private final ItemServiceEventRepository serviceEvents;
    private final InventoryNeedRepository needs;
    private final WarehouseTransferRepository warehouseTransfers;
    private final StocktakeLineRepository stocktakeLines;

    @Transactional
    public InventoryItem create(long bandId, ItemWriteCommand cmd) {
        InventoryItem item = InventoryItem.create(bandId, cmd.name(), cmd.type(), cmd.warehouse(),
                cmd.serialNumber(), cmd.description(), cmd.notes());
        requireSerialFree(item);
        item.replaceAttributes(resolveValues(item, cmd.attributes()));
        return items.save(item);
    }

    @Transactional
    public InventoryItem update(long id, ItemWriteCommand.Basics cmd) {
        InventoryItem item = items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
        item.replaceDetails(cmd.name(), cmd.warehouse(), cmd.serialNumber(),
                cmd.description(), cmd.notes());
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
        // needs) carry FKs to the item and are the evidence base of v1.x (F3) —
        // such items are archived, not deleted.
        if (assignments.existsByItemId(id) || serviceEvents.existsByItemId(id)
                || needs.existsByItemId(id)
                || warehouseTransfers.existsByItemId(id)
                || stocktakeLines.existsByItem_Id(id)) {
            throw new IllegalStateException(
                    "Pozycja ma historię (przydziały/serwisy/przeniesienia/spisy/potrzeby) — nie usuwaj dowodów;"
                            + " do usunięcia tylko pozycje bez żadnej historii");
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
        Map<Long, ItemAttributeValue> rows = new LinkedHashMap<>();
        if (values != null) {
            for (AttributeValueCommand value : values) {
                if (value.attributeDefId() == null) {
                    throw new AttributeValueInvalidException("Wskazanie atrybutu wymaga attributeDefId");
                }
                if (rows.containsKey(value.attributeDefId())) {
                    throw new AttributeValueInvalidException(
                            "Podwójna wartość tego samego atrybutu (id " + value.attributeDefId() + ")");
                }
                ItemAttributeDef def = defs.findById(value.attributeDefId())
                        .orElseThrow(() -> new AttributeValueInvalidException(
                                "Definicja atrybutu o id " + value.attributeDefId() + " nie istnieje"));
                if (!def.isActive() || !def.getBandId().equals(item.getBandId())
                        || def.getItemType() != item.getType()) {
                    throw new AttributeValueInvalidException(
                            "Definicja atrybutu o id " + def.getId() + " nie pasuje do tej pozycji");
                }
                String normalized = AttributeValueFormat.normalizeAndValidate(def, value.value());
                if (normalized == null) {
                    throw new AttributeValueInvalidException(
                            "Atrybut \"" + def.getName() + "\": wartość nie może być pusta");
                }
                rows.put(def.getId(), new ItemAttributeValue(item, def, normalized));
            }
        }
        for (ItemAttributeDef def
                : defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(
                        item.getBandId(), item.getType())) {
            if (def.isRequired() && !rows.containsKey(def.getId())) {
                throw new AttributeValueInvalidException(
                        "Atrybut \"" + def.getName() + "\" jest wymagany");
            }
        }
        return new ArrayList<>(rows.values());
    }
}
