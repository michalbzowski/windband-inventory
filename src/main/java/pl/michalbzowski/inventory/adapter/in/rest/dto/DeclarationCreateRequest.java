package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import pl.michalbzowski.inventory.domain.inventory.DeclarationType;

/** POST /declarations body (B14): type decides which fields are mandatory. */
public record DeclarationCreateRequest(
        @NotNull(message = "itemId wymagany") Long itemId,
        @NotNull(message = "type wymagany") DeclarationType type,
        Long holderMemberId,
        @Size(max = 200, message = "opis miejsca maks. 200 znaków") String locationText,
        @Size(max = 2000, message = "notatka maks. 2000 znaków") String note,
        @NotNull(message = "declaredByMemberId wymagany") Long declaredByMemberId) {
}
