package com.quantumroute.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.client.OptimizerClient;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class JobApiIntegrationTest {

    private static final String TEST_SECRET =
            "test-only-jwt-secret-key-0123456789abcdef";

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.jwt.secret", () -> TEST_SECRET);
    }

    @Value("${local.server.port}") int port;
    @Autowired private JobRecoveryService recoveryService;
    @Autowired private AppUserRepository userRepo;
    @Autowired private ScenarioRepository scenarioRepo;
    @Autowired private OptimizationJobRepository jobRepo;
    @Autowired private PlatformTransactionManager txManager;
    @MockitoBean private OptimizerClient optimizerClient;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper om = new ObjectMapper();
    private TransactionTemplate tx;
    private String base;

    private TransactionTemplate tx() {
        if (tx == null) tx = new TransactionTemplate(txManager);
        return tx;
    }

    private record Resp(int status, String body) {}

    private Resp send(String method, String path, String body, String token)
            throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + path))
                .header("Content-Type", "application/json");
        if (token != null) b.header("Authorization", "Bearer " + token);
        b.method(method, body == null
                ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        HttpResponse<String> r = http.send(b.build(),
                HttpResponse.BodyHandlers.ofString());
        return new Resp(r.statusCode(), r.body());
    }

    private JsonNode json(Resp r) throws Exception {
        return om.readTree(r.body());
    }

    private String tokenFor(String email, AppUser.Role role) throws Exception {
        send("POST", "/api/v1/auth/register",
                om.writeValueAsString(Map.of("email", email,
                        "password", "password123", "displayName", "T")), null);
        if (role == AppUser.Role.ADMIN) {
            tx().execute(s -> {
                userRepo.findByEmailIgnoreCase(email).ifPresent(u -> {
                    u.setRole(AppUser.Role.ADMIN);
                    userRepo.save(u);
                });
                return null;
            });
        }
        Resp login = send("POST", "/api/v1/auth/login",
                om.writeValueAsString(Map.of("email", email,
                        "password", "password123")), null);
        return json(login).get("accessToken").asText();
    }

    private String createScenarioWithGraph(String token) throws Exception {
        Resp ws = send("POST", "/api/v1/workspaces",
                om.writeValueAsString(Map.of("name", "ws-" + UUID.randomUUID())),
                token);
        String wsId = json(ws).get("id").asText();
        String graph = """
                {"name":"g","directed":false,
                 "nodes":[{"id":"A"},{"id":"B"}],
                 "edges":[{"source":"A","target":"B","length_m":1,"speed_kmh":1}]}
                """;
        Resp sc = send("POST", "/api/v1/workspaces/" + wsId + "/scenarios",
                om.writeValueAsString(Map.of("name", "sc-" + UUID.randomUUID(),
                        "graph", om.readTree(graph))), token);
        assertThat(sc.status()).as(sc.body()).isEqualTo(201);
        return json(sc).get("id").asText();
    }

    private UUID seedJob(String scenarioId, OptimizationJob.Status status)
            throws Exception {
        return tx().execute(s -> {
            Scenario sc = scenarioRepo.findById(UUID.fromString(scenarioId))
                    .orElseThrow();
            OptimizationJob j = new OptimizationJob();
            j.setScenario(sc);
            j.setStatus(status);
            j.setAlgorithm(OptimizationJob.Algorithm.DIJKSTRA);
            j.setRequestJson(om.createObjectNode());
            if (status == OptimizationJob.Status.COMPLETED
                    || status == OptimizationJob.Status.FAILED
                    || status == OptimizationJob.Status.TIMEOUT) {
                j.setFinishedAt(java.time.Instant.now());
            }
            jobRepo.save(j);
            return j.getId();
        });
    }

    private String submitBody(String algorithm) {
        return """
                {"algorithm":"%s","sourceNodeId":"A","targetNodeId":"B",
                 "parameters":{}}
                """.formatted(algorithm);
    }

    @BeforeEach
    void reset() {
        Mockito.reset(optimizerClient);
        base = "http://localhost:" + port;
        when(optimizerClient.optimize(any())).thenReturn(safeInfeasible());
    }

    private JsonNode safeInfeasible() {
        try {
            return om.readTree("""
                    {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":false,
                     "route":{"nodeIds":[],"edgeIds":[],"geometry":null},
                     "metrics":null,"runtimeMs":1}
                    """);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private JsonNode awaitJobStatus(String jobPath, String token,
                                    String... terminal) throws Exception {
        long deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) {
            Resp r = send("GET", jobPath, null, token);
            if (r.status() == 200) {
                String st = json(r).get("status").asText();
                for (String t : terminal) {
                    if (st.equals(t)) return json(r);
                }
            }
            Thread.sleep(100);
        }
        throw new AssertionError("job did not reach terminal state");
    }

    // --- submission ---------------------------------------------------------

    @Test
    void submitReturns202Queued() throws Exception {
        String token = tokenFor("api-user@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        Resp r = send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                submitBody("DIJKSTRA"), token);

        assertThat(r.status()).as(r.body()).isEqualTo(202);
        JsonNode body = json(r);
        assertThat(body.get("status").asText()).isEqualTo("QUEUED");
        assertThat(body.get("algorithm").asText()).isEqualTo("DIJKSTRA");
        assertThat(body.get("scenarioId").asText()).isEqualTo(scenarioId);
        assertThat(body.has("id")).isTrue();
        assertThat(body.has("createdAt")).isTrue();
        // no internal fields leak
        assertThat(body.has("requestJson")).isFalse();
        assertThat(body.has("request_json")).isFalse();
    }

    @Test
    void submitRejectedUntilRecoveryComplete() throws Exception {
        String token = tokenFor("api-503@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        recoveryService.markNotReady();
        try {
            Resp r = send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                    submitBody("DIJKSTRA"), token);
            assertThat(r.status()).isEqualTo(503);
            assertThat(json(r).get("code").asText())
                    .isEqualTo("STARTUP_RECOVERY_IN_PROGRESS");
        } finally {
            recoveryService.markReady();
        }
    }

    // --- authorization --------------------------------------------------------

    @Test
    void userCannotAccessForeignScenarioJobs() throws Exception {
        String alice = tokenFor("alice@example.com", AppUser.Role.USER);
        String bob = tokenFor("bob@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(alice);
        UUID jobId = seedJob(scenarioId, OptimizationJob.Status.COMPLETED);

        // Bob sees nothing of Alice's scenario/jobs
        assertThat(send("GET", "/api/v1/scenarios/" + scenarioId + "/jobs",
                null, bob).status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/jobs/" + jobId, null, bob).status())
                .isEqualTo(404);
        assertThat(send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                submitBody("DIJKSTRA"), bob).status()).isEqualTo(404);

        // Alice sees her own
        assertThat(send("GET", "/api/v1/jobs/" + jobId, null, alice).status())
                .isEqualTo(200);

        // Admin bypasses
        String admin = tokenFor("admin@example.com", AppUser.Role.ADMIN);
        assertThat(send("GET", "/api/v1/jobs/" + jobId, null, admin).status())
                .isEqualTo(200);
        assertThat(send("GET", "/api/v1/scenarios/" + scenarioId + "/jobs",
                null, admin).status()).isEqualTo(200);
    }

    @Test
    void nonexistentResourcesReturn404() throws Exception {
        String token = tokenFor("nf@example.com", AppUser.Role.USER);
        String random = UUID.randomUUID().toString();
        assertThat(send("GET", "/api/v1/jobs/" + random, null, token).status())
                .isEqualTo(404);
        assertThat(send("GET", "/api/v1/jobs/" + random + "/result", null, token)
                .status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/scenarios/" + random + "/jobs",
                null, token).status()).isEqualTo(404);
        assertThat(send("POST", "/api/v1/scenarios/" + random + "/jobs",
                submitBody("DIJKSTRA"), token).status()).isEqualTo(404);
    }

    // --- history / status -----------------------------------------------------

    @Test
    void jobHistoryPaginates() throws Exception {
        String token = tokenFor("page@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);
        for (int i = 0; i < 3; i++) {
            seedJob(scenarioId, OptimizationJob.Status.COMPLETED);
        }

        Resp p0 = send("GET",
                "/api/v1/scenarios/" + scenarioId
                        + "/jobs?page=0&size=2&sort=createdAt,desc", null, token);
        assertThat(p0.status()).isEqualTo(200);
        JsonNode page0 = json(p0);
        assertThat(page0.get("totalElements").asInt()).isEqualTo(3);
        assertThat(page0.get("content").size()).isEqualTo(2);
        assertThat(page0.get("content").get(0).has("requestJson")).isFalse();

        Resp p1 = send("GET",
                "/api/v1/scenarios/" + scenarioId
                        + "/jobs?page=1&size=2&sort=createdAt,desc", null, token);
        assertThat(json(p1).get("content").size()).isEqualTo(1);
    }

    @Test
    void statusEndpointReflectsAllStates() throws Exception {
        String token = tokenFor("states@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        for (OptimizationJob.Status st : OptimizationJob.Status.values()) {
            UUID jobId = seedJob(scenarioId, st);
            Resp r = send("GET", "/api/v1/jobs/" + jobId, null, token);
            assertThat(r.status()).as(r.body()).isEqualTo(200);
            assertThat(json(r).get("status").asText()).isEqualTo(st.name());
        }
    }

    // --- results ---------------------------------------------------------------

    @Test
    void feasibleResultReturned() throws Exception {
        when(optimizerClient.optimize(any())).thenReturn(om.readTree("""
                {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":true,
                 "route":{"nodeIds":["A","B"],"edgeIds":["1:A|1:B"],
                          "geometry":{"type":"LineString","coordinates":[[1,2],[3,4]]}},
                 "metrics":{"distanceMeters":1000.0,
                            "estimatedTravelTimeSeconds":72.0,
                            "congestionPenalty":0.1,"objectiveValue":0.4},
                 "runtimeMs":42}
                """));
        String token = tokenFor("res@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        Resp sub = send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                submitBody("DIJKSTRA"), token);
        String jobId = json(sub).get("id").asText();
        awaitJobStatus("/api/v1/jobs/" + jobId, token, "COMPLETED");

        Resp r = send("GET", "/api/v1/jobs/" + jobId + "/result", null, token);
        assertThat(r.status()).as(r.body()).isEqualTo(200);
        JsonNode res = json(r);
        assertThat(res.get("feasible").asBoolean()).isTrue();
        assertThat(res.get("route").get("nodeIds").get(1).asText()).isEqualTo("B");
        assertThat(res.get("metrics").get("distanceMeters").asDouble())
                .isEqualTo(1000.0);
        assertThat(res.get("runtimeMs").asLong()).isEqualTo(42L);
        assertThat(res.get("algorithmMetadata").isNull()).isTrue();
    }

    @Test
    void infeasibleResultReturned() throws Exception {
        String token = tokenFor("inf@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        Resp sub = send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                submitBody("DIJKSTRA"), token);
        String jobId = json(sub).get("id").asText();
        awaitJobStatus("/api/v1/jobs/" + jobId, token, "COMPLETED");

        Resp r = send("GET", "/api/v1/jobs/" + jobId + "/result", null, token);
        assertThat(r.status()).isEqualTo(200);
        JsonNode res = json(r);
        assertThat(res.get("feasible").asBoolean()).isFalse();
        assertThat(res.get("route").get("nodeIds").isEmpty()).isTrue();
        assertThat(res.get("metrics").isNull()).isTrue();
    }

    @Test
    void qpsoMetadataSurfacedInResult() throws Exception {
        when(optimizerClient.optimize(any())).thenReturn(om.readTree("""
                {"status":"COMPLETED","algorithm":"QPSO","feasible":true,
                 "route":{"nodeIds":["A","B"],"edgeIds":[],"geometry":null},
                 "metrics":{"distanceMeters":1.0,
                            "estimatedTravelTimeSeconds":1.0,
                            "congestionPenalty":0.0,"objectiveValue":0.3},
                 "runtimeMs":100,
                 "algorithmMetadata":{"seed":42,"iterationsRun":5,
                    "usedRepair":false,"repairRate":0.0,
                    "feasibilityRate":1.0,"convergenceTrace":[0.5,0.3],
                    "parameters":{"particles":10}}}
                """));
        String token = tokenFor("qpso@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        Resp sub = send("POST", "/api/v1/scenarios/" + scenarioId + "/jobs",
                "{\"algorithm\":\"QPSO\",\"sourceNodeId\":\"A\","
                        + "\"targetNodeId\":\"B\",\"parameters\":{\"seed\":42}}",
                token);
        assertThat(sub.status()).as(sub.body()).isEqualTo(202);
        String jobId = json(sub).get("id").asText();
        awaitJobStatus("/api/v1/jobs/" + jobId, token, "COMPLETED");

        Resp r = send("GET", "/api/v1/jobs/" + jobId + "/result", null, token);
        JsonNode meta = json(r).get("algorithmMetadata");
        assertThat(meta).isNotNull();
        assertThat(meta.get("seed").asInt()).isEqualTo(42);
        assertThat(meta.get("iterationsRun").asInt()).isEqualTo(5);
    }

    @Test
    void result404WhilePendingAndAfterFailure() throws Exception {
        String token = tokenFor("pend@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);

        // QUEUED job without result -> 404
        UUID queued = seedJob(scenarioId, OptimizationJob.Status.QUEUED);
        assertThat(send("GET", "/api/v1/jobs/" + queued + "/result", null, token)
                .status()).isEqualTo(404);

        // FAILED job without result -> 404 (status endpoint distinguishes)
        UUID failed = seedJob(scenarioId, OptimizationJob.Status.FAILED);
        Resp fr = send("GET", "/api/v1/jobs/" + failed + "/result", null, token);
        assertThat(fr.status()).isEqualTo(404);
        assertThat(send("GET", "/api/v1/jobs/" + failed, null, token).status())
                .isEqualTo(200);
        assertThat(json(send("GET", "/api/v1/jobs/" + failed, null, token))
                .get("status").asText()).isEqualTo("FAILED");
    }

    // --- validation -------------------------------------------------------------

    @Test
    void malformedRequestsRejected() throws Exception {
        String token = tokenFor("val@example.com", AppUser.Role.USER);
        String scenarioId = createScenarioWithGraph(token);
        String url = "/api/v1/scenarios/" + scenarioId + "/jobs";

        // missing algorithm
        assertThat(send("POST", url,
                "{\"sourceNodeId\":\"A\",\"targetNodeId\":\"B\"}", token)
                .status()).isIn(400, 422);
        // invalid enum value
        assertThat(send("POST", url,
                "{\"algorithm\":\"NOPE\",\"sourceNodeId\":\"A\",\"targetNodeId\":\"B\"}",
                token).status()).isIn(400, 422);
        // blank source
        assertThat(send("POST", url,
                "{\"algorithm\":\"DIJKSTRA\",\"sourceNodeId\":\"\","
                        + "\"targetNodeId\":\"B\"}", token).status()).isIn(400, 422);
        // unsupported field
        assertThat(send("POST", url,
                "{\"algorithm\":\"DIJKSTRA\",\"sourceNodeId\":\"A\","
                        + "\"targetNodeId\":\"B\",\"hack\":true}", token)
                .status()).isIn(400, 422);
        // unauthenticated
        assertThat(send("POST", url, submitBody("DIJKSTRA"), null).status())
                .isEqualTo(401);
    }
}
