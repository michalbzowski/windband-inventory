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
        if (cmd.dependsOnDefId() != null) {
            setDependency(def, cmd.dependsOnDefId(), cmd.dependsOnValues());
        }
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
            String serialized = serializeOptions(def, cmd.options());
            guardParentOptionsShrink(def, serialized);
            def.setOptions(serialized);
        }
        if (cmd.dependsOnDefId() != null) {
            if (cmd.dependsOnDefId() <= 0) {
                def.setDependsOnDefId(null);
                def.setDependsOnValues(null);
            } else {
                setDependency(def, cmd.dependsOnDefId(), cmd.dependsOnValues());
            }
        } else if (cmd.dependsOnValues() != null) {
            if (!def.isConditional()) {
                throw new AttributeValueInvalidException(
                        "Nie można ustawić warunków bez wskazania atrybutu-parenta");
            }
            def.setDependsOnValues(serializeDependsValues(
                    defs.findById(def.getDependsOnDefId())
                            .orElseThrow(() -> new AttributeValueInvalidException(
                                    "Atrybut-parent nie istnieje albo jest nieaktywny")),
                    cmd.dependsOnValues()));
        }
        if (cmd.active() != null && cmd.active() != def.isActive()) {
            if (cmd.active()) {
                // reactivation must not re-introduce a duplicate active name for (band, type)
                checkDuplicate(def.getBandId(), def.getItemType(), def.getName(), def.getId());
            }
            def.setActive(cmd.active());
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

    /**
     * Reguły warunkowe atrybutów (v2.0). Hierarchia jest płaska — jeden poziom:
     * parent to aktywny SELECT z tego samego bandu i tego samego typu pozycji,
     * sam bezwarunkowy i nie może to być definiowany atrybut.
     */
    private void setDependency(ItemAttributeDef def, long parentId, List<String> rawValues) {
        ItemAttributeDef parent = requireParent(parentId, def);
        def.setDependsOnDefId(parentId);
        def.setDependsOnValues(serializeDependsValues(parent, rawValues));
    }

    private ItemAttributeDef requireParent(long parentId, ItemAttributeDef def) {
        if (def.getId() != null && def.getId() == parentId) {
            throw new AttributeValueInvalidException("Atrybut nie może zależeć od samego siebie");
        }
        ItemAttributeDef parent = defs.findById(parentId)
                .filter(p -> p.isActive() && p.getBandId().equals(def.getBandId())
                        && p.getItemType() == def.getItemType())
                .orElseThrow(() -> new AttributeValueInvalidException(
                        "Atrybut-parent nie istnieje, jest nieaktywny albo dotyczy innego typu pozycji"));
        if (parent.getDataType() != AttributeDataType.SELECT) {
            throw new AttributeValueInvalidException(
                    "Atrybut-parent musi być listą z jednym wyborem (SELECT)");
        }
        if (parent.isConditional()) {
            throw new AttributeValueInvalidException(
                    "Zależność może mieć tylko jeden poziom — parent sam jest atrybutem zależnym");
        }
        return parent;
    }

    private String serializeDependsValues(ItemAttributeDef parent, List<String> rawValues) {
        List<String> filtered = rawValues == null ? List.of() : rawValues.stream()
                .filter(v -> v != null && !v.isBlank())
                .map(String::trim)
                .distinct()
                .collect(Collectors.toList());
        if (filtered.isEmpty()) {
            throw new AttributeValueInvalidException(
                    "Atrybut zależny wymaga co najmniej jednej wartości parenta, po której ma się pokazywać");
        }
        for (String v : filtered) {
            if (parent.parsedOptions().stream().noneMatch(o -> o.equalsIgnoreCase(v))) {
                throw new AttributeValueInvalidException(
                        "Wartość „" + v + "” nie jest opcją atrybutu-parenta");
            }
        }
        return String.join(";", filtered);
    }

    /** Nie wolno usunąć opcji SELECT, której używa reguła aktywnego atrybutu zależnego. */
    private void guardParentOptionsShrink(ItemAttributeDef def, String newOptionsRaw) {
        if (def.getId() == null || def.getDataType() != AttributeDataType.SELECT) {
            return;
        }
        List<String> allowed = AttributeValueFormat.parseOptions(newOptionsRaw);
        for (ItemAttributeDef child : defs.findByDependsOnDefId(def.getId())) {
            if (!child.isActive()) {
                continue;
            }
            for (String used : child.parsedDependsValues()) {
                if (allowed.stream().noneMatch(o -> o.equalsIgnoreCase(used))) {
                    throw new AttributeValueInvalidException("Nie można usunąć opcji „" + used
                            + "” — używa jej zależny atrybut „" + child.getName() + "”");
                }
            }
        }
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
