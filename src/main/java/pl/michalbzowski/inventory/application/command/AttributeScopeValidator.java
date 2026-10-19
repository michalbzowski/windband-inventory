package pl.michalbzowski.inventory.application.command;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueFormat;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * Validates an attribute-value payload against the ACTIVE definitions of a band+type —
 * the single source of truth shared by item creation (ItemCommandService) and purchase
 * orders (PurchaseCommandService). Normalizes every value, drops hidden conditional
 * branches silently (v2.0 semantics, same as edit), enforces required defs, and keeps
 * the Polish error messages byte-identical to the pre-extraction inline logic so the
 * REST contract is untouched.
 */
@Component
public class AttributeScopeValidator {

    /** One accepted pair: definition plus its normalized value. */
    public record Resolved(long defId, ItemAttributeDef def, String value) {}

    private final ItemAttributeDefRepository defs;

    public AttributeScopeValidator(ItemAttributeDefRepository defs) {
        this.defs = defs;
    }

    /**
     * Validates the whole attribute payload at once and returns the accepted pairs.
     * A missing/inactive/foreign definition and a mismatching type produce the
     * SAME message so nothing can be probed across bands.
     */
    public List<Resolved> resolve(Long bandId, ItemType type, List<AttributeValueCommand> values) {
        Map<Long, Resolved> rows = new LinkedHashMap<>();
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
                if (!def.isActive() || !def.getBandId().equals(bandId)
                        || def.getItemType() != type) {
                    throw new AttributeValueInvalidException(
                            "Definicja atrybutu o id " + def.getId() + " nie pasuje do tej pozycji");
                }
                String normalized = AttributeValueFormat.normalizeAndValidate(def, value.value());
                if (normalized == null) {
                    throw new AttributeValueInvalidException(
                            "Atrybut \"" + def.getName() + "\": wartość nie może być pusta");
                }
                rows.put(def.getId(), new Resolved(def.getId(), def, normalized));
            }
        }
        List<ItemAttributeDef> scope =
                defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(bandId, type);
        Map<Long, ItemAttributeDef> byId = scope.stream()
                .collect(java.util.stream.Collectors.toMap(ItemAttributeDef::getId, d -> d));
        Map<Long, String> valuesByDef = new HashMap<>();
        rows.forEach((id, row) -> valuesByDef.put(id, row.value()));

        // Reguły warunkowe atrybutów (v2.0): wartość atrybutu zależnego, którego
        // warunek nie jest spełniony, jest cicho odrzucana — przedawniony klient
        // nie zapisze rozmiaru czapki przy koszuli, a ukryty atrybut nie wymaga wartości.
        rows.entrySet().removeIf(entry -> {
            ItemAttributeDef d = byId.get(entry.getKey());
            return d != null && d.isConditional() && !isVisible(d, byId, valuesByDef);
        });

        for (ItemAttributeDef def : scope) {
            if (def.isConditional() && !isVisible(def, byId, valuesByDef)) {
                continue;
            }
            if (def.isRequired() && !rows.containsKey(def.getId())) {
                throw new AttributeValueInvalidException(
                        "Atrybut \"" + def.getName() + "\" jest wymagany");
            }
        }
        return new ArrayList<>(rows.values());
    }

    /**
     * Widoczność = brak warunku albo wartość rodzica w dozwolonym zbiorze.
     * Rodzic musi być w zakresie (aktywny, ten sam band i typ) — deactivated
     * parent chowa dzieci; dlatego hierarchia trzyma się jednego poziomu.
     */
    private static boolean isVisible(ItemAttributeDef def, Map<Long, ItemAttributeDef> byId,
            Map<Long, String> valuesByDef) {
        if (!def.isConditional()) {
            return true;
        }
        ItemAttributeDef parent = byId.get(def.getDependsOnDefId());
        if (parent == null) {
            return false;
        }
        String value = valuesByDef.get(parent.getId());
        if (value == null || value.isBlank()) {
            return false;
        }
        String trimmed = value.trim();
        return def.parsedDependsValues().stream().anyMatch(v -> v.equalsIgnoreCase(trimmed));
    }
}
