package pl.michalbzowski.inventory.domain.inventory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * Pure domain rules of the attribute engine — the same checks the REST API
 * enforces (data types, option lists, required semantics).
 */
class AttributeValueFormatTest {

    private static ItemAttributeDef def(AttributeDataType type, String options) {
        ItemAttributeDef d = ItemAttributeDef.create(1L, "Atr", type, ItemType.INSTRUMENT, 0);
        d.setOptions(options);
        return d;
    }

    @Test
    void blankValueMeansAbsent_andNormalizesToNull() {
        assertThat(AttributeValueFormat.normalizeAndValidate(def(AttributeDataType.TEXT, null), "  "))
                .isNull();
        assertThat(AttributeValueFormat.normalizeAndValidate(def(AttributeDataType.TEXT, null), null))
                .isNull();
    }

    @Test
    void numberAcceptsIntegersAndDecimals() {
        ItemAttributeDef d = def(AttributeDataType.NUMBER, null);
        assertThat(AttributeValueFormat.normalizeAndValidate(d, " 12 ")).isEqualTo("12");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "-0.75")).isEqualTo("-0.75");
    }

    @Test
    void numberRejectsText() {
        ItemAttributeDef d = def(AttributeDataType.NUMBER, null);
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, "dziesięć"))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("nie jest liczbą");
    }

    @Test
    void dateMustBeIso() {
        ItemAttributeDef d = def(AttributeDataType.DATE, null);
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "2026-10-13")).isEqualTo("2026-10-13");
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, "13.10.2026"))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("RRRR-MM-DD");
    }

    @Test
    void booleanAcceptsPolishAndNumericForms() {
        ItemAttributeDef d = def(AttributeDataType.BOOLEAN, null);
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "TAK")).isEqualTo("true");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "0")).isEqualTo("false");
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, "moze"))
                .isInstanceOf(AttributeValueInvalidException.class);
    }

    @Test
    void selectValueMustBeOnOptionsList() {
        ItemAttributeDef d = def(AttributeDataType.SELECT, "S;B;T");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "b")).isEqualTo("b");
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, "Q"))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("liście dozwolonych opcji");
    }

    @Test
    void selectOptionsCanBeJsonArray() {
        ItemAttributeDef d = def(AttributeDataType.SELECT, "[\"ALT\", \" tenor\"]");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "tenor")).isEqualTo("tenor");
        assertThat(d.parsedOptions()).containsExactly("ALT", "tenor");
    }

    @Test
    void multiAcceptsSeparatedListAndJson() {
        ItemAttributeDef d = def(AttributeDataType.MULTI, "troth;reeds;oil");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "Reeds; oil")).isEqualTo("Reeds;oil");
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "[\"troth\"]")).isEqualTo("troth");
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, "reeds;gasoil"))
                .isInstanceOf(AttributeValueInvalidException.class);
    }

    @Test
    void multiRejectsEmptyList() {
        ItemAttributeDef d = def(AttributeDataType.MULTI, "a;b");
        assertThatThrownBy(() -> AttributeValueFormat.normalizeAndValidate(d, " ; "))
                .isInstanceOf(AttributeValueInvalidException.class);
    }

    @Test
    void parseOptionsHandlesPlainSemicolonForm() {
        List<String> options = AttributeValueFormat.parseOptions("A;; B ;");
        assertThat(options).containsExactly("A", "B");
    }

    @ParameterizedTest
    @EnumSource(AttributeDataType.class)
    void textAcceptsAnything(AttributeDataType type) {
        ItemAttributeDef d = def(AttributeDataType.TEXT, null);
        assertThat(type).isNotNull();
        assertThat(AttributeValueFormat.normalizeAndValidate(d, "dowolny tekst 123 !@#")).isEqualTo("dowolny tekst 123 !@#");
    }

    @Test
    void malformedJsonOptionsAreRejectedAtDefinitionLevel() {
        assertThat(AttributeValueFormat.optionsOk("[\"A\", \"B\"")).isFalse();
        assertThat(AttributeValueFormat.optionsOk("[\"A\", \"B\"]")).isTrue();
        assertThat(AttributeValueFormat.optionsOk(null)).isFalse();
    }
}
