package pl.michalbzowski.inventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * windband-inventory backend — band inventory with a dynamic attribute engine
 * and (in the next modules) stocktakes. Data ownership is split: bands and
 * members live in windband-manager and are read through its API only (B1);
 * inventory owns items, attributes, assignments, warehouses and stocktakes.
 */
@SpringBootApplication
public class InventoryApplication {

    public static void main(String[] args) {
        SpringApplication.run(InventoryApplication.class, args);
    }
}
