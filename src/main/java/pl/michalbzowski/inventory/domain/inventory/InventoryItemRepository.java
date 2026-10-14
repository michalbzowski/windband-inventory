package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * Item repository port (Spring Data, house pattern as in WM). Every lookup
 * goes through band scoping in the query layer — items are never served
 * across bands.
 */
public interface InventoryItemRepository extends JpaRepository<InventoryItem, Long>,
        JpaSpecificationExecutor<InventoryItem> {

    List<InventoryItem> findByBandIdOrderByNameAsc(Long bandId);

    Optional<InventoryItem> findByBandIdAndSerialNumber(Long bandId, String serialNumber);
}
