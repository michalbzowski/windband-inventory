package pl.michalbzowski.inventory.domain.inventory;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A declaration of private/external possession (backlog v1.x item 4, B14):
 * an evidence row stating the item physically sits OUTSIDE the warehouse
 * system — PRIVATE at a member's place, EXTERNAL in some outside location.
 * It never mutates warehouse or lifecycle status (the warehouse is formal
 * truth; the declaration is field truth; their merge is the v1.x full picture).
 *
 * <p>Name/serial are snapshotted at declaration time (like needs and stocktake
 * lines) so later item edits cannot rewrite evidence. One ACTIVE row per item
 * (partial unique index); ACTIVE → REVOKED is final — a corrected fact is a
 * NEW row, the old one stays as history.
 */
@Entity
@Table(name = "ownership_declarations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OwnershipDeclaration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "band_id", nullable = false)
    private Long bandId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private InventoryItem item;

    /** Snapshot from inventory_items at declaration time; nullable since V18
     *  (V16 made the item name optional — the serial is the identifier). */
    @Column(name = "name", length = 200)
    private String name;

    @Column(name = "serial_number", length = 120)
    private String serialNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 16)
    private DeclarationType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private DeclarationStatus status;

    /** Whose place it is at — only for PRIVATE (or a named custodian of EXTERNAL). */
    @Column(name = "holder_member_id")
    private Long holderMemberId;

    @Column(name = "holder_name", length = 200)
    private String holderName;

    /** Where it sits outside the warehouses — required for EXTERNAL. */
    @Column(name = "location_text", length = 200)
    private String locationText;

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @Column(name = "declared_by_member_id")
    private Long declaredByMemberId;

    @Column(name = "declared_by_member_name", length = 200)
    private String declaredByMemberName;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "revoked_at")
    private LocalDateTime revokedAt;

    @Column(name = "revoked_by", length = 200)
    private String revokedBy;

    @Column(name = "revoked_note", columnDefinition = "TEXT")
    private String revokedNote;

    /** Records a new declaration; item identity is frozen into the row (B1 scoping). */
    public static OwnershipDeclaration declare(InventoryItem item, DeclarationType type,
            Long holderMemberId, String holderName, String locationText, String note,
            Long declaredByMemberId, String declaredByMemberName) {
        Objects.requireNonNull(item, "item required");
        Objects.requireNonNull(type, "type required");
        if (item.getLifecycleStatus() == ItemLifecycleStatus.ASSIGNED) {
            throw new IllegalStateException(
                    "Pozycja przypisana formalnie jest już u osoby — deklaruj po zwrocie (409 to nie przypadek)");
        }
        if (type == DeclarationType.PRIVATE && holderMemberId == null) {
            throw new IllegalArgumentException("Deklaracja prywatna wymaga osoby (holderMemberId)");
        }
        if (type == DeclarationType.EXTERNAL && (locationText == null || locationText.isBlank())) {
            throw new IllegalArgumentException("Deklaracja zewnętrzna wymaga opisu miejsca (locationText)");
        }
        OwnershipDeclaration declaration = new OwnershipDeclaration();
        declaration.bandId = item.getBandId();
        declaration.item = item;
        declaration.name = item.getName();
        declaration.serialNumber = item.getSerialNumber();
        declaration.type = type;
        declaration.status = DeclarationStatus.ACTIVE;
        declaration.holderMemberId = holderMemberId;
        declaration.holderName = holderName;
        declaration.locationText = locationText == null ? null : locationText.trim();
        declaration.note = note;
        declaration.declaredByMemberId = declaredByMemberId;
        declaration.declaredByMemberName = declaredByMemberName;
        declaration.createdAt = LocalDateTime.now();
        return declaration;
    }

    /** ACTIVE → REVOKED is final; reactivating would rewrite evidence — declare anew instead. */
    public void revoke(String note, String revokedBy) {
        if (status != DeclarationStatus.ACTIVE) {
            throw new IllegalStateException("Odwołać można tylko aktywną deklarację");
        }
        this.status = DeclarationStatus.REVOKED;
        this.revokedAt = LocalDateTime.now();
        this.revokedBy = revokedBy;
        if (note != null && !note.isBlank()) {
            this.revokedNote = note;
        }
    }

    public boolean isActive() {
        return status == DeclarationStatus.ACTIVE;
    }
}
