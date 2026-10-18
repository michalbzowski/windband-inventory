package pl.michalbzowski.integration;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import com.fasterxml.jackson.databind.ObjectMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Reguły warunkowe atrybutów (v2.0, w1-analiza §3.3): definicja zależna od
 * wartości atrybutu-rodzica SELECT, płaska hierarchia, guardy na spójność
 * i odrzucanie wartości ukrytych atrybutów przy zapisie pozycji.
 * Przykład z życia: Mundur ma Wzrost+Obwód ramion, Czapka tylko Rozmiar,
 * Koszula Wzrost+Rozmiar kołnierzyka.
 */
class ConditionalsIT extends AbstractIntegrationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private long idOf(ResultActions result) throws Exception {
        String body = result.andReturn().getResponse().getContentAsString();
        return MAPPER.readTree(body).get("id").longValue();
    }

    /** Nazwy muszą być unikalne w ramach JVM — H2 nie jest czyszczony między testami. */
    private String u() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private long createUniformDef(String name, String json) throws Exception {
        return idOf(postJson("/api/inventory/attribute-defs?bandId=7", json, "tok-admin")
                .andExpect(status().isCreated()));
    }

    /** Rodzic „Rodzaj umundurowania" (SELECT) + dziecko „Wzrost" zależne od Mundur|Koszula. */
    private long[] parentAndChild() throws Exception {
        String suffix = u();
        long parentId = createUniformDef("Rodzaj", String.format("""
                {"name":"Rodzaj umundurowania %s","itemType":"UNIFORM","dataType":"SELECT",
                 "required":false,"options":["Mundur","Czapka","Koszula"]}""", suffix));
        long childId = createUniformDef("Wzrost", String.format("""
                {"name":"Wzrost %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "required":true,"dependsOnDefId":%d,"dependsOnValues":["Mundur","Koszula"]}""",
                suffix, parentId));
        return new long[]{parentId, childId, suffix.hashCode()};
    }

    private String itemJson(String name, String type, String attributesJson) {
        return String.format("{\"name\":\"%s\",\"type\":\"%s\",\"attributes\":[%s]}",
                name, type, attributesJson);
    }

    private Set<Long> attributeDefIds(long itemId) throws Exception {
        String body = mvc.perform(get("/api/inventory/items/{id}", itemId).with(as("tok-admin")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Set<Long> ids = new HashSet<>();
        MAPPER.readTree(body).get("attributes").forEach(a -> ids.add(a.get("attributeDefId").longValue()));
        return ids;
    }

    @Test
    void conditionalDefRoundTripExposesDependencyInView() throws Exception {
        long[] pc = parentAndChild();
        String body = mvc.perform(get("/api/inventory/attribute-defs?bandId=7&type=UNIFORM").with(as("tok-admin")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        com.fasterxml.jackson.databind.JsonNode child = null;
        for (com.fasterxml.jackson.databind.JsonNode n : MAPPER.readTree(body)) {
            if (n.get("id").asLong() == pc[1]) {
                child = n;
            }
        }
        org.assertj.core.api.Assertions.assertThat(child).isNotNull();
        org.assertj.core.api.Assertions.assertThat(child.get("dependsOnDefId").asLong()).isEqualTo(pc[0]);
        org.assertj.core.api.Assertions.assertThat(
                MAPPER.convertValue(child.get("dependsOnValues"),
                        new com.fasterxml.jackson.core.type.TypeReference<java.util.List<String>>() { }))
                .containsExactly("Mundur", "Koszula");
    }

    @Test
    void createRejectsInvalidParents() throws Exception {
        long[] pc = parentAndChild();
        long parentId = pc[0];
        String suffix = u();

        // 1) drugie dziecko rodzica — OK; wnuk (parent zależny) — płaska hierarchia => 400
        long childId = pc[1];
        postJson("/api/inventory/attribute-defs?bandId=7", String.format("""
                {"name":"Wnuk %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d,"dependsOnValues":["Mundur"]}""", suffix, childId), "tok-admin")
                .andExpect(status().isBadRequest());

        // 2) parent typu TEXT — brak zbioru wartości do porównania => 400
        long textId = createUniformDef("Notatki", String.format("""
                {"name":"Notatki %s","itemType":"UNIFORM","dataType":"TEXT"}""", suffix));
        postJson("/api/inventory/attribute-defs?bandId=7", String.format("""
                {"name":"ZleParent %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d,"dependsOnValues":["cokolwiek"]}""", suffix, textId), "tok-admin")
                .andExpect(status().isBadRequest());

        // 3) parent z innego typu pozycji => 400
        long instrParent = createUniformDef("Struny", String.format("""
                {"name":"Struny %s","itemType":"INSTRUMENT","dataType":"SELECT",
                 "options":["nylon","stal"]}""", suffix));
        postJson("/api/inventory/attribute-defs?bandId=7", String.format("""
                {"name":"ZlyTyp %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d,"dependsOnValues":["nylon"]}""", suffix, instrParent), "tok-admin")
                .andExpect(status().isBadRequest());

        // 4) wartość spoza opcji rodzica => 400
        postJson("/api/inventory/attribute-defs?bandId=7", String.format("""
                {"name":"ZlaWartosc %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d,"dependsOnValues":["Spodnie"]}""", suffix, parentId), "tok-admin")
                .andExpect(status().isBadRequest());

        // 5) rodzic ustawiony bez wartości warunku => 400
        postJson("/api/inventory/attribute-defs?bandId=7", String.format("""
                {"name":"BezWartosci %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d}""", suffix, parentId), "tok-admin")
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateClearsDependencyWithSentinelZero() throws Exception {
        long[] pc = parentAndChild();
        mvc.perform(put("/api/inventory/attribute-defs/{id}", pc[1])
                .with(as("tok-admin"))
                .contentType("application/json")
                .content("{\"dependsOnDefId\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dependsOnDefId").doesNotExist())
                .andExpect(jsonPath("$.dependsOnValues").value(
                        org.hamcrest.Matchers.empty()));
    }

    @Test
    void parentCannotLoseOptionUsedByConditionalChild() throws Exception {
        long[] pc = parentAndChild();
        long parentId = pc[0];
        // usunięcie „Koszula" — dzieci używają jej w warunku => 400
        mvc.perform(put("/api/inventory/attribute-defs/{id}", parentId)
                .with(as("tok-admin"))
                .contentType("application/json")
                .content("{\"options\":[\"Mundur\",\"Czapka\"]}"))
                .andExpect(status().isBadRequest());
        // dodanie nowej opcji — dozwolone
        mvc.perform(put("/api/inventory/attribute-defs/{id}", parentId)
                .with(as("tok-admin"))
                .contentType("application/json")
                .content("{\"options\":[\"Mundur\",\"Czapka\",\"Koszula\",\"Bluza\"]}"))
                .andExpect(status().isOk());
    }

    @Test
    void itemSaveDropsHiddenValuesAndSkipsHiddenRequired() throws Exception {
        long[] pc = parentAndChild();
        long parentId = pc[0];
        long childId = pc[1]; // required=true, warunek: Mundur|Koszula
        String suffix = u();
        long obwodId = createUniformDef("Obwod", String.format("""
                {"name":"Obwód ramion %s","itemType":"UNIFORM","dataType":"NUMBER",
                 "dependsOnDefId":%d,"dependsOnValues":["Mundur"]}""", suffix, parentId));

        // Koszula: Wzrost widoczny, Obwód ukryty — jego wartość jest odrzucana cicho.
        long itemId = idOf(postJson("/api/inventory/items?bandId=7", itemJson(
                "Koszula " + suffix, "UNIFORM", String.format(
                        "{\"attributeDefId\":%d,\"value\":\"Koszula\"},"
                        + "{\"attributeDefId\":%d,\"value\":\"178\"},"
                        + "{\"attributeDefId\":%d,\"value\":\"92\"}", parentId, childId, obwodId)),
                "tok-admin").andExpect(status().isCreated()));
        Set<Long> kept = attributeDefIds(itemId);
        org.assertj.core.api.Assertions.assertThat(kept)
                .contains(parentId, childId)
                .doesNotContain(obwodId);

        // Czapka: wymagany „Wzrost" jest ukryty => nie blokuje zapisu.
        postJson("/api/inventory/items?bandId=7", itemJson(
                "Czapka " + suffix, "UNIFORM", String.format(
                        "{\"attributeDefId\":%d,\"value\":\"Czapka\"}", parentId)),
                "tok-admin").andExpect(status().isCreated());

        // Koszula BEZ wartości widocznego wymaganego Wzrost => 400 (reguła wymagania zostaje).
        postJson("/api/inventory/items?bandId=7", itemJson(
                "Koszula brak " + suffix, "UNIFORM", String.format(
                        "{\"attributeDefId\":%d,\"value\":\"Koszula\"}", parentId)),
                "tok-admin").andExpect(status().isBadRequest());

        // Mundur: oba atrybuty zależne widoczne i zapisane.
        long mundourId = idOf(postJson("/api/inventory/items?bandId=7", itemJson(
                "Mundur " + suffix, "UNIFORM", String.format(
                        "{\"attributeDefId\":%d,\"value\":\"Mundur\"},"
                        + "{\"attributeDefId\":%d,\"value\":\"180\"},"
                        + "{\"attributeDefId\":%d,\"value\":\"94\"}", parentId, childId, obwodId)),
                "tok-admin").andExpect(status().isCreated()));
        org.assertj.core.api.Assertions.assertThat(attributeDefIds(mundourId))
                .contains(parentId, childId, obwodId);
    }
}
