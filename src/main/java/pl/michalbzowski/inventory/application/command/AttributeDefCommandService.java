package pl.michalbzowski.inventory.application.command;

import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.AttributeDataType;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueFormat;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * Attribute-definition write use-cases. Deleting is a DEACTIVATION (values
 * referencing a definition must keep rendering in item details and, later, in
 * stocktake diffs) — matching "history-safe" from the frozen analysis.
 */
@Service
@RequiredArgsConstructor
public class AttributeDefCommandService {

    private final ItemAttributeDefRepository defs;

    @Transactional
    public ItemAttributeDef create(long bandId, AttributeDefCreateCommand cmd) {
        requireName(cmd.name());
        requireType(cmd.itemType());
        requireType(cmd.dataType());
        checkDuplicate(bandId, cmd.itemType(), cmd.name(), null);
        ItemAttributeDef def = ItemAttributeDef.create(bandId, cmd.name(), cmd.dataType(),
                cmd.itemType(), cmd.displayOrder());
        def.setRequired(cmd.required());
        def.setDisplayInList(cmd.displayInList());
        def.setOptions(serializeOptions(def, cmd.options()));
        return defs.save(def);
    }

    @Transactional
    public ItemAttributeDef update(long id, AttributeDefUpdateCommand cmd) {
        ItemAttributeDef def = defs.findById(id).orElseThrow(() -> new AttributeDefNotFoundException(id));
        if (cmd.name() != null && !cmd.name().isBlank() && !cmd.name().equalsIgnoreCase(def.getName())) {
            checkDuplicate(def.getBandId(), def.getItemType(), cmd.name(), def.getId());
            def.setName(cmd.name().trim());
        }
        if (cmd.displayOrder() != null) {
            def.setDisplayOrder(cmd.displayOrder());
        }
        if (cmd.required() != null) {
            def.setRequired(cmd.required());
        }
        if (cmd.displayInList() != null) {
            def.setDisplayInList(cmd.displayInList());
        }
        if (cmd.options() != null) {
            def.setOptions(serializeOptions(def, cmd.options()));
        }
        return def;
    }

    /** Soft delete: deactivate, keep the row (and its values) for history. */
    @Transactional
    public void deactivate(long id) {
        ItemAttributeDef def = defs.findById(id).orElseThrow(() -> new AttributeDefNotFoundException(id));
        def.setActive(false);
    }

    private void checkDuplicate(long bandId, ItemType itemType, String name, Long ignoreId) {
        boolean clash = defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(bandId, itemType)
                .stream()
                .anyMatch(d -> d.getName().equalsIgnoreCase(name.trim())
                        && (ignoreId == null || !d.getId().equals(ignoreId)));
        if (clash) {
            throw new AttributeDefDuplicateException(name.trim());
        }
    }

    private String serializeOptions(ItemAttributeDef def, List<String> options) {
        if (def.getDataType() != AttributeDataType.SELECT && def.getDataType() != AttributeDataType.MULTI) {
            return null;
        }
        List<String> filtered = options == null ? List.of() : options.stream()
                .filter(o -> o != null && !o.isBlank())
                .map(String::trim)
                .collect(Collectors.toList());
        if (filtered.isEmpty()) {
            throw new AttributeValueInvalidException(
                    "Atrybut typu " + def.getDataType() + " wymaga co najmniej jednej opcji");
        }
        String joined = String.join(";", filtered);
        if (!AttributeValueFormat.optionsOk(joined)) {
            throw new AttributeValueInvalidException("Opcje atrybutu mają niepoprawną formę");
        }
        return joined;
    }

    private static void requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new AttributeValueInvalidException("Nazwa atrybutu jest wymagana");
        }
    }

    private static void requireType(Object value) {
        if (value == null) {
            throw new AttributeValueInvalidException("Pole wymagane (itemType/dataType)");
        }
    }
}
