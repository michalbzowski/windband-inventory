package pl.michalbzowski.inventory.adapter.in.rest;

import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import pl.michalbzowski.inventory.adapter.in.rest.dto.CountLineRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.ExtraLineRequest;
import pl.michalbzowski.inventory.adapter.in.rest.dto.StocktakeStartRequest;
import pl.michalbzowski.inventory.adapter.in.security.BearerTokens;
import pl.michalbzowski.inventory.application.authz.BandAccessGuard;
import pl.michalbzowski.inventory.application.command.StocktakeCommandService;
import pl.michalbzowski.inventory.application.query.StocktakeQueryService;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeLineView;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeSummaryView;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeView;
import pl.michalbzowski.inventory.domain.inventory.FoundState;
import pl.michalbzowski.inventory.domain.inventory.Stocktake;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLine;

/**
 * F5 stocktake REST contract (analysis 3.2; the "stocktake-{id}" shorthand in
 * the frozen doc is realized as canonical {@code /stocktakes/{id}/...}).
 *
 * <p>Roles (B8 + §2): start/pause/resume/close = band ADMIN; counting and
 * reading = any band member (ACTIVE roster member enforced as counter).
 * The offline SPA queue flushes against the SAME stocktakeId — paused or
 * closed stocktakes reject writes with 409, so a late flush cannot corrupt
 * a frozen report.
 */
@RestController
@RequestMapping("/api/inventory/stocktakes")
@RequiredArgsConstructor
public class StocktakeController {

    private final StocktakeQueryService queries;
    private final StocktakeCommandService commands;
    private final BandAccessGuard guard;

    @GetMapping
    public List<StocktakeView> list(@RequestParam("bandId") long bandId) {
        guard.requireMember(bandId, BearerTokens.require());
        return queries.list(bandId);
    }

    /** ADMIN opens a stocktake; snapshot computed synchronously (F5.1). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StocktakeView start(@RequestParam("bandId") long bandId,
            @Valid @RequestBody StocktakeStartRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        guard.requireAdmin(bandId, BearerTokens.require());
        Stocktake stocktake = commands.start(BearerTokens.require(), bandId,
                jwt.getSubject(), request.type(), request.status(), request.warehouse(),
                request.notes());
        return queries.detail(stocktake.getId());
    }

    @GetMapping("/{id}")
    public StocktakeView detail(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.detail(id);
    }

    /** Progress + 4-section counters (bottom bar live numbers, close report). */
    @GetMapping("/{id}/summary")
    public StocktakeSummaryView summary(@PathVariable long id) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.summary(id);
    }

    /** Lines for the counting screen / report sections ({@code ?state=OK}). */
    @GetMapping("/{id}/lines")
    public List<StocktakeLineView> lines(@PathVariable long id,
            @RequestParam(required = false) FoundState state) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        return queries.lines(id, state);
    }

    /** (Re)count a snapshot line — last word wins until close (F5.3). */
    @PutMapping("/{id}/lines/{lineId}")
    public StocktakeLineView count(@PathVariable long id, @PathVariable long lineId,
            @Valid @RequestBody CountLineRequest request) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        StocktakeLine line = commands.count(BearerTokens.require(), id, lineId,
                request.foundState(), request.note(), request.countedMemberId());
        return StocktakeLineView.of(line);
    }

    /** Record a nadwyżka — a unit outside the snapshot. */
    @PostMapping("/{id}/lines")
    @ResponseStatus(HttpStatus.CREATED)
    public StocktakeLineView addExtra(@PathVariable long id,
            @Valid @RequestBody ExtraLineRequest request) {
        guard.requireMember(queries.bandOf(id), BearerTokens.require());
        StocktakeLine line = commands.addExtra(BearerTokens.require(), id,
                request.itemId(), request.note(), request.countedMemberId());
        return StocktakeLineView.of(line);
    }

    @PatchMapping("/{id}/pause")
    public StocktakeView pause(@PathVariable long id) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        return view(commands.pause(BearerTokens.require(), id));
    }

    @PatchMapping("/{id}/resume")
    public StocktakeView resume(@PathVariable long id) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        return view(commands.resume(BearerTokens.require(), id));
    }

    /** ADMIN closes; double close → 409 (domain-enforced, F5.6). */
    @PatchMapping("/{id}/close")
    public StocktakeView close(@PathVariable long id) {
        guard.requireAdmin(queries.bandOf(id), BearerTokens.require());
        return view(commands.close(BearerTokens.require(), id));
    }

    private StocktakeView view(Stocktake stocktake) {
        return queries.detail(stocktake.getId());
    }
}
