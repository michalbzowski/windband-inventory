package pl.michalbzowski.inventory.application.query;

import jakarta.persistence.criteria.Predicate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.ItemNotFoundException;
import pl.michalbzowski.inventory.application.query.ItemViews.AttributeValueView;
import pl.michalbzowski.inventory.application.query.ItemViews.AssignmentView;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemSummaryView;
import pl.michalbzowski.inventory.application.query.ItemViews.ItemView;
import pl.michalbzowski.inventory.application.query.ItemViews.WarehouseTransferView;
import pl.michalbzowski.inventory.domain.inventory.InventoryItem;
import pl.michalbzowski.inventory.domain.inventory.InventoryItemRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAssignmentRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeValue;
import pl.michalbzowski.inventory.domain.inventory.ItemLifecycleStatus;
import pl.michalbzowski.inventory.domain.inventory.ItemType;
import pl.michalbzowski.inventory.domain.inventory.WarehouseTransferRepository;
import pl.michalbzowski.inventory.domain.inventory.WarehouseType;

/**
 * Item read use-cases. Every read is band-scoped (authz by band on the REST
 * layer first, {@code bandId} predicate always present in the query).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ItemQueryService {

    private final InventoryItemRepository items;
    private final ItemAssignmentRepository assignments;
    private final WarehouseTransferRepository warehouseTransfers;

    /** Band of an existing item — lets the REST layer guard BEFORE mutation. */
    public long bandOf(long id) {
        return items.findById(id)
                .map(InventoryItem::getBandId)
                .orElseThrow(() -> new ItemNotFoundException(id));
    }

    public List<ItemSummaryView> list(long bandId, ItemType type, ItemLifecycleStatus status,
            WarehouseType warehouse, String search, Long assignedMemberId) {
        Specification<InventoryItem> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("bandId"), bandId));
            if (type != null) {
                predicates.add(cb.equal(root.get("type"), type));
            }
            if (status != null) {
                predicates.add(cb.equal(root.get("lifecycleStatus"), status));
            }
            if (warehouse != null) {
                predicates.add(cb.equal(root.get("warehouse"), warehouse));
            }
            if (assignedMemberId != null) {
                predicates.add(cb.equal(root.get("assignedMemberId"), assignedMemberId));
            }
            if (search != null && !search.isBlank()) {
                String like = "%" + search.trim().toLowerCase() + "%";
                // NULL serial number evaluates UNKNOWN under OR — name match still wins.
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("serialNumber")), like)));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        return items.findAll(spec).stream()
                .sorted(Comparator.comparing(InventoryItem::getName, String.CASE_INSENSITIVE_ORDER))
                .map(ItemQueryService::summary)
                .toList();
    }

    public ItemView detail(long id) {
        InventoryItem item = items.findById(id).orElseThrow(() -> new ItemNotFoundException(id));
        List<AttributeValueView> values = item.getAttributeValues().stream()
                .sorted(Comparator.comparing((ItemAttributeValue v) -> v.getAttributeDef().getDisplayOrder())
                        .thenComparing(v -> v.getAttributeDef().getName()))
                .map(v -> new AttributeValueView(v.getAttributeDef().getId(),
                        v.getAttributeDef().getName(), v.getAttributeDef().getDataType(),
                        v.getValueText()))
                .toList();
        return new ItemView(item.getId(), item.getBandId(), item.getName(), item.getType(),
                item.getLifecycleStatus(), item.getWarehouse(), item.getSerialNumber(),
                item.getDescription(), item.getNotes(), values,
                item.getAssignedMemberId(), item.getAssignedMemberName());
    }

    /** Assignment history of one item, newest first (members may read it). */
    public List<AssignmentView> assignments(long itemId) {
        if (!items.existsById(itemId)) {
            throw new ItemNotFoundException(itemId);
        }
        return assignments.findByItemIdOrderByAssignedAtDescIdDesc(itemId).stream()
                .map(a -> new AssignmentView(a.getId(), a.getMemberId(), a.getMemberName(),
                        a.getAssignedAt(), a.getReturnedAt(), a.getReturnedState(),
                        a.getAssignNote(), a.getReturnNote()))
                .toList();
    }

    /** Transfer history of one item, newest first (readable by every member). */
    public List<WarehouseTransferView> transfers(long itemId) {
        if (!items.existsById(itemId)) {
            throw new ItemNotFoundException(itemId);
        }
        return warehouseTransfers.findByItemIdOrderByTransferredAtDescIdDesc(itemId).stream()
                .map(t -> new WarehouseTransferView(t.getId(), t.getFromWarehouse(),
                        t.getToWarehouse(), t.getNote(), t.getTransferredAt()))
                .toList();
    }

    private static ItemSummaryView summary(InventoryItem item) {
        return new ItemSummaryView(item.getId(), item.getName(), item.getType(),
                item.getLifecycleStatus(), item.getWarehouse(), item.getSerialNumber(),
                item.getAssignedMemberId(), item.getAssignedMemberName());
    }
}
