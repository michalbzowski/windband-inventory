package pl.michalbzowski.inventory.application.command;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.SerialSequence;
import pl.michalbzowski.inventory.domain.inventory.SerialSequenceRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

@ExtendWith(MockitoExtension.class)
class ItemSerialAllocatorTest {

    @Mock
    private SerialSequenceRepository sequences;

    @Mock
    private InventoryItemRepository items;

    @InjectMocks
    private ItemSerialAllocator allocator;

    private InventoryItem freshInstrument(long bandId) {
        return InventoryItem.create(bandId, "Trąbka Bb", ItemType.INSTRUMENT, WarehouseType.MAIN,
                null, null, null);
    }

    private SerialSequence sequence(long bandId, String type, long lastValue) {
        SerialSequence seq = new SerialSequence();
        seq.setBandId(bandId);
        seq.setItemType(type);
        seq.setLastValue(lastValue);
        return seq;
    }

    @Test
    void assignsPrefixedCounterCodeForInstrument() {
        InventoryItem item = freshInstrument(7L);
        when(sequences.findByBandIdAndItemType(7L, "INSTRUMENT")).thenReturn(Optional.empty());
        when(sequences.save(any(SerialSequence.class))).thenAnswer(inv -> inv.getArgument(0));
        when(items.findByBandIdAndSerialNumber(any(), any())).thenReturn(Optional.empty());

        allocator.ensureSerial(item);

        assertThat(item.getSerialNumber()).isEqualTo("INS-0001");
    }

    @Test
    void bumpsCounterByOnePerNewItem() {
        InventoryItem item = freshInstrument(7L);
        SerialSequence existing = sequence(7L, "INSTRUMENT", 41L);
        when(sequences.findByBandIdAndItemType(7L, "INSTRUMENT")).thenReturn(Optional.of(existing));
        when(sequences.save(any(SerialSequence.class))).thenAnswer(inv -> inv.getArgument(0));
        when(items.findByBandIdAndSerialNumber(any(), any())).thenReturn(Optional.empty());

        allocator.ensureSerial(item);

        assertThat(item.getSerialNumber()).isEqualTo("INS-0042");
        assertThat(existing.getLastValue()).isEqualTo(42L);
    }

    @Test
    void leavesExplicitLegacyCodeUntouched() {
        InventoryItem item = InventoryItem.create(7L, "Trąbka Bb", ItemType.INSTRUMENT, WarehouseType.MAIN,
                "MRO-77", null, null);

        allocator.ensureSerial(item);

        assertThat(item.getSerialNumber()).isEqualTo("MRO-77");
        verify(sequences, never()).save(any());
        verify(items, never()).findByBandIdAndSerialNumber(any(), any());
    }

    @Test
    void skipsCollidingCodeAndTakesTheNextCounterValue() {
        InventoryItem item = freshInstrument(7L);
        SerialSequence existing = sequence(7L, "INSTRUMENT", 0L);
        InventoryItem occupant = InventoryItem.create(7L, "Zajęta", ItemType.INSTRUMENT, WarehouseType.MAIN,
                "INS-0001", null, null);
        when(sequences.findByBandIdAndItemType(7L, "INSTRUMENT")).thenReturn(Optional.of(existing));
        when(sequences.save(any(SerialSequence.class))).thenAnswer(inv -> inv.getArgument(0));
        when(items.findByBandIdAndSerialNumber(7L, "INS-0001")).thenReturn(Optional.of(occupant));
        when(items.findByBandIdAndSerialNumber(7L, "INS-0002")).thenReturn(Optional.empty());

        allocator.ensureSerial(item);

        assertThat(item.getSerialNumber()).isEqualTo("INS-0002");
        assertThat(existing.getLastValue()).isEqualTo(2L);
    }

    @Test
    void peekShowsNextCodeWithoutConsumingCounter() {
        SerialSequence existing = sequence(7L, "UNIFORM", 41L);
        when(sequences.findByBandIdAndItemType(7L, "UNIFORM")).thenReturn(Optional.of(existing));
        when(items.findByBandIdAndSerialNumber(7L, "UNI-0042")).thenReturn(Optional.empty());

        assertThat(allocator.peekNext(7L, ItemType.UNIFORM)).isEqualTo("UNI-0042");
        assertThat(existing.getLastValue()).isEqualTo(41L);
        verify(sequences, never()).save(any(SerialSequence.class));
    }

    @Test
    void peekSkipsLegacyTakenCode() {
        SerialSequence existing = sequence(7L, "INSTRUMENT", 0L);
        InventoryItem occupant = InventoryItem.create(7L, "Zajęta", ItemType.INSTRUMENT, WarehouseType.MAIN,
                "INS-0001", null, null);
        when(sequences.findByBandIdAndItemType(7L, "INSTRUMENT")).thenReturn(Optional.of(existing));
        when(items.findByBandIdAndSerialNumber(7L, "INS-0001")).thenReturn(Optional.of(occupant));
        when(items.findByBandIdAndSerialNumber(7L, "INS-0002")).thenReturn(Optional.empty());

        assertThat(allocator.peekNext(7L, ItemType.INSTRUMENT)).isEqualTo("INS-0002");
        verify(sequences, never()).save(any(SerialSequence.class));
    }

    @Test
    void peekStartsAtOneWhenCounterRowMissing() {
        when(sequences.findByBandIdAndItemType(7L, "AWARD")).thenReturn(Optional.empty());
        when(items.findByBandIdAndSerialNumber(7L, "ODZ-0001")).thenReturn(Optional.empty());

        assertThat(allocator.peekNext(7L, ItemType.AWARD)).isEqualTo("ODZ-0001");
        verify(sequences, never()).save(any(SerialSequence.class));
    }
}
