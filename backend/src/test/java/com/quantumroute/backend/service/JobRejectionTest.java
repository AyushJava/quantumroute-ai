package com.quantumroute.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.client.OptimizerClient;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.repository.WorkspaceRepository;
import com.quantumroute.backend.security.AuthUser;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.stubbing.Answer;
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

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Executor rejection path: a saturated single-thread executor with zero queue
 * capacity rejects the second submission, which must mark the committed
 * QUEUED job FAILED.
 */
@SpringBootTest
@Testcontainers
class JobRejectionTest {

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
        // saturate: 1 thread, no queue -> second submit is rejected
        registry.add("app.executor.core-size", () -> "1");
        registry.add("app.executor.max-size", () -> "1");
        registry.add("app.executor.queue-capacity", () -> "0");
    }

    @Autowired private OptimizationJobService jobService;
    @Autowired private AppUserRepository userRepo;
    @Autowired private WorkspaceRepository workspaceRepo;
    @Autowired private ScenarioRepository scenarioRepo;
    @Autowired private OptimizationJobRepository jobRepo;
    @Autowired private PlatformTransactionManager txManager;
    @MockitoBean private OptimizerClient optimizerClient;

    private final ObjectMapper om = new ObjectMapper();
    private TransactionTemplate tx;

    private TransactionTemplate tx() {
        if (tx == null) tx = new TransactionTemplate(txManager);
        return tx;
    }

    @Autowired private com.quantumroute.backend.config.ExecutorProperties execProps;

    @Test
    void executorPropertiesBound() {
        assertThat(execProps.getCoreSize()).isEqualTo(1);
        assertThat(execProps.getMaxSize()).isEqualTo(1);
        assertThat(execProps.getQueueCapacity()).isEqualTo(0);
    }

    @Test
    void rejectedSubmissionMarksJobFailed() throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch entered = new CountDownLatch(1);
        when(optimizerClient.optimize(any())).thenAnswer((Answer<JsonNode>) inv -> {
            entered.countDown();
            release.await(10, TimeUnit.SECONDS);
            return om.readTree("""
                    {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":true,
                     "route":{"nodeIds":["A","B"],"edgeIds":[],"geometry":null},
                     "metrics":{"distanceMeters":1.0,
                                "estimatedTravelTimeSeconds":1.0,
                                "congestionPenalty":0.0,"objectiveValue":0.1},
                     "runtimeMs":1}
                    """);
        });

        UUID scenarioId = tx().execute(s -> {
            AppUser u = new AppUser();
            u.setEmail("rej-" + UUID.randomUUID() + "@example.com");
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
            sc.setGraphJson(om.createObjectNode());
            scenarioRepo.save(sc);
            return sc.getId();
        });
        AuthUser principal = tx().execute(s -> {
            Scenario sc = scenarioRepo.findById(scenarioId).orElseThrow();
            AppUser u = sc.getWorkspace().getOwner();
            return new AuthUser(u.getId(), u.getEmail(), u.getRole());
        });

        JsonNode request = om.readTree("""
                {"graph":{"name":"g","directed":false,
                 "nodes":[{"id":"A"},{"id":"B"}],
                 "edges":[{"source":"A","target":"B","length_m":1,"speed_kmh":1}]},
                 "sourceNodeId":"A","targetNodeId":"B","algorithm":"DIJKSTRA",
                 "objectiveWeights":{"alpha":0.6,"beta":0.25,"gamma":0.15},
                 "parameters":{}}
                """);

        // job 1 occupies the only thread inside optimizerClient.optimize
        UUID job1 = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, request, principal);
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();

        // job 2 is rejected: executor busy, queue capacity 0
        UUID job2 = jobService.submitJob(scenarioId,
                OptimizationJob.Algorithm.DIJKSTRA, request, principal);

        OptimizationJob rejected = null;
        for (int i = 0; i < 100; i++) {
            rejected = tx().execute(s -> jobRepo.findById(job2).orElse(null));
            if (rejected != null && rejected.getStatus() == OptimizationJob.Status.FAILED) break;
            Thread.sleep(20);
        }
        release.countDown();

        assertThat(rejected).isNotNull();
        assertThat(rejected.getStatus()).isEqualTo(OptimizationJob.Status.FAILED);
        assertThat(rejected.getErrorMessage()).contains("rejected");
        assertThat(rejected.getFinishedAt()).isNotNull();

        // job 1 completes normally once released
        OptimizationJob done = null;
        for (int i = 0; i < 100; i++) {
            done = tx().execute(s -> jobRepo.findById(job1).orElse(null));
            if (done != null && done.getStatus() == OptimizationJob.Status.COMPLETED) break;
            Thread.sleep(20);
        }
        assertThat(done).isNotNull();
        assertThat(done.getStatus()).isEqualTo(OptimizationJob.Status.COMPLETED);
    }
}
