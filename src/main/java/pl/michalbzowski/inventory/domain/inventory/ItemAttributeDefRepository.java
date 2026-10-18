package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Attribute-definition repository port. Definitions are always band-scoped;
 * the unique (band, type, name-ignore-case) rule is enforced here before
 * insert, mirroring the expression index in Flyway.
 */
public interface ItemAttributeDefRepository extends JpaRepository<ItemAttributeDef, Long> {

    List<ItemAttributeDef> findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(
            Long bandId, ItemType itemType);

    List<ItemAttributeDef> findByBandIdAndActiveTrueOrderByItemTypeAscDisplayOrderAscNameAsc(Long bandId);

    List<ItemAttributeDef> findByBandIdOrderByItemTypeAscDisplayOrderAscNameAsc(Long bandId);

    boolean existsByBandIdAndItemTypeAndNameIgnoreCaseAndActiveTrue(
            Long bandId, ItemType itemType, String name);

    /** Aktywne/gaśnięte dzieci warunkujące daną definicję-parenta (v2.0 rules). */
    List<ItemAttributeDef> findByDependsOnDefId(Long dependsOnDefId);
}
