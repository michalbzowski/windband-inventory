package pl.michalbzowski.inventory.application.query;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.StocktakeNotFoundException;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeSummaryView;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeView;
import pl.michalbzowski.inventory.application.query.StocktakeViews.StocktakeLineView;
import pl.michalbzowski.inventory.domain.inventory.FoundState;
import pl.michalbzowski.inventory.domain.inventory.Stocktake;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLine;
import pl.michalbzowski.inventory.domain.inventory.StocktakeLineRepository;
import pl.michalbzowski.inventory.domain.inventory.StocktakeRepository;

/**
 * F5 reads: stocktake list for a band (newest first), detail, the summary
 * counters behind the bottom bar + close report, and the (filterable) line
 * list the mobile counting screen and the 4 report sections render.
 */
@Service
@RequiredArgsConstructor
public class StocktakeQueryService {

    private final StocktakeRepository stocktakes;
    private final StocktakeLineRepository lines;

    @Transactional(readOnly = true)
    public long bandOf(long stocktakeId) {
        return load(stocktakeId).getBandId();
    }

    @Transactional(readOnly = true)
    public List<StocktakeView> list(long bandId) {
        return stocktakes.findByBandIdOrderByIdDesc(bandId).stream()
                .map(this::toView)
                .toList();
    }

    @Transactional(readOnly = true)
    public StocktakeView detail(long stocktakeId) {
        return toView(load(stocktakeId));
    }

    @Transactional(readOnly = true)
    public StocktakeSummaryView summary(long stocktakeId) {
        Stocktake stocktake = load(stocktakeId);
        return StocktakeViews.StocktakeSummaryView.of(stocktake, linesOf(stocktakeId));
    }

    @Transactional(readOnly = true)
    public List<StocktakeLineView> lines(long stocktakeId, FoundState state) {
        load(stocktakeId);
        List<StocktakeLine> all = linesOf(stocktakeId);
        return StocktakeViews.lineViews(state == null
                ? all
                : all.stream().filter(l -> l.getFoundState() == state).toList());
    }

    StocktakeView toView(Stocktake stocktake) {
        List<StocktakeLine> all = lines.findByStocktake_IdOrderByIdAsc(stocktake.getId());
        return StocktakeView.of(stocktake, all.size(), StocktakeViews.counted(all));
    }

    private List<StocktakeLine> linesOf(long stocktakeId) {
        return lines.findByStocktake_IdOrderByIdAsc(stocktakeId);
    }

    private Stocktake load(long id) {
        return stocktakes.findById(id).orElseThrow(() -> new StocktakeNotFoundException(id));
    }
}
