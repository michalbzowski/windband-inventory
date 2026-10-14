package pl.michalbzowski.inventory.application.command;

/** Line id that does not exist or belongs to another stocktake → REST 404. */
public class StocktakeLineNotFoundException extends RuntimeException {

    public StocktakeLineNotFoundException(long lineId) {
        super("Nie znaleziono linii spisu o id " + lineId);
    }
}
