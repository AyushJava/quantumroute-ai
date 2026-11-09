package com.quantumroute.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.dto.JobResponse;
import com.quantumroute.backend.dto.JobResultResponse;
import com.quantumroute.backend.dto.JobSubmitRequest;
import com.quantumroute.backend.entity.OptimizationJob;
import com.quantumroute.backend.entity.OptimizationResult;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.service.OptimizationJobService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class OptimizationJobController {

    private final OptimizationJobService jobService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OptimizationJobController(OptimizationJobService jobService) {
        this.jobService = jobService;
    }

    @PostMapping("/scenarios/{scenarioId}/jobs")
    public ResponseEntity<JobResponse> submit(
            @PathVariable UUID scenarioId,
            @Valid @RequestBody JobSubmitRequest request,
            @AuthenticationPrincipal AuthUser principal) {
        UUID jobId = jobService.submitJob(scenarioId, request, principal);
        OptimizationJob job = jobService.getJob(jobId, principal);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(toResponse(job));
    }

    @GetMapping("/scenarios/{scenarioId}/jobs")
    public Page<JobResponse> list(
            @PathVariable UUID scenarioId,
            @AuthenticationPrincipal AuthUser principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return jobService.listJobs(scenarioId, pageable, principal)
                .map(this::toResponse);
    }

    @GetMapping("/jobs/{id}")
    public JobResponse get(@PathVariable UUID id,
                           @AuthenticationPrincipal AuthUser principal) {
        return toResponse(jobService.getJob(id, principal));
    }

    @GetMapping("/jobs/{id}/result")
    public JobResultResponse result(@PathVariable UUID id,
                                    @AuthenticationPrincipal AuthUser principal) {
        OptimizationResult result = jobService.getResult(id, principal);
        return toResultResponse(result);
    }

    private JobResponse toResponse(OptimizationJob job) {
        return new JobResponse(
                job.getId(),
                job.getScenario().getId(),
                job.getStatus(),
                job.getAlgorithm(),
                job.getCreatedAt(),
                job.getFinishedAt(),
                job.getErrorMessage());
    }

    private JobResultResponse toResultResponse(OptimizationResult result) {
        JsonNode envelope = result.getRouteJson();
        JsonNode route = envelope.path("route");
        JsonNode metadata = envelope.path("algorithmMetadata");

        Map<String, Object> metrics = null;
        if (result.getDistanceM() != null || result.getTimeS() != null
                || result.getCongestion() != null || result.getObjective() != null) {
            metrics = new LinkedHashMap<>();
            metrics.put("distanceMeters", result.getDistanceM());
            metrics.put("estimatedTravelTimeSeconds", result.getTimeS());
            metrics.put("congestionPenalty", result.getCongestion());
            metrics.put("objectiveValue", result.getObjective());
        }

        return new JobResultResponse(
                result.getJob().getId(),
                result.isFeasible(),
                route.isMissingNode() ? Map.of()
                        : objectMapper.convertValue(route, Map.class),
                metrics,
                result.getRuntimeMs(),
                metadata.isMissingNode() || metadata.isNull() ? null
                        : objectMapper.convertValue(metadata, Map.class));
    }
}
