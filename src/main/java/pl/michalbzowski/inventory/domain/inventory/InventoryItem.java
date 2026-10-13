package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * The single concrete item model (decision D1, one table, one row per item).
 *
 * <p>Scope notes for THIS app (unlike the WM predecessor module):
 * <ul>
 *   <li>{@code bandId} is a plain WM band identifier — inventory must NOT
 *       duplicate the Band entity (decision B1), so there is no JPA relation.</li>
 *   <li>No Envers/audit columns here: domain history that v1 needs (e.g.
 *       assignment records) is modelled explicitly per slice.</li>
 * </ul>
 */
@Entity
@Table(name = "inventory_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** WM band id — authorization scope of every query (B1: read-only across the boundary). */
    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false)
    private ItemType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "lifecycle_status", nullable = false)
    private ItemLifecycleStatus lifecycleStatus;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WarehouseType warehouse;

    @Column(name = "serial_number")
    private String serialNumber;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemAttributeValue> attributeValues = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static InventoryItem create(Long bandId, String name, ItemType type, WarehouseType warehouse,
            String serialNumber, String description, String notes) {
        Objects.requireNonNull(bandId, "bandId required");
        Objects.requireNonNull(name, "name required");
        Objects.requireNonNull(type, "type required");
        InventoryItem item = new InventoryItem();
        item.bandId = bandId;
        item.name = requireNotBlank(name, "name required");
        item.type = type;
        item.warehouse = warehouse != null ? warehouse : WarehouseType.MAIN;
        item.lifecycleStatus = ItemLifecycleStatus.AVAILABLE;
        item.serialNumber = blankToNull(serialNumber);
        item.description = description;
        item.notes = notes;
        return item;
    }

    /**
     * Full-field update of the editable basics. {@code type} is immutable in v1
     * (attributes are defined per type — changing it would orphan values);
     * recreate the item instead.
     */
    public void replaceDetails(String name, WarehouseType warehouse, String serialNumber,
            String description, String notes) {
        this.name = requireNotBlank(name, "name required");
        if (warehouse != null) {
            this.warehouse = warehouse;
        }
        this.serialNumber = blankToNull(serialNumber);
        this.description = description;
        this.notes = notes;
    }

    /**
     * Replaces the whole attribute-value set (values are re-validated before this
     * call). Existing rows for a definition are updated IN PLACE: clear+add would
     * make Hibernate flush an INSERT of the new (item,def) row before the DELETE
     * of the old one, violating uq_attr_values_item_def.
     */
    public void replaceAttributes(List<ItemAttributeValue> values) {
        Map<Long, ItemAttributeValue> byDefId = new HashMap<>();
        for (ItemAttributeValue existing : attributeValues) {
            byDefId.put(existing.getAttributeDef().getId(), existing);
        }
        List<ItemAttributeValue> merged = new ArrayList<>();
        for (ItemAttributeValue incoming : values) {
            ItemAttributeValue existing = byDefId.get(incoming.getAttributeDef().getId());
            if (existing != null) {
                existing.changeValue(incoming.getValueText());
                merged.add(existing);
            } else {
                merged.add(incoming);
            }
        }
        attributeValues.clear();
        attributeValues.addAll(merged);
    }

    /** Lifecycle transitions are driven by the assignment/return and service slices. */
    void changeLifecycle(ItemLifecycleStatus newStatus) {
        this.lifecycleStatus = Objects.requireNonNull(newStatus, "newStatus required");
    }

    @PrePersist
    void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
        if (lifecycleStatus == null) {
            lifecycleStatus = ItemLifecycleStatus.AVAILABLE;
        }
        if (warehouse == null) {
            warehouse = WarehouseType.MAIN;
        }
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    private static String requireNotBlank(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
