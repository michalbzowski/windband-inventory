package pl.michalbzowski.inventory.application.query;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pl.michalbzowski.inventory.application.command.AttributeDefNotFoundException;
import pl.michalbzowski.inventory.application.query.ItemViews.AttributeDefView;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDef;
import pl.michalbzowski.inventory.domain.inventory.ItemAttributeDefRepository;
import pl.michalbzowski.inventory.domain.inventory.ItemType;

/**
 * Attribute-definition reads that drive the two-step item form
 * (choose type -> render defs, section 3.1 of the frozen analysis).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AttributeDefQueryService {

    private final ItemAttributeDefRepository defs;

    /** Band of an existing definition — guard helper for the REST layer. */
    public long bandOf(long id) {
        return defs.findById(id)
                .map(ItemAttributeDef::getBandId)
                .orElseThrow(() -> new AttributeDefNotFoundException(id));
    }

    public List<AttributeDefView> list(long bandId, ItemType itemType, boolean includeInactive) {
        List<ItemAttributeDef> found = itemType != null
                ? (includeInactive
                    ? withInactive(bandId, itemType)
                    : defs.findByBandIdAndItemTypeAndActiveTrueOrderByDisplayOrderAscNameAsc(bandId, itemType))
                : (includeInactive
                    ? defs.findByBandIdOrderByItemTypeAscDisplayOrderAscNameAsc(bandId)
                    : defs.findByBandIdAndActiveTrueOrderByItemTypeAscDisplayOrderAscNameAsc(bandId));
        return found.stream().map(AttributeDefQueryService::view).toList();
    }

    private List<ItemAttributeDef> withInactive(long bandId, ItemType itemType) {
        return defs.findByBandIdOrderByItemTypeAscDisplayOrderAscNameAsc(bandId).stream()
                .filter(d -> d.getItemType() == itemType)
                .toList();
    }

    /** Read-model for a just-written definition (POST/PUT responses). */
    public ItemViews.AttributeDefView viewOf(ItemAttributeDef def) {
        return view(def);
    }

    private static AttributeDefView view(ItemAttributeDef def) {
        return new AttributeDefView(def.getId(), def.getBandId(), def.getItemType(), def.getName(),
                def.getDataType(), def.getDisplayOrder(), def.isRequired(), def.isDisplayInList(),
                def.parsedOptions(), def.isActive());
    }
}
