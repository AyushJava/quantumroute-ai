package com.quantumroute.backend.dto;

import com.quantumroute.backend.entity.OptimizationJob;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

/**
 * Job submission body. The server merges the scenario's stored graph with
 * these fields to build the optimizer request. Unknown fields are rejected.
 */
public record JobSubmitRequest(
        @NotNull OptimizationJob.Algorithm algorithm,
        @NotBlank String sourceNodeId,
        @NotBlank String targetNodeId,
        Map<String, Object> objectiveWeights,
        Map<String, Object> parameters
) {}
