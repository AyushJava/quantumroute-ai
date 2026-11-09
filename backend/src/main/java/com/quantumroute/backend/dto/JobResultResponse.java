package com.quantumroute.backend.dto;

import java.util.Map;
import java.util.UUID;

public record JobResultResponse(
        UUID jobId,
        boolean feasible,
        Map<String, Object> route,
        Map<String, Object> metrics,
        Long runtimeMs,
        Map<String, Object> algorithmMetadata
) {}
