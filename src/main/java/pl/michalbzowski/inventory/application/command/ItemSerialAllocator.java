package pl.michalbzowski.inventory.application.command;

import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.SerialSequence;
import pl.michalbzowski.inventory.domain.inventory.SerialSequenceRepository;

/**
 * Program-assigned item codes (roadmap 2026-10-20, task 2): a short prefix per
 * {@link ItemType} plus a band-local running counter — one new item bumps it by
 * exactly one. The user never enters or edits the code: forms hide the field
 * and the update path no longer accepts it.
 *
 * <p>Collision safety: a candidate only collides if a manual legacy code took
 * the exact form PREFIX-nnnn in THIS band — then the counter just moves on to
 * the next value (numbers are consumed, uniqueness is never lost).
 */
@Service
@RequiredArgsConstructor
public class ItemSerialAllocator {

    /** Prefixes deliberately mirror Polish category names (instrumenty, umundurowanie…). */
    private static final Map<ItemType, String> PREFIX = Map.of(
            ItemType.INSTRUMENT, "INS",
            ItemType.UNIFORM, "UNI",
            ItemType.AWARD, "ODZ",
            ItemType.SHEET_MUSIC, "NUT",
            ItemType.EQUIPMENT, "SPR",
            ItemType.CONSUMABLE, "MEK",
            ItemType.DOCUMENT, "DOC",
            ItemType.OTHER, "INN");

    private static final int MAX_CANDIDATES = 50;

    private final SerialSequenceRepository sequences;
    private final InventoryItemRepository items;

    /**
     * No-op when the item already carries a code (explicit create payload / legacy data);
     * otherwise assigns the first free PREFIX-nnnn of its band+type.
     */
    @Transactional
    public void ensureSerial(InventoryItem item) {
        if (item.getSerialNumber() != null && !item.getSerialNumber().isBlank()) {
            return;
        }
        String typeName = typeOf(item);
        for (int candidate = 0; candidate < MAX_CANDIDATES; candidate++) {
            try {
                SerialSequence seq = sequences.findByBandIdAndItemType(item.getBandId(), typeName)
                        .orElseGet(() -> {
                            SerialSequence fresh = new SerialSequence();
                            fresh.setBandId(item.getBandId());
                            fresh.setItemType(typeName);
                            fresh.setLastValue(0L);
                            return sequences.save(fresh);
                        });
                long value = seq.getLastValue() + 1L;
                seq.setLastValue(value);
                sequences.save(seq);
                String code = PREFIX.getOrDefault(item.getType(), "INN") + "-" + String.format("%04d", value);
                if (isFree(item, code)) {
                    item.assignSerial(code);
                    return;
                }
            } catch (DataIntegrityViolationException lostInsertRace) {
                // Another transaction won the initial row insert this round; retry.
            }
        }
        throw new IllegalStateException(
                "Brak wolnych kodów seryjnych dla zespołu " + item.getBandId() + " — skontaktuj się z administratorem");
    }

    private static String typeOf(InventoryItem item) {
        return item.getType() == null ? ItemType.OTHER.name() : item.getType().name();
    }

    /**
     * Domain rule: (band, serial) must stay unique. A candidate collides unless the
     * holding row IS this item — impossible here for a fresh code, so in practice
     * "no holder" is the only free outcome. Null-safe for unsaved units in tests.
     */
    private boolean isFree(InventoryItem item, String candidate) {
        Optional<InventoryItem> holder = items.findByBandIdAndSerialNumber(item.getBandId(), candidate);
        if (holder.isEmpty()) {
            return true;
        }
        Long holderId = holder.get().getId();
        return holderId != null && item.getId() != null && holderId.equals(item.getId());
    }
}
