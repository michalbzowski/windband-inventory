package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StocktakeLineRepository extends JpaRepository<StocktakeLine, Long> {

    // Underscore paths: the entity exposes item/stocktake associations (no flat
    // id columns); explicit nested paths avoid shadowing by read-only helpers.
    List<StocktakeLine> findByStocktake_IdOrderByIdAsc(Long stocktakeId);

    /** One physical unit may appear in a stocktake exactly once (D1, F5.2). */
    boolean existsByStocktake_IdAndItem_Id(Long stocktakeId, Long itemId);

    /** Existence gate for item deletion: stocktake evidence makes items non-deletable. */
    boolean existsByItem_Id(Long itemId);
}
