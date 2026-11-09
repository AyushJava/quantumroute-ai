package com.quantumroute.backend.controller;

import com.quantumroute.backend.dto.ScenarioDetail;
import com.quantumroute.backend.dto.ScenarioSummary;
import com.quantumroute.backend.dto.ScenarioUpsertRequest;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.service.ScenarioService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class ScenarioController {

    private final ScenarioService scenarioService;

    public ScenarioController(ScenarioService scenarioService) {
        this.scenarioService = scenarioService;
    }

    @PostMapping("/workspaces/{workspaceId}/scenarios")
    public ResponseEntity<ScenarioDetail> create(
            @PathVariable UUID workspaceId,
            @Valid @RequestBody ScenarioUpsertRequest request,
            @AuthenticationPrincipal AuthUser principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(scenarioService.create(workspaceId, request, principal));
    }

    @GetMapping("/workspaces/{workspaceId}/scenarios")
    public Page<ScenarioSummary> list(
            @PathVariable UUID workspaceId,
            @PageableDefault(size = 20) Pageable pageable,
            @AuthenticationPrincipal AuthUser principal) {
        return scenarioService.list(workspaceId, pageable, principal);
    }

    @GetMapping("/scenarios/{id}")
    public ScenarioDetail get(@PathVariable UUID id,
                              @AuthenticationPrincipal AuthUser principal) {
        return scenarioService.get(id, principal);
    }

    @PutMapping("/scenarios/{id}")
    public ScenarioDetail update(@PathVariable UUID id,
                                 @Valid @RequestBody ScenarioUpsertRequest request,
                                 @AuthenticationPrincipal AuthUser principal) {
        return scenarioService.update(id, request, principal);
    }

    @DeleteMapping("/scenarios/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id,
                                       @AuthenticationPrincipal AuthUser principal) {
        scenarioService.delete(id, principal);
        return ResponseEntity.noContent().build();
    }
}
