package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.domain.inventory.AttributeDataType;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

@ExtendWith(MockitoExtension.class)
class AttributeDefCommandServiceTest {

    @Mock
    private ItemAttributeDefRepository defs;

    @InjectMocks
    private AttributeDefCommandService service;

    private static AttributeDefCreateCommand select(String name, List<String> options) {
        return new AttributeDefCreateCommand(name, ItemType.INSTRUMENT, AttributeDataType.SELECT,
                0, false, false, options);
    }

    @Test
    void createSerializesOptionsIntoStorageForm() {
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(
                7L, ItemType.INSTRUMENT)).thenReturn(List.of());
        when(defs.save(org.mockito.ArgumentMatchers.any(ItemAttributeDef.class)))
                .thenAnswer(inv -> {
                    ItemAttributeDef d = inv.getArgument(0);
                    d.setId(1L);
                    return d;
                });

        ItemAttributeDef created = service.create(7L, select("Materiał", List.of("mosiądz", "nikel")));

        assertThat(created.getOptions()).isEqualTo("mosiądz;nikel");
        assertThat(created.parsedOptions()).containsExactly("mosiądz", "nikel");
    }

    @Test
    void selectWithoutOptionsIsRejected() {
        assertThatThrownBy(() -> service.create(7L, select("Materiał", List.of())))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("opcji");
    }

    @Test
    void duplicateNameIsRejected() {
        ItemAttributeDef existing = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        existing.setId(1L);
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(
                7L, ItemType.INSTRUMENT)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> service.create(7L, select("materiał", List.of("a"))))
                .isInstanceOf(AttributeDefDuplicateException.class);
    }

    @Test
    void updateAllowsOwnNameIgnoringCase() {
        ItemAttributeDef existing = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        existing.setId(1L);
        when(defs.findById(1L)).thenReturn(Optional.of(existing));

        ItemAttributeDef updated = service.update(1L, new AttributeDefUpdateCommand(
                "MATERIAŁ", 5, null, null, null, null));

        assertThat(updated.getDisplayOrder()).isEqualTo(5);
    }

    @Test
    void deactivateIsSoft() {
        ItemAttributeDef existing = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        existing.setId(1L);
        when(defs.findById(1L)).thenReturn(Optional.of(existing));

        service.deactivate(1L);

        assertThat(existing.isActive()).isFalse();
    }

    @Test
    void reactivationIsAllowedWhenNoActiveClash() {
        ItemAttributeDef existing = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        existing.setId(1L);
        existing.setActive(false);
        when(defs.findById(1L)).thenReturn(Optional.of(existing));
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(7L, ItemType.INSTRUMENT))
                .thenReturn(List.of());

        service.update(1L, new AttributeDefUpdateCommand(null, null, null, null, null, true));

        assertThat(existing.isActive()).isTrue();
    }

    @Test
    void reactivationBlockedWhenActiveDuplicateExists() {
        ItemAttributeDef existing = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        existing.setId(1L);
        existing.setActive(false);
        when(defs.findById(1L)).thenReturn(Optional.of(existing));
        ItemAttributeDef twin = ItemAttributeDef.create(7L, "Materiał",
                AttributeDataType.SELECT, ItemType.INSTRUMENT, 0);
        twin.setId(2L);
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(7L, ItemType.INSTRUMENT))
                .thenReturn(List.of(twin));

        assertThatThrownBy(() -> service.update(1L, new AttributeDefUpdateCommand(
                null, null, null, null, null, true)))
                .isInstanceOf(AttributeDefDuplicateException.class);
        assertThat(existing.isActive()).isFalse(); // konflikt → stan nietknięty
    }

    @Test
    void updateOfMissingDefIsNotFound() {
        when(defs.findById(9L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(9L, new AttributeDefUpdateCommand(
                "X", null, null, null, null, null)))
                .isInstanceOf(AttributeDefNotFoundException.class);
    }
}
