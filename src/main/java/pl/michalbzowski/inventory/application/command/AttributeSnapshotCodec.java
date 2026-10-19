package pl.michalbzowski.inventory.application.command;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;

/** JSON codec of the purchase attribute snapshot (attribute_snapshot column). */
public final class AttributeSnapshotCodec {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<AttributeEntry>> ENTRIES = new TypeReference<>() {
    };

    private AttributeSnapshotCodec() {
        throw new UnsupportedOperationException("codec");
    }

    public static String toJson(List<AttributeEntry> entries) {
        try {
            return MAPPER.writeValueAsString(entries);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("snapshot atrybutów nie da się zaserializować", e);
        }
    }

    /** Blank/absent snapshot = no attributes (legacy orders). Corrupt JSON is a data error. */
    public static List<AttributeEntry> parse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, ENTRIES);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new AttributeValueInvalidException("Zapisany snapshot atrybutów zamówienia jest uszkodzony");
        }
    }

    /** Converts snapshot entries back to the write-payload shape for re-validation. */
    public static List<AttributeValueCommand> toCommands(List<AttributeEntry> entries) {
        return entries.stream()
                .map(e -> new AttributeValueCommand(e.attributeDefId(), e.value()))
                .toList();
    }
}
