package pl.michalbzowski.inventory.domain.inventory;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StocktakeRepository extends JpaRepository<Stocktake, Long> {

    List<Stocktake> findByBandIdOrderByIdDesc(Long bandId);

    /** Single-open invariant: a band has at most one editable (DRAFT/IN_PROGRESS) stocktake. */
    boolean existsByBandIdAndStatusIn(Long bandId, Collection<StocktakeStatus> statuses);
}
