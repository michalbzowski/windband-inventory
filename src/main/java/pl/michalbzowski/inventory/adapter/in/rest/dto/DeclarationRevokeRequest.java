package pl.michalbzowski.inventory.adapter.in.rest.dto;

import jakarta.validation.constraints.Size;

/** POST /declarations/{id}/revoke body (B14). Actor is the ADMIN behind the guard —
 * same convention as the needs status walk: optional note, no member id round-trip. */
public record DeclarationRevokeRequest(
        @Size(max = 2000, message = "notatka maks. 2000 znaków") String note) {
}
