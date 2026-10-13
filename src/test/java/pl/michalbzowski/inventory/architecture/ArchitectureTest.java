package pl.michalbzowski.inventory.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * DDD layering gates (NFR section 5 of the frozen analysis): the domain must
 * stay framework-blind from the outside in — adapters are the only edge, the
 * application orchestrates and never reaches into adapters.
 */
@AnalyzeClasses(packages = "pl.michalbzowski.inventory",
        importOptions = ImportOption.DoNotIncludeTests.class)
final class ArchitectureTest {

    private ArchitectureTest() {
    }

    @ArchTest
    static final ArchRule DOMAIN_DOES_NOT_DEPEND_ON_ADAPTERS = noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage("..adapter..", "..config..");

    @ArchTest
    static final ArchRule DOMAIN_DOES_NOT_DEPEND_ON_APPLICATION = noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage("..application..");

    @ArchTest
    static final ArchRule APPLICATION_DOES_NOT_DEPEND_ON_ADAPTERS = noClasses()
            .that().resideInAPackage("..application..")
            .should().dependOnClassesThat().resideInAnyPackage("..adapter..", "..config..");
}
