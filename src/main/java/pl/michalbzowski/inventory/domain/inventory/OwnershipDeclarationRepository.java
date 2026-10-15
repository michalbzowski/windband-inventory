package pl.michalbzowski.inventory.domain.inventory;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnershipDeclarationRepository extends JpaRepository<OwnershipDeclaration, Long> {

    List<OwnershipDeclaration> findByBandIdOrderByCreatedAtDescIdDesc(long bandId);

    List<OwnershipDeclaration> findByBandIdAndTypeOrderByCreatedAtDescIdDesc(long bandId, DeclarationType type);

    List<OwnershipDeclaration> findByBandIdAndStatusOrderByCreatedAtDescIdDesc(long bandId, DeclarationStatus status);

    List<OwnershipDeclaration> findByBandIdAndTypeAndStatusOrderByCreatedAtDescIdDesc(
            long bandId, DeclarationType type, DeclarationStatus status);

    List<OwnershipDeclaration> findByBandIdAndHolderMemberIdOrderByCreatedAtDescIdDesc(
            long bandId, long holderMemberId);

    boolean existsByItemIdAndStatus(long itemId, DeclarationStatus status);

    boolean existsByItemId(long itemId);
}
