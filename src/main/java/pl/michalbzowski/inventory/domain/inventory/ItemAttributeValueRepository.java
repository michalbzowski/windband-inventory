package pl.michalbzowski.inventory.domain.inventory;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Read port for attribute values used by the list projection (B16: values of
 * {@code display_in_list} definitions ride on the item summary rows). The
 * write path stays aggregate-only ({@code InventoryItem.replaceAttributeValues}).
 */
public interface ItemAttributeValueRepository extends JpaRepository<ItemAttributeValue, Long> {

    /** Batch read for the list slice: one query for all rows, all marked definitions. */
    List<ItemAttributeValue> findByItem_IdInAndAttributeDef_IdIn(Collection<Long> itemIds,
                                                                 Collection<Long> defIds);
}
