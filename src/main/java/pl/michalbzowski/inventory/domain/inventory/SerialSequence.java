package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Per-(band, type) counter backing program-assigned item codes (INS-0042).
 * Monotonic within a band+type pair; the code itself is stored on
 * {@link InventoryItem#getSerialNumber()} and never edited afterwards.
 */
@Entity
@Table(name = "serial_sequences")
public class SerialSequence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    /** Persisted as the enum NAME so relabeling/moving constants never renumbers. */
    @Column(name = "item_type", nullable = false, length = 32)
    private String itemType;

    @Column(name = "last_value", nullable = false)
    private long lastValue;

    public Long getId() {
        return id;
    }

    public Long getBandId() {
        return bandId;
    }

    public void setBandId(Long bandId) {
        this.bandId = bandId;
    }

    public String getItemType() {
        return itemType;
    }

    public void setItemType(String itemType) {
        this.itemType = itemType;
    }

    public long getLastValue() {
        return lastValue;
    }

    public void setLastValue(long lastValue) {
        this.lastValue = lastValue;
    }
}
