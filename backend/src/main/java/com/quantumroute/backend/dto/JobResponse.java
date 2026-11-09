package com.quantumroute.backend.dto;

import com.quantumroute.backend.entity.OptimizationJob;

import java.time.Instant;
import java.util.UUID;

public record JobResponse(
        UUID id,
        UUID scenarioId,
        OptimizationJob.Status status,
        OptimizationJob.Algorithm algorithm,
        Instant createdAt,
        Instant finishedAt,
        String errorMessage
) {}
