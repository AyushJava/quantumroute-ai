package com.quantumroute.backend.dto;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.entity.Scenario;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ScenarioDetail(UUID id, UUID workspaceId, String name,
                             String graphVersion, Map<String, Object> graph,
                             Map<String, Object> config, Instant createdAt) {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};

    public static ScenarioDetail from(Scenario s) {
        return new ScenarioDetail(s.getId(), s.getWorkspace().getId(),
                s.getName(), s.getGraphVersion(),
                toMap(s.getGraphJson()), toMap(s.getConfigJson()),
                s.getCreatedAt());
    }

    private static Map<String, Object> toMap(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return MAPPER.convertValue(node, MAP_TYPE);
    }
}
