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
import pl.michalbzowski.inventory.adapter.in.rest.dto.NeedCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.NeedStatusRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.NeedCommandService;
import pl.michalbzowski.inventory.application.query.NeedQueryService;
import pl.michalbzowski.inventory.application.query.NeedQueryService.NeedView;
import pl.michalbzowski.inventory.domain.inventory.NeedStatus;

/**
 * Needs/orders REST surface (backlog v1.x item 3). The BRAK action of the
 * stocktake report lands here (B9 unfreeze). Reads: any band member;
 * writes: band ADMIN (B8) — same guard split as items/service workflow.
 */
@RestController
@RequestMapping("/api/inventory/needs")
@PreAuthorize("isAuthenticated()")
public class NeedController {

    private final NeedQueryService queries;
    private final NeedCommandService commands;
    private final BandAccessGuard guard;

    public NeedController(NeedQueryService queries, NeedCommandService commands, BandAccessGuard guard) {
        this.queries = queries;
        this.commands = commands;
        this.guard = guard;
    }

    @GetMapping
    public List<NeedView> list(@RequestParam("bandId") long bandId,
            @RequestParam(value = "status", required = false) NeedStatus status) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, status);
    }

    @GetMapping("/{id}")
    public NeedView detail(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.detail(id);
    }

    /** ADMIN records a need (report action or manual); starts as OPEN. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public NeedView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody NeedCreateRequest request) {
        guard.requireAdmin(bandId, BearerTokens.require());
        var need = commands.create(BearerTokens.require(), bandId, request.itemId(),
                request.quantity(), request.note(), request.createdMemberId());
        return queries.detail(need.getId());
    }

    /** ADMIN walks the flow OPEN → ORDERED → RECEIVED / CANCELLED. */
    @PostMapping("/{id}/status")
    public NeedView changeStatus(@PathVariable long id, @Valid @RequestBody NeedStatusRequest request) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        var need = commands.changeStatus(id, request.status(), request.note());
        return queries.detail(need.getId());
    }
}
