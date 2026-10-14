package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * One normalized attribute value of one item. Storage column is
 * {@code value_text} — {@code value} collides with reserved words in
 * some engines (WM precedent: always suffix such columns).
 */
@Entity
@Table(name = "item_attribute_values",
        uniqueConstraints = @UniqueConstraint(name = "uq_attr_values_item_def",
                columnNames = {"item_id", "attribute_def_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ItemAttributeValue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    /** EAGER: view building needs the definition metadata with the value. */
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "attribute_def_id", nullable = false)
    private ItemAttributeDef attributeDef;

    @Column(name = "value_text", columnDefinition = "TEXT")
    private String valueText;

    public ItemAttributeValue(InventoryItem item, ItemAttributeDef attributeDef, String valueText) {
        this.item = item;
        this.attributeDef = attributeDef;
        this.valueText = valueText;
    }

    /** In-place update used when an item edit re-sets the same definition. */
    public void changeValue(String newValueText) {
        this.valueText = newValueText;
    }
}
