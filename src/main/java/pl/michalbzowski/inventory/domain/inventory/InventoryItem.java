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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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

    /** States an item may be returned into (analysis 3.1 "stan przy zwrocie"). */
    private static final Set<ItemLifecycleStatus> RETURNABLE_STATES = EnumSet.of(
            ItemLifecycleStatus.AVAILABLE, ItemLifecycleStatus.IN_SERVICE, ItemLifecycleStatus.LOST);

    /**
     * States whose item physically sits IN a warehouse (decision B6). ASSIGNED
     * is with a member, LOST/DISPOSED left the inventory — moving them would
     * corrupt the location truth the stocktake snapshot reads.
     */
    private static final Set<ItemLifecycleStatus> MOVABLE_STATES = EnumSet.of(
            ItemLifecycleStatus.AVAILABLE, ItemLifecycleStatus.IN_SERVICE, ItemLifecycleStatus.RETIRED);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** WM band id — authorization scope of every query (B1: read-only across the boundary). */
    @Column(name = "band_id", nullable = false)
    private Long bandId;

    /**
     * Optional internal label (legacy data, purchase materialization). The UI
     * identifies items by type + program-assigned code and never asks for it —
     * nullable since V16 (roadmap 2026-10-20, task 1).
     */
    @Column(length = 255)
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

    /**
     * Snapshot of the ACTIVE assignment (member id / "First Last" as taken
     * from WM at assign time). Kept on the item so lists and the future
     * stocktake snapshot (B7: card shows the person when assigned) stay
     * join-free; cleared on return. The authoritative history lives in
     * {@link ItemAssignment}.
     */
    @Column(name = "assigned_member_id")
    private Long assignedMemberId;

    @Column(name = "assigned_member_name")
    private String assignedMemberName;

    /**
     * Planned next service date (F4, analysis §4 item 2). Written ONLY by the
     * service workflow ({@code completeService}); the item editor never touches
     * it. Drives the "do serwisu" list ({@code serviceDue=true}).
     */
    @Column(name = "next_service_date")
    private LocalDate nextServiceDate;

    @OneToMany(mappedBy = "item", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ItemAttributeValue> attributeValues = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public static InventoryItem create(Long bandId, String name, ItemType type, WarehouseType warehouse,
            String serialNumber, String description, String notes) {
        Objects.requireNonNull(bandId, "bandId required");
        Objects.requireNonNull(type, "type required");
        InventoryItem item = new InventoryItem();
        item.bandId = bandId;
        item.name = blankToNull(name);
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
     * recreate the item instead. The warehouse is immutable here as well: a
     * DIFFERENT value is rejected because every physical move must exist in the
     * {@link WarehouseTransfer} history (B6) — pass the current value or null.
     * The serial code is program-assigned (ItemSerialAllocator) and therefore
     * NOT part of the update surface at all.
     */
    public void replaceDetails(String name, WarehouseType warehouse, String description, String notes) {
        this.name = blankToNull(name);
        if (warehouse != null && warehouse != this.warehouse) {
            throw new IllegalArgumentException(
                    "Magazynu nie zmienia się edycją pozycji — wykonaj transfer (POST /items/{id}/transfers)");
        }
        this.description = description;
        this.notes = notes;
    }

    /** Program-assigned code (PREFIX-nnnn). Blank/null removes it; callers own uniqueness. */
    public void assignSerial(String serialNumber) {
        this.serialNumber = blankToNull(serialNumber);
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

    /**
     * Assign to an ACTIVE band member (analysis 3.1; ADMIN-only at the REST
     * boundary). Only an AVAILABLE item may be assigned; the history row is
     * opened by the command service — here the snapshot + status move.
     */
    public void assignTo(long memberId, String memberName) {
        if (lifecycleStatus != ItemLifecycleStatus.AVAILABLE) {
            throw new IllegalStateException("Przypisać można wyłącznie pozycję o statusie AVAILABLE");
        }
        Objects.requireNonNull(memberName, "memberName required");
        this.assignedMemberId = memberId;
        this.assignedMemberName = memberName;
        this.lifecycleStatus = ItemLifecycleStatus.ASSIGNED;
    }

    /**
     * Return from the member into {@code returnedState} (null = AVAILABLE);
     * any other target must be one of IN_SERVICE/LOST (see RETURNABLE_STATES)
     * so the history cannot lie about the item.
     */
    public void unassign(ItemLifecycleStatus returnedState) {
        if (lifecycleStatus != ItemLifecycleStatus.ASSIGNED || assignedMemberId == null) {
            throw new IllegalStateException("Zwrócić można wyłącznie pozycję o statusie ASSIGNED");
        }
        ItemLifecycleStatus target = returnedState == null
                ? ItemLifecycleStatus.AVAILABLE : returnedState;
        if (!RETURNABLE_STATES.contains(target)) {
            throw new IllegalArgumentException(
                    "Zwrot może zakończyć się statusem AVAILABLE, IN_SERVICE lub LOST");
        }
        this.assignedMemberId = null;
        this.assignedMemberName = null;
        this.lifecycleStatus = target;
    }

    /**
     * Physical move between the fixed warehouses (decision B6). Only items that
     * actually sit in a warehouse may move; the caller writes the matching
     * {@link WarehouseTransfer} history row in the same transaction.
     */
    public void moveTo(WarehouseType target) {
        Objects.requireNonNull(target, "target warehouse required");
        if (target == warehouse) {
            throw new IllegalArgumentException("Pozycja jest już w magazynie " + warehouse);
        }
        if (!MOVABLE_STATES.contains(lifecycleStatus)) {
            throw new IllegalStateException("Pozycja w statusie " + lifecycleStatus
                    + " nie może zmienić magazynu");
        }
        this.warehouse = target;
    }

    /**
     * F4 service workflow: only an AVAILABLE item may be sent to service —
     * an ASSIGNED one must be returned first (optionally straight to
     * IN_SERVICE via {@link #unassign}). The command service opens the
     * {@link ItemServiceEvent} evidence row in the same transaction.
     */
    public void sendToService() {
        if (lifecycleStatus != ItemLifecycleStatus.AVAILABLE) {
            throw new IllegalStateException(
                    "Do serwisu można wysłać wyłącznie pozycję o statusie AVAILABLE");
        }
        this.lifecycleStatus = ItemLifecycleStatus.IN_SERVICE;
    }

    /**
     * Close the service: back to AVAILABLE; {@code nextServiceDate} (nullable)
     * becomes the plan driving the "do serwisu" list. Passing null CLEARS the
     * old plan — the completion is the only writer of the field.
     */
    public void completeService(LocalDate nextServiceDate) {
        if (lifecycleStatus != ItemLifecycleStatus.IN_SERVICE) {
            throw new IllegalStateException(
                    "Serwis można zamknąć wyłącznie dla pozycji o statusie IN_SERVICE");
        }
        this.lifecycleStatus = ItemLifecycleStatus.AVAILABLE;
        this.nextServiceDate = nextServiceDate;
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

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
