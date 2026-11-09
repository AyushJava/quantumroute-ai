package com.quantumroute.backend.dto;

import com.quantumroute.backend.entity.Scenario;

import java.time.Instant;
import java.util.UUID;

/** Lightweight listing shape — deliberately excludes graphJson/configJson. */
public record ScenarioSummary(UUID id, UUID workspaceId, String name,
                              String graphVersion, Instant createdAt) {

    public static ScenarioSummary from(Scenario s) {
        return new ScenarioSummary(s.getId(), s.getWorkspace().getId(),
                s.getName(), s.getGraphVersion(), s.getCreatedAt());
    }
}
