package com.quantumroute.backend.persistence;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.OptimizationResult;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Testcontainers
class PersistenceSchemaTest {

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
    private EntityManager em;

    @Autowired
    private JdbcTemplate jdbc;

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

    private Workspace persistWorkspace(String ownerEmail, String wsName) {
        return tx().execute(status -> {
            AppUser u = newUser(ownerEmail);
            em.persist(u);
            Workspace ws = new Workspace();
            ws.setOwner(u);
            ws.setName(wsName);
            em.persist(ws);
            return ws;
        });
    }

    private Scenario persistScenario(Workspace ws, String name, JsonNode graph, JsonNode config) {
        return tx().execute(status -> {
            Scenario s = new Scenario();
            s.setWorkspace(em.getReference(Workspace.class, ws.getId()));
            s.setName(name);
            s.setGraphVersion("v1");
            s.setGraphJson(graph);
            s.setConfigJson(config);
            em.persist(s);
            return s;
        });
    }

    private OptimizationJob persistJob(Scenario s, OptimizationJob.Status status) {
        return tx().execute(status1 -> {
            OptimizationJob j = new OptimizationJob();
            j.setScenario(em.getReference(Scenario.class, s.getId()));
            j.setStatus(status);
            j.setAlgorithm(OptimizationJob.Algorithm.QPSO);
            j.setRequestJson(objectMapper.createObjectNode().put("source", "A"));
            em.persist(j);
            return j;
        });
    }

    @Test
    void flywayMigrationCreatesAllTables() {
        List<String> tables = jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables " +
                "WHERE table_schema = 'public' AND table_name <> 'flyway_schema_history' " +
                "ORDER BY table_name",
                String.class);
        assertThat(tables).containsExactly(
                "app_user", "optimization_job", "optimization_result",
                "scenario", "workspace");

        Integer flywayCount = jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class);
        assertThat(flywayCount).isGreaterThanOrEqualTo(1);
    }

    @Test
    void jsonbRoundTripStoresRealJsonb() throws Exception {
        Workspace ws = persistWorkspace("jsonb@example.com", "ws-jsonb");
        JsonNode graph = objectMapper.readTree(
                "{\"name\":\"g\",\"directed\":true,\"nodes\":[{\"id\":\"A\"}],\"edges\":[]}");
        JsonNode config = objectMapper.readTree("{\"weights\":[0.6,0.25,0.15]}");
        Scenario s = persistScenario(ws, "sc-jsonb", graph, config);
        OptimizationJob j = persistJob(s, OptimizationJob.Status.COMPLETED);

        JsonNode route = objectMapper.readTree(
                "{\"nodeIds\":[\"A\",\"B\",\"C\"],\"edgeIds\":[\"e1\",\"e2\"]}");
        UUID resultId = tx().execute(status -> {
            OptimizationResult r = new OptimizationResult();
            r.setJob(em.getReference(OptimizationJob.class, j.getId()));
            r.setRouteJson(route);
            r.setFeasible(true);
            r.setDistanceM(123.4);
            r.setTimeS(56.7);
            r.setCongestion(0.1);
            r.setObjective(0.42);
            r.setRuntimeMs(845L);
            em.persist(r);
            return r.getId();
        });

        Scenario reloaded = tx().execute(status -> em.find(Scenario.class, s.getId()));
        assertThat(reloaded.getGraphJson()).isEqualTo(graph);
        assertThat(reloaded.getConfigJson()).isEqualTo(config);

        OptimizationResult rr = tx().execute(status -> em.createQuery(
                "SELECT r FROM OptimizationResult r WHERE r.job.id = :jid",
                OptimizationResult.class).setParameter("jid", j.getId()).getSingleResult());
        assertThat(rr.getRouteJson()).isEqualTo(route);
        assertThat(rr.getRouteJson().get("nodeIds").isArray()).isTrue();
        assertThat(rr.getRouteJson().get("edgeIds").isArray()).isTrue();
        assertThat(rr.getDistanceM()).isEqualTo(123.4);

        // verify real JSONB types in Postgres, not escaped strings
        String graphType = jdbc.queryForObject(
                "SELECT jsonb_typeof(graph_json) FROM scenario WHERE id = ?::uuid",
                String.class, s.getId().toString());
        assertThat(graphType).isEqualTo("object");
        String routeType = jdbc.queryForObject(
                "SELECT jsonb_typeof(route_json) FROM optimization_result WHERE id = ?::uuid",
                String.class, resultId.toString());
        assertThat(routeType).isEqualTo("object");
        String nodesType = jdbc.queryForObject(
                "SELECT jsonb_typeof(route_json -> 'nodeIds') FROM optimization_result WHERE id = ?::uuid",
                String.class, resultId.toString());
        assertThat(nodesType).isEqualTo("array");
    }

    @Test
    void caseInsensitiveDuplicateEmailRejected() {
        tx().execute(status -> {
            em.persist(newUser("User@Example.COM"));
            return null;
        });
        assertThatThrownBy(() -> tx().execute(status -> {
            em.persist(newUser("user@example.com"));
            em.flush();
            return null;
        })).isInstanceOf(ConstraintViolationException.class);
    }

    @Test
    void checkConstraintsRejectInvalidValues() {
        Workspace ws = persistWorkspace("constraints@example.com", "ws-constraints");
        Scenario s = persistScenario(ws, "sc-bad",
                objectMapper.createObjectNode(), null);

        // invalid role via raw SQL (entity enum can't express it)
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO app_user (id, email, password_hash, role) " +
                    "VALUES (?::uuid, 'bad@example.com', 'x', 'SUPERUSER')",
                    UUID.randomUUID().toString());
            return null;
        })).isInstanceOf(Exception.class);

        // invalid job status via raw SQL
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_job (id, scenario_id, status, algorithm, request_json) " +
                    "VALUES (?::uuid, ?::uuid, 'BOGUS', 'QPSO', '{}'::jsonb)",
                    UUID.randomUUID().toString(), s.getId().toString());
            return null;
        })).isInstanceOf(Exception.class);

        // invalid algorithm via raw SQL
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_job (id, scenario_id, status, algorithm, request_json) " +
                    "VALUES (?::uuid, ?::uuid, 'QUEUED', 'PSO', '{}'::jsonb)",
                    UUID.randomUUID().toString(), s.getId().toString());
            return null;
        })).isInstanceOf(Exception.class);
    }

    @Test
    void infeasibleResultWithNullMetricsPersists() throws Exception {
        Workspace ws = persistWorkspace("infeasible@example.com", "ws-infeasible");
        Scenario s = persistScenario(ws, "sc-infeasible",
                objectMapper.createObjectNode(), null);
        OptimizationJob j = persistJob(s, OptimizationJob.Status.COMPLETED);
        Instant finished = Instant.now();
        tx().execute(status -> {
            OptimizationJob managed = em.find(OptimizationJob.class, j.getId());
            managed.setFinishedAt(finished);
            return null;
        });

        JsonNode emptyRoute = objectMapper.readTree("{\"nodeIds\":[],\"edgeIds\":[]}");
        UUID resultId = tx().execute(status -> {
            OptimizationResult r = new OptimizationResult();
            r.setJob(em.getReference(OptimizationJob.class, j.getId()));
            r.setRouteJson(emptyRoute);
            r.setFeasible(false);
            em.persist(r);
            return r.getId();
        });

        OptimizationResult reloaded = tx().execute(status -> em.find(OptimizationResult.class, resultId));
        assertThat(reloaded.isFeasible()).isFalse();
        assertThat(reloaded.getDistanceM()).isNull();
        assertThat(reloaded.getTimeS()).isNull();
        assertThat(reloaded.getCongestion()).isNull();
        assertThat(reloaded.getObjective()).isNull();
        assertThat(reloaded.getRuntimeMs()).isNull();
        assertThat(reloaded.getRouteJson().get("nodeIds")).isEmpty();
        assertThat(reloaded.getRouteJson().get("edgeIds")).isEmpty();

        Instant jobFinished = tx().execute(status ->
                em.find(OptimizationJob.class, j.getId()).getFinishedAt());
        assertThat(jobFinished).isNotNull();
    }

    @Test
    void nonNegativeAndFiniteMetricConstraints() {
        Workspace ws = persistWorkspace("metrics@example.com", "ws-metrics");
        Scenario s = persistScenario(ws, "sc-metrics",
                objectMapper.createObjectNode(), null);

        // helper: insert a completed job row, return its id
        java.util.function.Function<String, UUID> insertJob = alg -> tx().execute(status -> {
            UUID id = UUID.randomUUID();
            jdbc.update(
                    "INSERT INTO optimization_job (id, scenario_id, status, algorithm, request_json) " +
                    "VALUES (?::uuid, ?::uuid, 'COMPLETED', ?, '{}'::jsonb)",
                    id.toString(), s.getId().toString(), alg);
            return id;
        });

        // negative metric must fail
        UUID jobNeg = insertJob.apply("DIJKSTRA");
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_result (id, job_id, route_json, feasible, distance_m) " +
                    "VALUES (?::uuid, ?::uuid, '{}'::jsonb, true, -1.0)",
                    UUID.randomUUID().toString(), jobNeg.toString());
            return null;
        })).isInstanceOf(Exception.class);

        // NaN must fail
        UUID jobNaN = insertJob.apply("ASTAR");
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_result (id, job_id, route_json, feasible, objective) " +
                    "VALUES (?::uuid, ?::uuid, '{}'::jsonb, true, 'NaN'::float8)",
                    UUID.randomUUID().toString(), jobNaN.toString());
            return null;
        })).isInstanceOf(Exception.class);

        // +Infinity must fail
        UUID jobInf = insertJob.apply("QPSO");
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_result (id, job_id, route_json, feasible, time_s) " +
                    "VALUES (?::uuid, ?::uuid, '{}'::jsonb, true, 'Infinity'::float8)",
                    UUID.randomUUID().toString(), jobInf.toString());
            return null;
        })).isInstanceOf(Exception.class);

        // negative runtime must fail
        UUID jobRt = insertJob.apply("DIJKSTRA");
        assertThatThrownBy(() -> tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_result (id, job_id, route_json, feasible, runtime_ms) " +
                    "VALUES (?::uuid, ?::uuid, '{}'::jsonb, true, -5)",
                    UUID.randomUUID().toString(), jobRt.toString());
            return null;
        })).isInstanceOf(Exception.class);

        // valid non-negative metrics still succeed
        UUID jobOk = insertJob.apply("DIJKSTRA");
        tx().execute(status -> {
            jdbc.update(
                    "INSERT INTO optimization_result (id, job_id, route_json, feasible, " +
                    "distance_m, time_s, congestion, objective, runtime_ms) " +
                    "VALUES (?::uuid, ?::uuid, '{}'::jsonb, true, 1.5, 2.5, 0.1, 0.2, 100)",
                    UUID.randomUUID().toString(), jobOk.toString());
            return null;
        });
    }

    @Test
    void timestampsPersistAsUtcInstants() {
        Workspace ws = persistWorkspace("time@example.com", "ws-time");
        Scenario s = persistScenario(ws, "sc-time",
                objectMapper.createObjectNode(), null);
        OptimizationJob j = persistJob(s, OptimizationJob.Status.QUEUED);

        OptimizationJob reloaded = tx().execute(status -> em.find(OptimizationJob.class, j.getId()));
        assertThat(reloaded.getCreatedAt()).isNotNull();
        assertThat(reloaded.getFinishedAt()).isNull();

        Instant finish = Instant.now();
        tx().execute(status -> {
            OptimizationJob managed = em.find(OptimizationJob.class, j.getId());
            managed.setFinishedAt(finish);
            return null;
        });
        OptimizationJob after = tx().execute(status -> em.find(OptimizationJob.class, j.getId()));
        assertThat(after.getFinishedAt()).isNotNull();
        assertThat(after.getCreatedAt()).isBeforeOrEqualTo(after.getFinishedAt());

        // verify DB-side value is timestamptz, not timestamp
        String colType = jdbc.queryForObject(
                "SELECT data_type FROM information_schema.columns " +
                "WHERE table_name='optimization_job' AND column_name='created_at'",
                String.class);
        assertThat(colType).isEqualTo("timestamp with time zone");
    }

    @Test
    void v1AndV2MigrationsApplied() {
        Integer applied = jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE success = true",
                Integer.class);
        assertThat(applied).isEqualTo(2);
    }

    @Test
    void jobErrorMessageRoundTrip() {
        Workspace ws = persistWorkspace("err@example.com", "ws-err");
        Scenario s = persistScenario(ws, "sc-err",
                objectMapper.createObjectNode(), null);

        // null error message persists as NULL
        OptimizationJob plain = persistJob(s, OptimizationJob.Status.QUEUED);
        OptimizationJob plainReloaded = tx().execute(status ->
                em.find(OptimizationJob.class, plain.getId()));
        assertThat(plainReloaded.getErrorMessage()).isNull();
        assertThat(plainReloaded.getStatus()).isEqualTo(OptimizationJob.Status.QUEUED);
        assertThat(plainReloaded.getAlgorithm()).isNotNull();

        // error message persists and is retrievable
        OptimizationJob failed = persistJob(s, OptimizationJob.Status.FAILED);
        tx().execute(status -> {
            OptimizationJob managed = em.find(OptimizationJob.class, failed.getId());
            managed.setErrorMessage("optimizer unreachable: connection refused");
            managed.setFinishedAt(Instant.now());
            return null;
        });
        OptimizationJob failedReloaded = tx().execute(status ->
                em.find(OptimizationJob.class, failed.getId()));
        assertThat(failedReloaded.getErrorMessage())
                .isEqualTo("optimizer unreachable: connection refused");
        assertThat(failedReloaded.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
    }
}
