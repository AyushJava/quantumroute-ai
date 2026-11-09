package com.quantumroute.backend.dto;

import jakarta.validation.constraints.Size;

import java.util.Map;

public record ScenarioUpsertRequest(
        @Size(max = 120) String name,
        @Size(max = 80) String graphVersion,
        Map<String, Object> graph,
        Map<String, Object> config) {
}
