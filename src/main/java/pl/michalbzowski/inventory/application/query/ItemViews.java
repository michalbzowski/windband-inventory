package pl.michalbzowski.inventory.application.query;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import pl.michalbzowski.inventory.domain.inventory.AttributeDataType;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Read models for the items REST API. Summary rows carry no attribute values
 * (band lists stay light; attribute filtering joins come with the filter
 * slice). {@code serialNumber} is shown because the stocktake card design
 * (B7) reads name + serial + assignee.
 */
public final class ItemViews {

    private ItemViews() {
    }

    public record AttributeValueView(long attributeDefId, String name, AttributeDataType dataType,
                                     String value) {
    }

    public record ItemSummaryView(long id, String name, ItemType type,
                                  ItemLifecycleStatus lifecycleStatus, WarehouseType warehouse,
                                  String serialNumber, Long assignedMemberId,
                                  String assignedMemberName) {
    }

    public record ItemView(long id, long bandId, String name, ItemType type,
                           ItemLifecycleStatus lifecycleStatus, WarehouseType warehouse,
                           String serialNumber, String description, String notes,
                           List<AttributeValueView> attributes, Long assignedMemberId,
                           String assignedMemberName, LocalDate nextServiceDate) {
    }

    /** One service-workflow event (F4): open send + possibly completed return. */
    public record ServiceEventView(long id, LocalDateTime sentAt, String sentNote,
                                   LocalDateTime completedAt, String completedNote,
                                   LocalDate nextServiceDate) {
    }

    /** One assignment-history event (open + possibly closed return). */
    public record AssignmentView(long id, long memberId, String memberName,
                                 LocalDateTime assignedAt, LocalDateTime returnedAt,
                                 ItemLifecycleStatus returnedState, String assignNote,
                                 String returnNote) {
    }

    /** One warehouse-movement event (decision B6: transfer history). */
    public record WarehouseTransferView(long id, WarehouseType fromWarehouse,
                                       WarehouseType toWarehouse, String note,
                                       LocalDateTime transferredAt) {
    }

    public record AttributeDefView(long id, long bandId, ItemType itemType, String name,
                                   AttributeDataType dataType, int displayOrder, boolean required,
                                   boolean displayInList, List<String> options, boolean active) {
    }
}
