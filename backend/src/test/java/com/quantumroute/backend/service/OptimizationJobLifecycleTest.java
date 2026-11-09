package com.quantumroute.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.client.OptimizerClient;
import com.quantumroute.backend.client.OptimizerException;
import com.quantumroute.backend.client.OptimizerTimeoutException;
import com.quantumroute.backend.client.OptimizerUnavailableException;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.OptimizationResult;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import com.quantumroute.backend.exception.ApiException;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.OptimizationResultRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.repository.WorkspaceRepository;
import com.quantumroute.backend.security.AuthUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@Testcontainers
class OptimizationJobLifecycleTest {

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
        registry.add("app.optimizer.read-timeout-ms", () -> "60000");
    }

    @Autowired private OptimizationJobService jobService;
    @Autowired private JobRecoveryService recoveryService;
    @Autowired private AppUserRepository userRepo;
    @Autowired private WorkspaceRepository workspaceRepo;
    @Autowired private ScenarioRepository scenarioRepo;
    @Autowired private OptimizationJobRepository jobRepo;
    @Autowired private OptimizationResultRepository resultRepo;
    @Autowired private PlatformTransactionManager txManager;
    @MockitoBean private OptimizerClient optimizerClient;

    private final ObjectMapper om = new ObjectMapper();
    private TransactionTemplate tx;
    private UUID scenarioId;
    private AuthUser owner;

    private TransactionTemplate tx() {
        if (tx == null) tx = new TransactionTemplate(txManager);
        return tx;
    }

    @BeforeEach
    void setUp() {
        Mockito.reset(optimizerClient);
        String email = "job-" + UUID.randomUUID() + "@example.com";
        AppUser user = tx().execute(s -> {
            AppUser u = new AppUser();
            u.setEmail(email);
            u.setPasswordHash("x");
            u.setRole(AppUser.Role.USER);
            userRepo.save(u);
            Workspace ws = new Workspace();
            ws.setOwner(u);
            ws.setName("ws-" + UUID.randomUUID());
            workspaceRepo.save(ws);
            Scenario sc = new Scenario();
            sc.setWorkspace(ws);
            sc.setName("sc-" + UUID.randomUUID());
            sc.setGraphVersion("v1");
            sc.setGraphJson(om.createObjectNode().put("name", "g"));
            scenarioRepo.save(sc);
            return u;
        });
        owner = new AuthUser(user.getId(), user.getEmail(), AppUser.Role.USER);
        scenarioId = tx().execute(s -> scenarioRepo
                .findByWorkspace_Owner_Id(user.getId(),
                        org.springframework.data.domain.Pageable.unpaged())
                .getContent().get(0).getId());
    }

    private JsonNode optimizerRequest() throws Exception {
        return om.readTree("""
                {"graph":{"name":"g","directed":false,
                 "nodes":[{"id":"A"},{"id":"B"}],
                 "edges":[{"source":"A","target":"B","length_m":1,"speed_kmh":1}]},
                 "sourceNodeId":"A","targetNodeId":"B","algorithm":"DIJKSTRA",
                 "objectiveWeights":{"alpha":0.6,"beta":0.25,"gamma":0.15},
                 "parameters":{}}
                """);
    }

    private OptimizationJob awaitTerminal(UUID jobId, long timeoutMs) throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            OptimizationJob j = tx().execute(s -> jobRepo.findById(jobId).orElse(null));
            if (j != null && (j.getStatus() == OptimizationJob.Status.COMPLETED
                    || j.getStatus() == OptimizationJob.Status.FAILED
                    || j.getStatus() == OptimizationJob.Status.TIMEOUT)) {
                return j;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("job did not reach terminal state: " + jobId);
    }

    private JsonNode optimizerResponse(boolean feasible) throws Exception {
        return om.readTree(feasible ? """
                {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":true,
                 "route":{"nodeIds":["A","B"],"edgeIds":["1:A|1:B"],"geometry":null},
                 "metrics":{"distanceMeters":1000.0,
                            "estimatedTravelTimeSeconds":72.0,
                            "congestionPenalty":0.1,"objectiveValue":0.4},
                 "runtimeMs":42}
                """ : """
                {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":false,
                 "route":{"nodeIds":[],"edgeIds":[],"geometry":null},
                 "metrics":null,"runtimeMs":9}
                """);
    }

    // --- lifecycle ------------------------------------------------------------

    @Test
    void feasibleJobCompletesWithResult() throws Exception {
        when(optimizerClient.optimize(any())).thenReturn(optimizerResponse(true));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.COMPLETED);
        assertThat(job.getFinishedAt()).isNotNull();
        assertThat(job.getErrorMessage()).isNull();

        OptimizationResult result = tx().execute(s ->
                resultRepo.findByJob_Id(jobId).orElseThrow());
        assertThat(result.isFeasible()).isTrue();
        assertThat(result.getDistanceM()).isEqualTo(1000.0);
        assertThat(result.getTimeS()).isEqualTo(72.0);
        assertThat(result.getRuntimeMs()).isEqualTo(42L);
        assertThat(result.getRouteJson().get("route").get("nodeIds").get(1).asText()).isEqualTo("B");
    }

    @Test
    void infeasibleJobCompletesWithNullMetrics() throws Exception {
        when(optimizerClient.optimize(any())).thenReturn(optimizerResponse(false));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.COMPLETED);

        OptimizationResult result = tx().execute(s ->
                resultRepo.findByJob_Id(jobId).orElseThrow());
        assertThat(result.isFeasible()).isFalse();
        assertThat(result.getDistanceM()).isNull();
        assertThat(result.getTimeS()).isNull();
        assertThat(result.getRouteJson().get("route").get("nodeIds").isEmpty()).isTrue();
    }

    @Test
    void optimizerTimeoutExceptionMapsToTimeout() throws Exception {
        when(optimizerClient.optimize(any()))
                .thenThrow(new OptimizerTimeoutException("read timed out", null));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.TIMEOUT);
        assertThat(job.getErrorMessage()).contains("timeout");
        assertThat(job.getFinishedAt()).isNotNull();
        boolean hasResult = tx().execute(s -> resultRepo.existsByJob_Id(jobId));
        assertThat(hasResult).isFalse();
    }

    @Test
    void http504MapsToTimeout() throws Exception {
        when(optimizerClient.optimize(any()))
                .thenThrow(new OptimizerException(504, "TIMEOUT", "optimizer timed out", "t1"));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.ASTAR, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.TIMEOUT);
        assertThat(job.getErrorMessage()).contains("TIMEOUT");
    }

    @Test
    void http422MapsToFailed() throws Exception {
        when(optimizerClient.optimize(any()))
                .thenThrow(new OptimizerException(422, "UNKNOWN_NODE", "node ZZZ missing", "t2"));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
        assertThat(job.getErrorMessage()).contains("UNKNOWN_NODE");
        boolean hasResult = tx().execute(s -> resultRepo.existsByJob_Id(jobId));
        assertThat(hasResult).isFalse();
    }

    @Test
    void connectionFailureMapsToFailed() throws Exception {
        when(optimizerClient.optimize(any()))
                .thenThrow(new OptimizerUnavailableException("connection refused", null));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
        assertThat(job.getErrorMessage()).contains("OPTIMIZER_UNAVAILABLE");
    }

    @Test
    void unexpectedExceptionMapsToFailed() throws Exception {
        when(optimizerClient.optimize(any())).thenThrow(new RuntimeException("boom"));

        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);

        OptimizationJob job = awaitTerminal(jobId, 15000);
        assertThat(job.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
        assertThat(job.getErrorMessage()).contains("unexpected error");
    }

    // --- after-commit ----------------------------------------------------------

    @Test
    void executorNotInvokedWhenTransactionRollsBack() throws Exception {
        when(optimizerClient.optimize(any())).thenReturn(optimizerResponse(true));

        JsonNode req = optimizerRequest();
        UUID[] captured = new UUID[1];
        try {
            tx().execute(status -> {
                captured[0] = jobService.submitJob(scenarioId,
                        OptimizationJob.Algorithm.DIJKSTRA, req, owner);
                throw new RuntimeException("force rollback");
            });
        } catch (RuntimeException expected) {
        }

        // give any (incorrectly scheduled) executor work a chance to run
        Thread.sleep(300);
        verify(optimizerClient, never()).optimize(any());
        boolean jobExists = tx().execute(s -> jobRepo.findById(captured[0]).isPresent());
        assertThat(jobExists).isFalse();
    }

    // --- startup recovery & readiness -------------------------------------------

    @Test
    void startupRecoveryFailsStaleJobs() {
        UUID queuedId = tx().execute(s -> {
            Scenario sc = scenarioRepo.findById(scenarioId).orElseThrow();
            OptimizationJob j = new OptimizationJob();
            j.setScenario(sc);
            j.setStatus(OptimizationJob.Status.QUEUED);
            j.setAlgorithm(OptimizationJob.Algorithm.DIJKSTRA);
            j.setRequestJson(om.createObjectNode());
            jobRepo.save(j);
            OptimizationJob r = new OptimizationJob();
            r.setScenario(sc);
            r.setStatus(OptimizationJob.Status.RUNNING);
            r.setAlgorithm(OptimizationJob.Algorithm.QPSO);
            r.setRequestJson(om.createObjectNode());
            jobRepo.save(r);
            return j.getId();
        });
        // also capture the RUNNING id
        UUID runningId = tx().execute(s -> jobRepo
                .findByStatus(OptimizationJob.Status.RUNNING).stream()
                .filter(j -> j.getScenario().getId().equals(scenarioId))
                .findFirst().orElseThrow().getId());

        int recovered = recoveryService.recoverStaleJobs();
        assertThat(recovered).isGreaterThanOrEqualTo(2);

        for (UUID id : new UUID[]{queuedId, runningId}) {
            OptimizationJob j = tx().execute(s -> jobRepo.findById(id).orElseThrow());
            assertThat(j.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
            assertThat(j.getErrorMessage()).contains("application restart");
            assertThat(j.getFinishedAt()).isNotNull();
            boolean hasResult = tx().execute(s -> resultRepo.existsByJob_Id(id));
            assertThat(hasResult).isFalse();
        }
    }

    @Test
    void submissionsRejectedUntilRecoveryComplete() throws Exception {
        recoveryService.markNotReady();
        try {
            assertThatThrownBy(() -> jobService.submitJob(scenarioId,
                    OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner))
                    .isInstanceOf(ApiException.class)
                    .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(503));
        } finally {
            recoveryService.markReady();
        }

        when(optimizerClient.optimize(any())).thenReturn(optimizerResponse(true));
        UUID jobId = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, optimizerRequest(), owner);
        assertThat(awaitTerminal(jobId, 15000).getStatus())
                .isEqualTo(OptimizationJob.Status.COMPLETED);
    }
}
