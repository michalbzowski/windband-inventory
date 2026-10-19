package pl.michalbzowski.inventory.application.command;

/** A referenced service job does not exist in this deployment (404, same family as need/item). */
public class ServiceJobNotFoundException extends RuntimeException {

    public ServiceJobNotFoundException(long id) {
        super("Zgłoszenie serwisowe o id " + id + " nie istnieje");
    }
}
