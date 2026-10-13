package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Dynamic attribute definition scoped per band and per {@link ItemType}
 * (decision B6 / inherited D1). No global definitions in this app: every
 * definition belongs to exactly one band (B1 keeps WM concepts out).
 */
@Entity
@Table(name = "item_attribute_defs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemAttributeDef {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false)
    private ItemType itemType;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "data_type", nullable = false)
    private AttributeDataType dataType;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "is_required", nullable = false)
    private boolean required;

    @Column(name = "display_in_list", nullable = false)
    private boolean displayInList;

    /** Deactivation instead of hard delete once values exist (history-safe). */
    @Column(nullable = false)
    private boolean active = true;

    /**
     * Predefined options for SELECT/MULTI: either a JSON array
     * ({@code ["A","B"]}) or semicolon-separated plain text ({@code A;B}).
     */
    @Column(columnDefinition = "TEXT")
    private String options;

    public static ItemAttributeDef create(Long bandId, String name, AttributeDataType dataType,
            ItemType itemType, Integer displayOrder) {
        Objects.requireNonNull(bandId, "bandId required");
        Objects.requireNonNull(name, "name required");
        Objects.requireNonNull(dataType, "dataType required");
        Objects.requireNonNull(itemType, "itemType required");
        if (name.isBlank()) {
            throw new IllegalArgumentException("name required");
        }
        ItemAttributeDef def = new ItemAttributeDef();
        def.bandId = bandId;
        def.name = name.trim();
        def.dataType = dataType;
        def.itemType = itemType;
        def.displayOrder = displayOrder != null ? displayOrder : 0;
        return def;
    }

    public List<String> parsedOptions() {
        return AttributeValueFormat.parseOptions(options);
    }

    /** True when the raw options string is syntactically usable for this type. */
    public boolean optionsWellFormed() {
        return dataType != AttributeDataType.SELECT && dataType != AttributeDataType.MULTI
                || AttributeValueFormat.optionsOk(options);
    }
}
