package pl.michalbzowski.inventory.adapter.in.rest;

import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.michalbzowski.inventory.adapter.in.rest.dto.AttributeDefCreateRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.AttributeDefUpdateRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.AttributeDefCommandService;
import pl.michalbzowski.inventory.application.query.AttributeDefQueryService;
import pl.michalbzowski.inventory.application.query.ItemViews.AttributeDefView;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * REST contract for attribute definitions — drives the two-step item form
 * (wybór typu → render definicji). Reads: any band member; writes: band ADMIN.
 * DELETE deactivates (history-safe), it never hard-removes referenced defs.
 */
@RestController
@RequestMapping("/api/inventory/attribute-defs")
@RequiredArgsConstructor
public class AttributeDefController {

    private final AttributeDefQueryService queries;
    private final AttributeDefCommandService commands;
    private final BandAccessGuard guard;

    @GetMapping
    public List<AttributeDefView> list(
            @RequestParam("bandId") long bandId,
            @RequestParam(required = false) ItemType type,
            @RequestParam(name = "all", required = false, defaultValue = "false") boolean includeInactive) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId, type, includeInactive);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AttributeDefView create(@RequestParam("bandId") long bandId,
            @Valid @RequestBody AttributeDefCreateRequest request) {
        guard.requireAdmin(bandId, BearerTokens.require());
        return queries.viewOf(commands.create(bandId, request.toCommand()));
    }

    @PutMapping("/{id}")
    public AttributeDefView update(@PathVariable long id,
            @Valid @RequestBody AttributeDefUpdateRequest request) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        return queries.viewOf(commands.update(id, request.toCommand()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deactivate(@PathVariable long id) {
        long bandId = queries.bandOf(id);
        guard.requireAdmin(bandId, BearerTokens.require());
        commands.deactivate(id);
    }
}
