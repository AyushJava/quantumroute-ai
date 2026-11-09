package com.quantumroute.backend.dto;

import com.quantumroute.backend.entity.Workspace;

import java.time.Instant;
import java.util.UUID;

public record WorkspaceResponse(UUID id, String name, Instant createdAt) {

    public static WorkspaceResponse from(Workspace ws) {
        return new WorkspaceResponse(ws.getId(), ws.getName(), ws.getCreatedAt());
    }
}
