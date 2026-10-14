package pl.michalbzowski.inventory.domain.inventory;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.DateTimeException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Pure domain validation/normalization of attribute values against a
 * definition's data type. No framework dependencies — the same rules guard
 * both the REST API and any future import paths.
 */
public final class AttributeValueFormat {

    private AttributeValueFormat() {
    }

    /**
     * Validates and normalizes a raw submitted value.
     *
     * @return the value as it should be stored (never null for non-blank input;
     *         null signals "no value provided" and is the caller's job to reject
     *         for required definitions)
     * @throws AttributeValueInvalidException when the value does not fit the type
     */
    public static String normalizeAndValidate(ItemAttributeDef def, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.trim();
        switch (def.getDataType()) {
            case NUMBER:
                parseNumber(def, value);
                return value;
            case DATE:
                parseDate(def, value);
                return value;
            case BOOLEAN:
                return parseBoolean(def, value);
            case SELECT:
                requireKnownOption(def, value);
                return value;
            case MULTI:
                return normalizeMulti(def, value);
            case TEXT:
                return value;
            default:
                throw new AttributeValueInvalidException(
                        "Nieobsługiwany typ atrybutu: " + def.getDataType());
        }
    }

    /**
     * Option list from the definition's raw options text: either a JSON string
     * array ({@code ["A", "B"]}) or semicolon-separated plain values
     * ({@code A;B}). Anything else (malformed JSON) yields an empty list —
     * {@link #optionsOk} reports that case for definition-level validation.
     */
    public static List<String> parseOptions(String rawOptions) {
        List<String> result = new ArrayList<>();
        if (rawOptions == null || rawOptions.isBlank()) {
            return result;
        }
        String text = rawOptions.trim();
        if (text.startsWith("[")) {
            String body = text.substring(1, text.endsWith("]") ? text.length() - 1 : text.length());
            for (String part : body.split(",")) {
                String item = part.trim();
                if (item.length() >= 2 && item.startsWith("\"") && item.endsWith("\"")) {
                    item = item.substring(1, item.length() - 1).replace("\\\"", "\"");
                }
                if (!item.isBlank()) {
                    result.add(item.trim());
                }
            }
            return result;
        }
        for (String part : text.split(";")) {
            if (!part.isBlank()) {
                result.add(part.trim());
            }
        }
        return result;
    }

    /** True when the options text can produce a non-empty list for SELECT/MULTI. */
    public static boolean optionsOk(String rawOptions) {
        if (rawOptions == null || rawOptions.isBlank()) {
            return false;
        }
        String text = rawOptions.trim();
        if (text.startsWith("[") && !text.endsWith("]")) {
            return false;
        }
        return !parseOptions(text).isEmpty();
    }

    private static void parseNumber(ItemAttributeDef def, String value) {
        try {
            new BigDecimal(value);
        } catch (NumberFormatException ex) {
            throw new AttributeValueInvalidException(
                    "Atrybut \"" + def.getName() + "\": wartość \"" + value + "\" nie jest liczbą");
        }
    }

    private static void parseDate(ItemAttributeDef def, String value) {
        try {
            LocalDate.parse(value);
        } catch (DateTimeException ex) {
            throw new AttributeValueInvalidException(
                    "Atrybut \"" + def.getName() + "\": wartość \"" + value
                            + "\" nie jest datą w formacie RRRR-MM-DD");
        }
    }

    private static String parseBoolean(ItemAttributeDef def, String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.equals("true") || lower.equals("1") || lower.equals("tak")) {
            return "true";
        }
        if (lower.equals("false") || lower.equals("0") || lower.equals("nie")) {
            return "false";
        }
        throw new AttributeValueInvalidException(
                "Atrybut \"" + def.getName() + "\": wartość \"" + value + "\" nie jest logicznym tak/nie");
    }

    private static void requireKnownOption(ItemAttributeDef def, String value) {
        List<String> options = def.parsedOptions();
        boolean found = options.stream().anyMatch(o -> o.equalsIgnoreCase(value));
        if (!found) {
            throw new AttributeValueInvalidException(
                    "Atrybut \"" + def.getName() + "\": wartość \"" + value + "\" nie jest na liście dozwolonych opcji");
        }
    }

    /**
     * MULTI accepts {@code "A;B"}, {@code "A,B"} or a JSON array; each element
     * must be a known option. Normalized storage form: semicolon-joined.
     */
    private static String normalizeMulti(ItemAttributeDef def, String value) {
        List<String> elements = new ArrayList<>();
        String text = value;
        if (text.startsWith("[")) {
            elements.addAll(parseOptions(text));
        } else {
            String[] parts = text.contains(";") ? text.split(";") : text.split(",");
            for (String part : parts) {
                if (!part.isBlank()) {
                    elements.add(part.trim());
                }
            }
        }
        if (elements.isEmpty()) {
            throw new AttributeValueInvalidException(
                    "Atrybut \"" + def.getName() + "\": pusta lista wartości wielokrotnych");
        }
        for (String element : elements) {
            requireKnownOption(def, element);
        }
        return String.join(";", elements);
    }
}
