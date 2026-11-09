package com.quantumroute.backend.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.OptimizationResult;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class RepositoryIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.jwt.secret", () -> "test-only-jwt-secret-key-0123456789abcdef");
    }

    @Autowired
    private AppUserRepository userRepo;

    @Autowired
    private WorkspaceRepository workspaceRepo;

    @Autowired
    private ScenarioRepository scenarioRepo;

    @Autowired
    private OptimizationJobRepository jobRepo;

    @Autowired
    private OptimizationResultRepository resultRepo;

    @Autowired
    private PlatformTransactionManager txManager;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private TransactionTemplate tx;

    private TransactionTemplate tx() {
        if (tx == null) {
            tx = new TransactionTemplate(txManager);
        }
        return tx;
    }

    private AppUser newUser(String email) {
        AppUser u = new AppUser();
        u.setEmail(email);
        u.setPasswordHash("hash");
        u.setDisplayName("Test User");
        return u;
    }

    private AppUser persistUser(String email) {
        return tx().execute(status -> userRepo.save(newUser(email)));
    }

    private Workspace persistWorkspace(AppUser owner, String name) {
        return tx().execute(status -> {
            Workspace ws = new Workspace();
            ws.setOwner(owner);
            ws.setName(name);
            return workspaceRepo.save(ws);
        });
    }

    private Scenario persistScenario(Workspace ws, String name) {
        return tx().execute(status -> {
            Scenario s = new Scenario();
            s.setWorkspace(ws);
            s.setName(name);
            s.setGraphVersion("v1");
            s.setGraphJson(objectMapper.createObjectNode().put("name", "g"));
            return scenarioRepo.save(s);
        });
    }

    private OptimizationJob persistJob(Scenario s, OptimizationJob.Status status) {
        return tx().execute(status1 -> {
            OptimizationJob j = new OptimizationJob();
            j.setScenario(s);
            j.setStatus(status);
            j.setAlgorithm(OptimizationJob.Algorithm.QPSO);
            j.setRequestJson(objectMapper.createObjectNode());
            return jobRepo.save(j);
        });
    }

    private OptimizationResult persistResult(OptimizationJob job, boolean feasible) throws Exception {
        JsonNode routeJson = objectMapper.readTree(
                feasible ? "{\"nodeIds\":[\"A\",\"B\"],\"edgeIds\":[\"e1\"]}"
                          : "{\"nodeIds\":[],\"edgeIds\":[]}");
        return tx().execute(status -> {
            OptimizationResult r = new OptimizationResult();
            r.setJob(job);
            r.setRouteJson(routeJson);
            r.setFeasible(feasible);
            if (feasible) {
                r.setDistanceM(10.0);
                r.setTimeS(20.0);
                r.setObjective(0.5);
                r.setRuntimeMs(100L);
            }
            return resultRepo.save(r);
        });
    }

    // --- CRUD -----------------------------------------------------------------

    @Test
    void crudRoundTripAcrossAllEntities() throws Exception {
        AppUser u = persistUser("crud@example.com");
        assertThat(u.getId()).isNotNull();
        assertThat(u.getCreatedAt()).isNotNull();

        Workspace ws = persistWorkspace(u, "ws-crud");
        Scenario s = persistScenario(ws, "sc-crud");
        OptimizationJob j = persistJob(s, OptimizationJob.Status.QUEUED);
        OptimizationResult r = persistResult(j, true);

        assertThat(userRepo.findById(u.getId())).isPresent();
        assertThat(workspaceRepo.findById(ws.getId())).isPresent();
        assertThat(scenarioRepo.findById(s.getId())).isPresent();
        assertThat(jobRepo.findById(j.getId())).isPresent();
        assertThat(resultRepo.findById(r.getId())).isPresent();

        OptimizationResult reloaded = tx().execute(status -> resultRepo.findById(r.getId()).orElseThrow());
        assertThat(reloaded.isFeasible()).isTrue();
        assertThat(reloaded.getRouteJson().get("nodeIds").isArray()).isTrue();
        assertThat(reloaded.getDistanceM()).isEqualTo(10.0);
    }

    // --- Email lookup -----------------------------------------------------------

    @Test
    void emailLookupIsCaseInsensitive() {
        persistUser("Mixed@Example.COM");

        assertThat(userRepo.findByEmailIgnoreCase("mixed@example.com")).isPresent();
        assertThat(userRepo.findByEmailIgnoreCase("MIXED@EXAMPLE.COM")).isPresent();
        assertThat(userRepo.existsByEmailIgnoreCase("mixed@EXAMPLE.com")).isTrue();
        assertThat(userRepo.existsByEmailIgnoreCase("nobody@example.com")).isFalse();
        assertThat(userRepo.findByEmailIgnoreCase("absent@example.com")).isEmpty();
    }

    // --- Owner isolation ---------------------------------------------------------

    @Test
    void ownerScopedQueriesIsolateData() {
        AppUser alice = persistUser("alice@example.com");
        AppUser bob = persistUser("bob@example.com");
        Workspace aws = persistWorkspace(alice, "alice-ws");
        Workspace bws = persistWorkspace(bob, "bob-ws");
        Scenario as = persistScenario(aws, "alice-sc");
        Scenario bs = persistScenario(bws, "bob-sc");
        OptimizationJob aj = persistJob(as, OptimizationJob.Status.RUNNING);
        OptimizationJob bj = persistJob(bs, OptimizationJob.Status.COMPLETED);

        Pageable page = PageRequest.of(0, 10);

        // workspaces: alice sees only hers
        Page<Workspace> aliceWs = workspaceRepo.findByOwner_Id(alice.getId(), page);
        assertThat(aliceWs.getTotalElements()).isEqualTo(1);
        assertThat(aliceWs.getContent().get(0).getName()).isEqualTo("alice-ws");

        // scenarios scoped by workspace owner
        Page<Scenario> aliceSc = scenarioRepo.findByWorkspace_Owner_Id(alice.getId(), page);
        assertThat(aliceSc.getTotalElements()).isEqualTo(1);
        assertThat(aliceSc.getContent().get(0).getId()).isEqualTo(as.getId());

        // single-entity ownership checks
        assertThat(scenarioRepo.findByIdAndWorkspace_Owner_Id(as.getId(), alice.getId())).isPresent();
        assertThat(scenarioRepo.findByIdAndWorkspace_Owner_Id(bs.getId(), alice.getId())).isEmpty();
        assertThat(jobRepo.findByIdAndScenario_Workspace_Owner_Id(aj.getId(), alice.getId())).isPresent();
        assertThat(jobRepo.findByIdAndScenario_Workspace_Owner_Id(bj.getId(), alice.getId())).isEmpty();

        // jobs by owner
        Page<OptimizationJob> aliceJobs = jobRepo.findByScenario_Workspace_Owner_Id(alice.getId(), page);
        assertThat(aliceJobs.getTotalElements()).isEqualTo(1);
        assertThat(aliceJobs.getContent().get(0).getId()).isEqualTo(aj.getId());
    }

    // --- Pagination ---------------------------------------------------------------

    @Test
    void paginationReturnsCorrectPages() {
        AppUser u = persistUser("page@example.com");
        Workspace ws = persistWorkspace(u, "ws-page");
        for (int i = 0; i < 5; i++) {
            persistScenario(ws, "sc-" + i);
        }

        Pageable first = PageRequest.of(0, 2, Sort.by("name"));
        Page<Scenario> p0 = scenarioRepo.findByWorkspace_Id(ws.getId(), first);
        assertThat(p0.getTotalElements()).isEqualTo(5);
        assertThat(p0.getTotalPages()).isEqualTo(3);
        assertThat(p0.getContent()).hasSize(2);
        assertThat(p0.getContent().get(0).getName()).isEqualTo("sc-0");

        Page<Scenario> p2 = scenarioRepo.findByWorkspace_Id(ws.getId(), PageRequest.of(2, 2, Sort.by("name")));
        assertThat(p2.getContent()).hasSize(1);
        assertThat(p2.getContent().get(0).getName()).isEqualTo("sc-4");

        Page<Workspace> wp = workspaceRepo.findByOwner_Id(u.getId(), PageRequest.of(0, 10));
        assertThat(wp.getTotalElements()).isEqualTo(1);
    }

    // --- Job status queries ---------------------------------------------------------

    @Test
    void jobStatusQueriesWork() {
        AppUser u = persistUser("jobs@example.com");
        Workspace ws = persistWorkspace(u, "ws-jobs");
        Scenario s = persistScenario(ws, "sc-jobs");
        persistJob(s, OptimizationJob.Status.QUEUED);
        persistJob(s, OptimizationJob.Status.RUNNING);
        persistJob(s, OptimizationJob.Status.COMPLETED);
        persistJob(s, OptimizationJob.Status.COMPLETED);

        // findByStatus is global; other tests share the container DB, so
        // assert our scenario's RUNNING job is present and all rows match
        List<OptimizationJob> running = jobRepo.findByStatus(OptimizationJob.Status.RUNNING);
        assertThat(running).isNotEmpty();
        assertThat(running).allMatch(j -> j.getStatus() == OptimizationJob.Status.RUNNING);
        assertThat(running.stream().map(j -> j.getScenario().getId()))
                .contains(s.getId());

        assertThat(jobRepo.countByScenario_IdAndStatus(s.getId(), OptimizationJob.Status.COMPLETED)).isEqualTo(2);
        assertThat(jobRepo.countByScenario_IdAndStatus(s.getId(), OptimizationJob.Status.FAILED)).isZero();

        Page<OptimizationJob> byScenario = jobRepo.findByScenario_Id(s.getId(), PageRequest.of(0, 10));
        assertThat(byScenario.getTotalElements()).isEqualTo(4);
    }

    // --- Result lookup ----------------------------------------------------------------

    @Test
    void resultLookupByJobId() throws Exception {
        AppUser u = persistUser("result@example.com");
        Workspace ws = persistWorkspace(u, "ws-result");
        Scenario s = persistScenario(ws, "sc-result");
        OptimizationJob j = persistJob(s, OptimizationJob.Status.COMPLETED);
        OptimizationResult r = persistResult(j, true);

        assertThat(resultRepo.findByJob_Id(j.getId())).isPresent();
        assertThat(resultRepo.findByJob_Id(j.getId()).orElseThrow().getId()).isEqualTo(r.getId());
        assertThat(resultRepo.existsByJob_Id(j.getId())).isTrue();
        assertThat(resultRepo.findByJob_Id(UUID.randomUUID())).isEmpty();
        assertThat(resultRepo.existsByJob_Id(UUID.randomUUID())).isFalse();

        // owner-scoped result lookup
        assertThat(resultRepo.findByJob_IdAndJob_Scenario_Workspace_Owner_Id(j.getId(), u.getId())).isPresent();
        AppUser other = persistUser("other@example.com");
        assertThat(resultRepo.findByJob_IdAndJob_Scenario_Workspace_Owner_Id(j.getId(), other.getId())).isEmpty();
    }

    // --- Uniqueness constraints ---------------------------------------------------------

    @Test
    void scenarioNameUniquePerWorkspace() {
        AppUser u = persistUser("unique@example.com");
        Workspace ws = persistWorkspace(u, "ws-unique");
        persistScenario(ws, "dup-name");

        assertThat(scenarioRepo.existsByWorkspace_IdAndName(ws.getId(), "dup-name")).isTrue();
        assertThat(scenarioRepo.existsByWorkspace_IdAndName(ws.getId(), "other")).isFalse();

        // duplicate (workspace_id, name) must fail in its own transaction
        assertThatThrownBy(() -> tx().execute(status -> {
            Scenario s = new Scenario();
            s.setWorkspace(ws);
            s.setName("dup-name");
            s.setGraphVersion("v1");
            s.setGraphJson(objectMapper.createObjectNode());
            scenarioRepo.saveAndFlush(s);
            return null;
        })).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void workspaceNameCaseSensitivePerOwner() {
        AppUser u = persistUser("wsname@example.com");
        persistWorkspace(u, "MyWorkspace");

        // DB constraint is case-sensitive: "myworkspace" is allowed
        assertThat(workspaceRepo.existsByOwner_IdAndName(u.getId(), "MyWorkspace")).isTrue();
        assertThat(workspaceRepo.existsByOwner_IdAndName(u.getId(), "myworkspace")).isFalse();

        tx().execute(status -> {
            Workspace ws = new Workspace();
            ws.setOwner(u);
            ws.setName("myworkspace");
            workspaceRepo.save(ws);
            return null;
        });
        assertThat(workspaceRepo.existsByOwner_IdAndName(u.getId(), "myworkspace")).isTrue();
    }

    @Test
    void duplicateEmailRejectedAtRepositoryLevel() {
        persistUser("dup@example.com");
        assertThat(userRepo.existsByEmailIgnoreCase("dup@example.com")).isTrue();

        assertThatThrownBy(() -> tx().execute(status -> {
            userRepo.saveAndFlush(newUser("DUP@example.com"));
            return null;
        })).isInstanceOf(DataIntegrityViolationException.class);
    }
}
