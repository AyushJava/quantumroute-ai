package com.quantumroute.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.quantumroute.backend.client.OptimizerClient;
import com.quantumroute.backend.client.OptimizerException;
import com.quantumroute.backend.client.OptimizerTimeoutException;
import com.quantumroute.backend.client.OptimizerUnavailableException;
import com.quantumroute.backend.config.OptimizerProperties;
import com.quantumroute.backend.dto.JobSubmitRequest;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.OptimizationResult;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.exception.ApiException;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.OptimizationResultRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.security.AuthUser;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Optimization job lifecycle: QUEUED submission (after-commit executor
 * hand-off), RUNNING execution, and terminal COMPLETED/FAILED/TIMEOUT
 * transitions with durable error_message.
 */
@Service
public class OptimizationJobService {

    private static final double QPSO_SAFETY_MARGIN_S = 5.0;

    private final ScenarioRepository scenarioRepository;
    private final OptimizationJobRepository jobRepository;
    private final OptimizationResultRepository resultRepository;
    private final OptimizerClient optimizerClient;
    private final OptimizerProperties optimizerProperties;
    private final JobRecoveryService recoveryService;
    private final Executor jobExecutor;
    private final TransactionTemplate tx;
    private final TransactionTemplate txNew;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OptimizationJobService(ScenarioRepository scenarioRepository,
                                  OptimizationJobRepository jobRepository,
                                  OptimizationResultRepository resultRepository,
                                  OptimizerClient optimizerClient,
                                  OptimizerProperties optimizerProperties,
                                  JobRecoveryService recoveryService,
                                  @Qualifier("optimizationJobExecutor") Executor jobExecutor,
                                  PlatformTransactionManager txManager) {
        this.scenarioRepository = scenarioRepository;
        this.jobRepository = jobRepository;
        this.resultRepository = resultRepository;
        this.optimizerClient = optimizerClient;
        this.optimizerProperties = optimizerProperties;
        this.recoveryService = recoveryService;
        this.jobExecutor = jobExecutor;
        this.tx = new TransactionTemplate(txManager);
        this.txNew = new TransactionTemplate(txManager);
        this.txNew.setPropagationBehavior(
                org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /**
     * Persist a QUEUED job and submit it to the executor only after the
     * surrounding transaction commits.
     */
    public UUID submitJob(UUID scenarioId, OptimizationJob.Algorithm algorithm,
                          JsonNode optimizerRequest, AuthUser principal) {
        if (!recoveryService.isReady()) {
            throw new ApiException(503, "STARTUP_RECOVERY_IN_PROGRESS",
                    "startup recovery has not completed; job submissions are not accepted yet");
        }
        JsonNode prepared = prepareRequest(algorithm, optimizerRequest);

        return tx.execute(status -> {
            Scenario scenario = scenarioRepository.findById(scenarioId)
                    .orElseThrow(() -> notFound());
            requireOwnership(scenario, principal);

            OptimizationJob job = new OptimizationJob();
            job.setScenario(scenario);
            job.setStatus(OptimizationJob.Status.QUEUED);
            job.setAlgorithm(algorithm);
            job.setRequestJson(prepared);
            jobRepository.saveAndFlush(job);

            UUID jobId = job.getId();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    submitToExecutor(jobId);
                }
            });
            return jobId;
        });
    }

    /**
     * API-facing submit: merges the scenario's stored graph with the request
     * fields into the optimizer payload, then delegates to the lifecycle.
     */
    public UUID submitJob(UUID scenarioId, JobSubmitRequest request,
                          AuthUser principal) {
        Scenario scenario = tx.execute(status -> {
            Scenario sc = scenarioRepository.findById(scenarioId)
                    .orElseThrow(() -> notFound());
            requireOwnership(sc, principal);
            return sc;
        });

        ObjectNode body = objectMapper.createObjectNode();
        body.set("graph", scenario.getGraphJson());
        body.put("sourceNodeId", request.sourceNodeId());
        body.put("targetNodeId", request.targetNodeId());
        body.put("algorithm", request.algorithm().name());
        if (request.objectiveWeights() != null) {
            body.set("objectiveWeights",
                    objectMapper.valueToTree(request.objectiveWeights()));
        }
        body.set("parameters", request.parameters() == null
                ? objectMapper.createObjectNode()
                : objectMapper.valueToTree(request.parameters()));

        return submitJob(scenarioId, request.algorithm(), body, principal);
    }

    /** Owner-scoped single job lookup; ADMIN bypasses ownership. */
    public OptimizationJob getJob(UUID jobId, AuthUser principal) {
        Optional<OptimizationJob> job = principal.role() == AppUser.Role.ADMIN
                ? jobRepository.findById(jobId)
                : jobRepository.findByIdAndScenario_Workspace_Owner_Id(
                        jobId, principal.id());
        return job.orElseThrow(() -> notFound());
    }

    /** Paginated job history for a visible scenario. */
    public Page<OptimizationJob> listJobs(UUID scenarioId, Pageable pageable,
                                          AuthUser principal) {
        boolean visible = principal.role() == AppUser.Role.ADMIN
                ? scenarioRepository.existsById(scenarioId)
                : scenarioRepository.findByIdAndWorkspace_Owner_Id(
                        scenarioId, principal.id()).isPresent();
        if (!visible) {
            throw notFound();
        }
        // deterministic default: newest first, id as unique tie-breaker
        Pageable effective = pageable.getSort().isSorted() ? pageable
                : org.springframework.data.domain.PageRequest.of(
                        pageable.getPageNumber(), pageable.getPageSize(),
                        org.springframework.data.domain.Sort
                                .by(org.springframework.data.domain.Sort.Direction.DESC,
                                        "createdAt", "id"));
        return jobRepository.findByScenario_Id(scenarioId, effective);
    }

    /** Result for a visible job; absent for pending/failed/timed-out jobs. */
    public OptimizationResult getResult(UUID jobId, AuthUser principal) {
        Optional<OptimizationResult> result =
                principal.role() == AppUser.Role.ADMIN
                        ? resultRepository.findByJob_Id(jobId)
                        : resultRepository.findByJob_IdAndJob_Scenario_Workspace_Owner_Id(
                                jobId, principal.id());
        return result.orElseThrow(() -> notFound());
    }

    private void submitToExecutor(UUID jobId) {
        try {
            jobExecutor.execute(() -> executeJob(jobId));
        } catch (RejectedExecutionException e) {
            // afterCommit runs while synchronization is still active; REQUIRES_NEW
            // gives the failure mark its own committed transaction.
            txNew.execute(status -> {
                jobRepository.findById(jobId).ifPresent(job -> {
                    if (job.getStatus() == OptimizationJob.Status.QUEUED) {
                        job.setStatus(OptimizationJob.Status.FAILED);
                        job.setErrorMessage("job rejected: executor queue capacity exceeded");
                        job.setFinishedAt(Instant.now());
                        jobRepository.save(job);
                    }
                });
                return null;
            });
        }
    }

    /** Executor entry point: RUNNING -> terminal state. */
    public void executeJob(UUID jobId) {
        Boolean proceed = tx.execute(status -> {
            OptimizationJob job = jobRepository.findById(jobId).orElse(null);
            if (job == null || job.getStatus() != OptimizationJob.Status.QUEUED) {
                return false;
            }
            job.setStatus(OptimizationJob.Status.RUNNING);
            jobRepository.save(job);
            return true;
        });
        if (!Boolean.TRUE.equals(proceed)) {
            return;
        }

        JsonNode request = tx.execute(status -> jobRepository
                .findById(jobId).map(OptimizationJob::getRequestJson).orElse(null));
        if (request == null) {
            markTerminal(jobId, OptimizationJob.Status.FAILED,
                    "job request payload missing");
            return;
        }

        JsonNode response;
        try {
            response = optimizerClient.optimize(request);
        } catch (OptimizerTimeoutException e) {
            markTerminal(jobId, OptimizationJob.Status.TIMEOUT,
                    "optimizer timeout: " + e.getMessage());
            return;
        } catch (OptimizerException e) {
            OptimizationJob.Status terminal = e.getHttpStatus() == 504
                    ? OptimizationJob.Status.TIMEOUT
                    : OptimizationJob.Status.FAILED;
            markTerminal(jobId, terminal,
                    e.getCode() + ": " + e.getMessage());
            return;
        } catch (Exception e) {
            markTerminal(jobId, OptimizationJob.Status.FAILED,
                    "unexpected error: " + e.getMessage());
            return;
        }

        persistCompletion(jobId, response);
    }

    private void persistCompletion(UUID jobId, JsonNode response) {
        tx.execute(status -> {
            OptimizationJob job = jobRepository.findById(jobId).orElse(null);
            if (job == null || job.getStatus() != OptimizationJob.Status.RUNNING) {
                return null;
            }

            OptimizationResult result = new OptimizationResult();
            result.setJob(job);
            result.setFeasible(response.path("feasible").asBoolean(false));

            // route_json stores a small envelope so QPSO algorithmMetadata
            // survives without a schema change: {"route": {...},
            // "algorithmMetadata": {...}|null}
            ObjectNode envelope = objectMapper.createObjectNode();
            JsonNode route = response.path("route");
            envelope.set("route", route.isMissingNode() || route.isNull()
                    ? objectMapper.createObjectNode() : route);
            JsonNode metadata = response.path("algorithmMetadata");
            envelope.set("algorithmMetadata",
                    metadata.isMissingNode() || metadata.isNull()
                            ? com.fasterxml.jackson.databind.node.NullNode.getInstance()
                            : metadata);
            result.setRouteJson(envelope);

            JsonNode metrics = response.path("metrics");
            if (metrics != null && metrics.isObject()) {
                result.setDistanceM(nullableDouble(metrics, "distanceMeters"));
                result.setTimeS(nullableDouble(metrics, "estimatedTravelTimeSeconds"));
                result.setCongestion(nullableDouble(metrics, "congestionPenalty"));
                result.setObjective(nullableDouble(metrics, "objectiveValue"));
            }
            result.setRuntimeMs(response.path("runtimeMs").isNumber()
                    ? response.path("runtimeMs").asLong() : null);

            resultRepository.save(result);

            job.setStatus(OptimizationJob.Status.COMPLETED);
            job.setFinishedAt(Instant.now());
            jobRepository.save(job);
            return null;
        });
    }

    private void markTerminal(UUID jobId, OptimizationJob.Status status, String error) {
        tx.execute(s -> {
            jobRepository.findById(jobId).ifPresent(job -> {
                job.setStatus(status);
                job.setErrorMessage(error);
                job.setFinishedAt(Instant.now());
                jobRepository.save(job);
            });
            return null;
        });
    }

    /**
     * QPSO budget guard: an explicitly supplied timeBudgetS must satisfy
     * budget + margin < HTTP read timeout; when absent, a safe default is
     * injected into the stored request.
     */
    private JsonNode prepareRequest(OptimizationJob.Algorithm algorithm,
                                    JsonNode request) {
        if (algorithm != OptimizationJob.Algorithm.QPSO || request == null
                || !request.isObject()) {
            return request;
        }
        ObjectNode node = request.deepCopy();
        JsonNode paramsNode = node.path("parameters");
        double readTimeoutS = optimizerProperties.getReadTimeoutMs() / 1000.0;

        if (paramsNode.isObject() && paramsNode.hasNonNull("timeBudgetS")) {
            double budget = paramsNode.get("timeBudgetS").asDouble();
            if (!(budget > 0) || !(budget + QPSO_SAFETY_MARGIN_S < readTimeoutS)) {
                throw new ApiException(400, "INVALID_PARAMETERS",
                        "timeBudgetS must satisfy timeBudgetS + "
                                + (long) QPSO_SAFETY_MARGIN_S + "s < read timeout ("
                                + (long) readTimeoutS + "s)");
            }
            return node;
        }

        ObjectNode params = paramsNode.isObject()
                ? (ObjectNode) paramsNode : node.putObject("parameters");
        params.put("timeBudgetS", readTimeoutS - QPSO_SAFETY_MARGIN_S - 1.0);
        return node;
    }

    private Double nullableDouble(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && v.isNumber() ? v.asDouble() : null;
    }

    private void requireOwnership(Scenario scenario, AuthUser principal) {
        if (principal.role() != AppUser.Role.ADMIN
                && !scenario.getWorkspace().getOwner().getId().equals(principal.id())) {
            throw notFound();
        }
    }

    private ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Resource not found");
    }
}
