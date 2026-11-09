package com.quantumroute.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkspaceUpsertRequest(
        @NotBlank @Size(max = 120) String name) {
}
