package pl.michalbzowski.inventory.adapter.in.rest;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.michalbzowski.inventory.adapter.in.rest.dto.DeclarationCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.DeclarationRevokeRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.DeclarationCommandService;
import pl.michalbzowski.inventory.application.query.DeclarationQueryService;
import pl.michalbzowski.inventory.application.query.DeclarationQueryService.DeclarationView;
import pl.michalbzowski.inventory.domain.inventory.DeclarationStatus;
import pl.michalbzowski.inventory.domain.inventory.DeclarationType;

/**
 * Possession declarations REST surface (backlog v1.x item 4, B14).
 * Reads: any band member. Creates: any band member too — field truth is
 * reported by whoever sees it (roster re-validated server-side, B10).
 * Revokes: band ADMIN (B8) — reversals of evidence state stay admin-owned.
 */
@RestController
@RequestMapping("/api/inventory/declarations")
@PreAuthorize("isAuthenticated()")
public class DeclarationController {

    private final DeclarationQueryService queries;
    private final DeclarationCommandService commands;
    private final BandAccessGuard guard;

    public DeclarationController(DeclarationQueryService queries, DeclarationCommandService commands,
            BandAccessGuard guard) {
        this.queries = queries;
        this.commands = commands;
        this.guard = guard;
    }

    @GetMapping
    public List<DeclarationView> list(@RequestParam("bandId") long bandId,
            @RequestParam(value = "type", required = false) DeclarationType type,
            @RequestParam(value = "status", required = false) DeclarationStatus status,
            @RequestParam(value = "holderMemberId", required = false) Long holderMemberId) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, type, status, holderMemberId);
    }

    @GetMapping("/{id}")
    public DeclarationView detail(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.detail(id);
    }

    /** Any member reports where the item actually sits (B14). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DeclarationView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody DeclarationCreateRequest request) {
        guard.requireMember(bandId, BearerTokens.require());
        var declaration = commands.create(BearerTokens.require(), bandId, request.itemId(), request.type(),
                request.holderMemberId(), request.locationText(), request.note(),
                request.declaredByMemberId());
        return queries.detail(declaration.getId());
    }

    /** ADMIN only: ACTIVE → REVOKED, final. */
    @PostMapping("/{id}/revoke")
    public DeclarationView revoke(@PathVariable long id,
            @Valid @RequestBody DeclarationRevokeRequest request) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        var declaration = commands.revoke(id, request.note());
        return queries.detail(declaration.getId());
    }
}
