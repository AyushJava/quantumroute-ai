package com.quantumroute.backend.controller;

import com.quantumroute.backend.dto.WorkspaceResponse;
import com.quantumroute.backend.dto.WorkspaceUpsertRequest;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.service.WorkspaceService;
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
@RequestMapping("/api/v1/workspaces")
public class WorkspaceController {

    private final WorkspaceService workspaceService;

    public WorkspaceController(WorkspaceService workspaceService) {
        this.workspaceService = workspaceService;
    }

    @PostMapping
    public ResponseEntity<WorkspaceResponse> create(
            @Valid @RequestBody WorkspaceUpsertRequest request,
            @AuthenticationPrincipal AuthUser principal) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workspaceService.create(request, principal));
    }

    @GetMapping
    public Page<WorkspaceResponse> list(
            @PageableDefault(size = 20) Pageable pageable,
            @AuthenticationPrincipal AuthUser principal) {
        return workspaceService.list(pageable, principal);
    }

    @GetMapping("/{id}")
    public WorkspaceResponse get(@PathVariable UUID id,
                                 @AuthenticationPrincipal AuthUser principal) {
        return workspaceService.get(id, principal);
    }

    @PutMapping("/{id}")
    public WorkspaceResponse update(@PathVariable UUID id,
                                    @Valid @RequestBody WorkspaceUpsertRequest request,
                                    @AuthenticationPrincipal AuthUser principal) {
        return workspaceService.update(id, request, principal);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id,
                                       @AuthenticationPrincipal AuthUser principal) {
        workspaceService.delete(id, principal);
        return ResponseEntity.noContent().build();
    }
}
