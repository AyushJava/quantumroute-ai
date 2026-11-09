package com.quantumroute.backend.scenario;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.repository.WorkspaceRepository;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class WorkspaceScenarioIntegrationTest {

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

    @LocalServerPort
    private int port;

    private String base() {
        return "http://localhost:" + port;
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
    private JwtService jwtService;

    @Autowired
    private PlatformTransactionManager txManager;

    private final ObjectMapper om = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private TransactionTemplate tx;

    private TransactionTemplate tx() {
        if (tx == null) {
            tx = new TransactionTemplate(txManager);
        }
        return tx;
    }

    private record Resp(int status, String body) {}

    private Resp request(String method, String path, String json, String token) {
        try {
            var b = HttpRequest.newBuilder(URI.create(base() + path))
                    .header("Content-Type", "application/json");
            if (token != null) {
                b.header("Authorization", "Bearer " + token);
            }
            HttpRequest req = switch (method) {
                case "POST", "PUT" -> b.method(method,
                        HttpRequest.BodyPublishers.ofString(json)).build();
                case "DELETE" -> b.DELETE().build();
                default -> b.GET().build();
            };
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            return new Resp(res.statusCode(), res.body());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Resp post(String path, Object body, String token) {
        return sendJson("POST", path, body, token);
    }

    private Resp put(String path, Object body, String token) {
        return sendJson("PUT", path, body, token);
    }

    private Resp sendJson(String method, String path, Object body, String token) {
        try {
            return request(method, path, om.writeValueAsString(body), token);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Resp get(String path, String token) {
        return request("GET", path, null, token);
    }

    private Resp delete(String path, String token) {
        return request("DELETE", path, null, token);
    }

    private JsonNode json(Resp r) throws Exception {
        return om.readTree(r.body());
    }

    private String tokenFor(String email, AppUser.Role role) {
        AppUser u = new AppUser();
        u.setEmail(email);
        u.setPasswordHash("x");
        u.setRole(role);
        AppUser saved = tx().execute(s -> userRepo.save(u));
        return jwtService.generateToken(new AuthUser(saved.getId(), saved.getEmail(), role));
    }

    private String userId(String tokenEmail) {
        return tx().execute(s -> userRepo.findByEmailIgnoreCase(tokenEmail)
                .orElseThrow().getId().toString());
    }

    /** Valid Phase-1-style graph with Phase-2 cost inputs. */
    private ObjectNode graph() {
        ObjectNode g = om.createObjectNode();
        g.put("name", "test-graph").put("directed", false);
        ArrayNode nodes = g.putArray("nodes");
        for (String id : new String[]{"A", "B", "C"}) {
            ObjectNode n = nodes.addObject();
            n.put("id", id).put("lat", 12.9).put("lon", 77.6);
        }
        ArrayNode edges = g.putArray("edges");
        addEdge(edges, "A", "B", 1000.0, 50.0);
        addEdge(edges, "B", "C", 2000.0, 60.0);
        addEdge(edges, "A", "C", 5000.0, 80.0);
        return g;
    }

    private void addEdge(ArrayNode edges, String s, String t, double len, double speed) {
        ObjectNode e = edges.addObject();
        e.put("source", s).put("target", t);
        e.put("length_m", len).put("speed_kmh", speed);
        e.put("cost", 1.0).put("congestion", 0.2).put("closed", false);
    }

    private String createWorkspace(String name, String token) throws Exception {
        Resp r = post("/api/v1/workspaces", Map.of("name", name), token);
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return json(r).get("id").asText();
    }

    private String createScenario(String wsId, String name, ObjectNode g, String token) throws Exception {
        Resp r = post("/api/v1/workspaces/" + wsId + "/scenarios",
                Map.of("name", name, "graph", g), token);
        assertThat(r.status()).as(r.body()).isEqualTo(201);
        return json(r).get("id").asText();
    }

    // --- Workspace CRUD --------------------------------------------------------

    @Test
    void workspaceCrudAndPagination() throws Exception {
        String token = tokenFor("ws-user@example.com", AppUser.Role.USER);

        String ws1 = createWorkspace("Alpha", token);
        String ws2 = createWorkspace("Beta", token);

        Resp get = get("/api/v1/workspaces/" + ws1, token);
        assertThat(get.status()).isEqualTo(200);
        assertThat(json(get).get("name").asText()).isEqualTo("Alpha");

        Resp rename = put("/api/v1/workspaces/" + ws1,
                Map.of("name", "Alpha2"), token);
        assertThat(rename.status()).isEqualTo(200);
        assertThat(json(rename).get("name").asText()).isEqualTo("Alpha2");

        Resp page = get("/api/v1/workspaces?page=0&size=1", token);
        assertThat(page.status()).isEqualTo(200);
        JsonNode p = json(page);
        assertThat(p.get("content").size()).isEqualTo(1);
        assertThat(p.get("totalElements").asLong()).isGreaterThanOrEqualTo(2);

        // duplicate name for same owner -> 409
        Resp dup = post("/api/v1/workspaces", Map.of("name", "Alpha2"), token);
        assertThat(dup.status()).isEqualTo(409);
        assertThat(json(dup).get("code").asText()).isEqualTo("WORKSPACE_NAME_EXISTS");

        // delete non-empty workspace -> 409
        Resp delNonEmpty = delete("/api/v1/workspaces/" + ws2, token);
        // ws2 has no scenarios yet -> should succeed; verify then recreate flow below
        assertThat(delNonEmpty.status()).isEqualTo(204);

        Resp missing = get("/api/v1/workspaces/" + UUID.randomUUID(), token);
        assertThat(missing.status()).isEqualTo(404);
    }

    @Test
    void workspaceDeleteBlockedByScenarios() throws Exception {
        String token = tokenFor("ws-del@example.com", AppUser.Role.USER);
        String ws = createWorkspace("Keep", token);
        createScenario(ws, "S1", graph(), token);

        Resp del = delete("/api/v1/workspaces/" + ws, token);
        assertThat(del.status()).isEqualTo(409);
        assertThat(json(del).get("code").asText()).isEqualTo("WORKSPACE_NOT_EMPTY");
    }

    // --- Scenario CRUD ---------------------------------------------------------

    @Test
    void scenarioCrudJsonbAndGraphVersion() throws Exception {
        String token = tokenFor("sc-user@example.com", AppUser.Role.USER);
        String ws = createWorkspace("WS", token);

        ObjectNode g = graph();
        Resp create = post("/api/v1/workspaces/" + ws + "/scenarios",
                Map.of("name", "Baseline", "graphVersion", "v1",
                        "graph", g, "config", Map.of("maxIterations", 50)), token);
        assertThat(create.status()).as(create.body()).isEqualTo(201);
        JsonNode detail = json(create);
        assertThat(detail.get("graphVersion").asText()).isEqualTo("v1");
        assertThat(detail.get("graph").get("nodes").size()).isEqualTo(3);
        assertThat(detail.get("config").get("maxIterations").asInt()).isEqualTo(50);
        String scId = detail.get("id").asText();

        // JSONB round-trip: verify real jsonb columns
        Scenario stored = tx().execute(s -> scenarioRepo.findById(UUID.fromString(scId)).orElseThrow());
        assertThat(stored.getGraphJson().get("edges").size()).isEqualTo(3);
        assertThat(stored.getGraphJson().isObject()).isTrue();
        assertThat(stored.getConfigJson().get("maxIterations").asInt()).isEqualTo(50);

        // listing excludes graph payload
        Resp list = get("/api/v1/workspaces/" + ws + "/scenarios?page=0&size=10", token);
        assertThat(list.status()).isEqualTo(200);
        JsonNode item = json(list).get("content").get(0);
        assertThat(item.has("graph")).isFalse();
        assertThat(item.has("graphJson")).isFalse();
        assertThat(item.get("name").asText()).isEqualTo("Baseline");

        // graph change WITHOUT version bump -> 400
        ObjectNode g2 = graph();
        ((ObjectNode) g2.get("edges").get(0)).put("length_m", 1500.0);
        Resp badVer = put("/api/v1/scenarios/" + scId,
                Map.of("graph", g2), token);
        assertThat(badVer.status()).isEqualTo(400);
        assertThat(json(badVer).get("code").asText()).isEqualTo("GRAPH_VERSION_UNCHANGED");

        // graph change WITH new version -> 200
        Resp okVer = put("/api/v1/scenarios/" + scId,
                Map.of("graph", g2, "graphVersion", "v2"), token);
        assertThat(okVer.status()).as(okVer.body()).isEqualTo(200);
        assertThat(json(okVer).get("graphVersion").asText()).isEqualTo("v2");

        // get detail
        Resp got = get("/api/v1/scenarios/" + scId, token);
        assertThat(got.status()).isEqualTo(200);
        assertThat(json(got).get("graph").get("edges").get(0)
                .get("length_m").asDouble()).isEqualTo(1500.0);

        // delete scenario without jobs -> 204
        Resp del = delete("/api/v1/scenarios/" + scId, token);
        assertThat(del.status()).isEqualTo(204);
    }

    @Test
    void scenarioDeleteBlockedByJobs() throws Exception {
        String token = tokenFor("sc-del@example.com", AppUser.Role.USER);
        String ws = createWorkspace("WS2", token);
        String scId = createScenario(ws, "WithJob", graph(), token);

        // attach a job directly via repository
        UUID ownerId = UUID.fromString(userId("sc-del@example.com"));
        tx().execute(s -> {
            var scenario = scenarioRepo.findById(UUID.fromString(scId)).orElseThrow();
            var job = new com.quantumroute.backend.entity.OptimizationJob();
            job.setScenario(scenario);
            job.setStatus(com.quantumroute.backend.entity.OptimizationJob.Status.QUEUED);
            job.setAlgorithm(com.quantumroute.backend.entity.OptimizationJob.Algorithm.DIJKSTRA);
            job.setRequestJson(om.valueToTree(Map.of("source", "A", "target", "B")));
            jobRepo.save(job);
            return null;
        });

        Resp del = delete("/api/v1/scenarios/" + scId, token);
        assertThat(del.status()).isEqualTo(409);
        assertThat(json(del).get("code").asText()).isEqualTo("SCENARIO_HAS_JOBS");
    }

    // --- Graph validation --------------------------------------------------------

    @Test
    void invalidGraphsRejected() throws Exception {
        String token = tokenFor("gv-user@example.com", AppUser.Role.USER);
        String ws = createWorkspace("GV", token);
        String url = "/api/v1/workspaces/" + ws + "/scenarios";

        // missing length_m / speed_kmh (Phase 2 cost-model inputs)
        ObjectNode noCost = om.createObjectNode();
        noCost.put("directed", false);
        ArrayNode ns = noCost.putArray("nodes");
        ns.addObject().put("id", "A");
        ns.addObject().put("id", "B");
        ArrayNode es = noCost.putArray("edges");
        ObjectNode e = es.addObject();
        e.put("source", "A").put("target", "B").put("cost", 1.0);
        Resp r1 = post(url, Map.of("name", "bad", "graph", noCost), token);
        assertThat(r1.status()).isEqualTo(400);
        assertThat(json(r1).get("code").asText()).isEqualTo("INVALID_GRAPH");

        // edge to nonexistent node
        ObjectNode badRef = graph();
        ((ObjectNode) badRef.get("edges").get(0)).put("target", "ZZZ");
        Resp r2 = post(url, Map.of("name", "bad2", "graph", badRef), token);
        assertThat(r2.status()).isEqualTo(400);

        // duplicate node id
        ObjectNode dupNode = graph();
        ((ArrayNode) dupNode.get("nodes")).addObject().put("id", "A");
        Resp r3 = post(url, Map.of("name", "bad3", "graph", dupNode), token);
        assertThat(r3.status()).isEqualTo(400);

        // parallel undirected edge
        ObjectNode par = graph();
        addEdge((ArrayNode) par.get("edges"), "B", "A", 900.0, 40.0);
        Resp r4 = post(url, Map.of("name", "bad4", "graph", par), token);
        assertThat(r4.status()).isEqualTo(400);

        // NaN-ish / non-finite cost rejected by JSON parser anyway; negative cost rejected
        ObjectNode neg = graph();
        ((ObjectNode) neg.get("edges").get(0)).put("cost", -1.0);
        Resp r5 = post(url, Map.of("name", "bad5", "graph", neg), token);
        assertThat(r5.status()).isEqualTo(400);

        // missing graph entirely
        Resp r6 = post(url, Map.of("name", "bad6"), token);
        assertThat(r6.status()).isEqualTo(400);
    }

    @Test
    void zeroLengthEdgeAcceptedNegativeRejected() throws Exception {
        String token = tokenFor("len-user@example.com", AppUser.Role.USER);
        String ws = createWorkspace("LEN", token);
        String url = "/api/v1/workspaces/" + ws + "/scenarios";

        // zero length_m is valid (rejects only negative / non-finite)
        ObjectNode zero = graph();
        ((ObjectNode) zero.get("edges").get(0)).put("length_m", 0.0);
        Resp ok = post(url, Map.of("name", "zero-len", "graph", zero), token);
        assertThat(ok.status()).as(ok.body()).isEqualTo(201);

        // negative length_m rejected
        ObjectNode neg = graph();
        ((ObjectNode) neg.get("edges").get(0)).put("length_m", -0.5);
        Resp bad = post(url, Map.of("name", "neg-len", "graph", neg), token);
        assertThat(bad.status()).isEqualTo(400);
        assertThat(json(bad).get("code").asText()).isEqualTo("INVALID_GRAPH");
    }

    // --- Authorization ------------------------------------------------------------

    @Test
    void userIsolationAndAdminBypass() throws Exception {
        String alice = tokenFor("alice@example.com", AppUser.Role.USER);
        String bob = tokenFor("bob@example.com", AppUser.Role.USER);
        String admin = tokenFor("admin@example.com", AppUser.Role.ADMIN);

        String aliceWs = createWorkspace("AliceWS", alice);
        String scId = createScenario(aliceWs, "AliceSc", graph(), alice);

        // Bob cannot see Alice's workspace or scenario -> 404
        assertThat(get("/api/v1/workspaces/" + aliceWs, bob).status()).isEqualTo(404);
        assertThat(get("/api/v1/scenarios/" + scId, bob).status()).isEqualTo(404);
        assertThat(get("/api/v1/workspaces/" + aliceWs + "/scenarios", bob).status()).isEqualTo(404);
        assertThat(delete("/api/v1/scenarios/" + scId, bob).status()).isEqualTo(404);

        // Bob's workspace list does not contain Alice's
        Resp bobList = get("/api/v1/workspaces?size=50", bob);
        JsonNode contents = json(bobList).get("content");
        for (JsonNode w : contents) {
            assertThat(w.get("name").asText()).isNotEqualTo("AliceWS");
        }

        // ADMIN can read foreign resources
        assertThat(get("/api/v1/workspaces/" + aliceWs, admin).status()).isEqualTo(200);
        assertThat(get("/api/v1/scenarios/" + scId, admin).status()).isEqualTo(200);
        // ADMIN list sees all workspaces incl. Alice's
        Resp adminList = get("/api/v1/workspaces?size=50", admin);
        boolean found = false;
        for (JsonNode w : json(adminList).get("content")) {
            if (w.get("id").asText().equals(aliceWs)) {
                found = true;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void unauthenticatedRequestsRejected() throws Exception {
        Resp r = get("/api/v1/workspaces", null);
        assertThat(r.status()).isEqualTo(401);
    }
}
