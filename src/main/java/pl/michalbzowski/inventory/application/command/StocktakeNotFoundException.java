package pl.michalbzowski.inventory.application.command;

/** Unknown stocktake id → REST 404 (never distinguishes foreign-band from missing). */
public class StocktakeNotFoundException extends RuntimeException {

    public StocktakeNotFoundException(long id) {
        super("Nie znaleziono spisu o id " + id);
    }
}
