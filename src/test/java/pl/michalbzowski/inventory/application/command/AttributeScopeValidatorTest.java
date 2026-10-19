package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * Unit tests of the shared attribute validation (extracted from
 * ItemCommandService so PurchaseCommandService reuses the exact same rules —
 * messages, normalization, conditional dropping, required enforcement).
 */
@ExtendWith(MockitoExtension.class)
class AttributeScopeValidatorTest {

    private static final long BAND = 7L;

    @Mock
    private ItemAttributeDefRepository defs;

    private AttributeScopeValidator validator;

    @BeforeEach
    void setUp() {
        validator = new AttributeScopeValidator(defs);
    }

    private static ItemAttributeDef sizeDef(long id, long bandId) {
        ItemAttributeDef def = ItemAttributeDef.create(bandId, "Rozmiar",
                pl.michalbzowski.inventory.domain.inventory.AttributeDataType.SELECT,
                ItemType.UNIFORM, 1);
        def.setId(id);
        def.setOptions("S;M;L");
        return def;
    }

    private static List<AttributeValueCommand> cmd(Long defId, String value) {
        return List.of(new AttributeValueCommand(defId, value));
    }

    @Test
    void normalizesValueAndReturnsResolvedPairs() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, BAND)));
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(BAND, ItemType.UNIFORM))
                .thenReturn(List.of());

        List<AttributeScopeValidator.Resolved> resolved =
                validator.resolve(BAND, ItemType.UNIFORM, cmd(10L, "m"));

        assertThat(resolved).hasSize(1);
        assertThat(resolved.get(0).defId()).isEqualTo(10L);
        assertThat(resolved.get(0).value()).isEqualTo("m");
    }

    @Test
    void rejectsDefinitionOfForeignBand() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, 99L)));

        assertThatThrownBy(() -> validator.resolve(BAND, ItemType.UNIFORM, cmd(10L, "M")))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("nie pasuje");
    }

    @Test
    void rejectsRequiredAttributeMissing() {
        ItemAttributeDef required = sizeDef(10L, BAND);
        required.setRequired(true);
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(BAND, ItemType.UNIFORM))
                .thenReturn(List.of(required));

        assertThatThrownBy(() -> validator.resolve(BAND, ItemType.UNIFORM, List.of()))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("wymagany");
    }

    @Test
    void rejectsDuplicateDefinitionInPayload() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, BAND)));

        assertThatThrownBy(() -> validator.resolve(BAND, ItemType.UNIFORM,
                List.of(new AttributeValueCommand(10L, "S"), new AttributeValueCommand(10L, "M"))))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("Podwójna");
    }

    @Test
    void nullPayloadPassesWhenNothingRequired() {
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(BAND, ItemType.UNIFORM))
                .thenReturn(List.of());

        assertThat(validator.resolve(BAND, ItemType.UNIFORM, null)).isEmpty();
    }
}
