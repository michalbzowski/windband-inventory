package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.domain.inventory.AttributeValueInvalidException;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

@ExtendWith(MockitoExtension.class)
class ItemCommandServiceTest {

    @Mock
    private InventoryItemRepository items;

    @Mock
    private ItemAttributeDefRepository defs;

    @InjectMocks
    private ItemCommandService service;

    private static ItemAttributeDef sizeDef(long id, long bandId) {
        ItemAttributeDef def = ItemAttributeDef.create(bandId, "Rozmiar",
                pl.michalbzowski.inventory.domain.inventory.AttributeDataType.SELECT,
                ItemType.UNIFORM, 1);
        def.setId(id);
        def.setOptions("S;M;L");
        return def;
    }

    private ItemWriteCommand cmdWith(Long defId, String value) {
        return new ItemWriteCommand("Marynarka", ItemType.UNIFORM, WarehouseType.MAIN, null,
                null, null, List.of(new AttributeValueCommand(defId, value)));
    }

    @Test
    void createStoresNormalizedAttributeValue() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, 7L)));
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(7L, ItemType.UNIFORM))
                .thenReturn(List.of());
        when(items.save(any(InventoryItem.class))).thenAnswer(inv -> inv.getArgument(0));

        InventoryItem saved = service.create(7L, cmdWith(10L, "m"));

        assertThat(saved.getAttributeValues()).hasSize(1);
        assertThat(saved.getAttributeValues().get(0).getValueText()).isEqualTo("m");
        assertThat(saved.getLifecycleStatus())
                .isEqualTo(pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus.AVAILABLE);
    }

    @Test
    void rejectsDefinitionOfForeignBand() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, 99L)));

        assertThatThrownBy(() -> service.create(7L, cmdWith(10L, "M")))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("nie pasuje");
    }

    @Test
    void rejectsRequiredAttributeMissing() {
        ItemAttributeDef required = sizeDef(10L, 7L);
        required.setRequired(true);
        when(defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(7L, ItemType.UNIFORM))
                .thenReturn(List.of(required));

        assertThatThrownBy(() -> service.create(7L,
                new ItemWriteCommand("Marynarka", ItemType.UNIFORM, null, null, null, null, List.of())))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("wymagany");
    }

    @Test
    void rejectsDuplicateDefinitionInPayload() {
        when(defs.findById(10L)).thenReturn(Optional.of(sizeDef(10L, 7L)));

        assertThatThrownBy(() -> service.create(7L, new ItemWriteCommand("X", ItemType.UNIFORM,
                null, null, null, null,
                List.of(new AttributeValueCommand(10L, "S"), new AttributeValueCommand(10L, "M")))))
                .isInstanceOf(AttributeValueInvalidException.class)
                .hasMessageContaining("Podwójna");
    }

    @Test
    void rejectsTakenSerialNumber() {
        InventoryItem taken = InventoryItem.create(7L, "Inna", ItemType.UNIFORM, null,
                "SN-1", null, null);
        taken.setId(55L);
        when(items.findByBandIdAndSerialNumber(7L, "SN-1")).thenReturn(Optional.of(taken));

        assertThatThrownBy(() -> service.create(7L, new ItemWriteCommand("Nowa", ItemType.UNIFORM,
                null, "SN-1", null, null, List.of())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("zajęty");
    }
}
