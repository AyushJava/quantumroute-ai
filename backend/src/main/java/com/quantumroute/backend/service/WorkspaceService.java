package com.quantumroute.backend.service;

import com.quantumroute.backend.dto.WorkspaceResponse;
import com.quantumroute.backend.dto.WorkspaceUpsertRequest;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.Workspace;
import com.quantumroute.backend.exception.ApiException;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.repository.WorkspaceRepository;
import com.quantumroute.backend.security.AuthUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class WorkspaceService {

    private final WorkspaceRepository workspaceRepository;
    private final ScenarioRepository scenarioRepository;

    public WorkspaceService(WorkspaceRepository workspaceRepository,
                            ScenarioRepository scenarioRepository) {
        this.workspaceRepository = workspaceRepository;
        this.scenarioRepository = scenarioRepository;
    }

    @Transactional
    public WorkspaceResponse create(WorkspaceUpsertRequest request, AuthUser principal) {
        if (workspaceRepository.existsByOwner_IdAndName(principal.id(), request.name())) {
            throw new ApiException(409, "WORKSPACE_NAME_EXISTS",
                    "A workspace with this name already exists for this user");
        }
        Workspace ws = new Workspace();
        ws.setOwner(ownerRef(principal));
        ws.setName(request.name());
        try {
            workspaceRepository.saveAndFlush(ws);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(409, "WORKSPACE_NAME_EXISTS",
                    "A workspace with this name already exists for this user");
        }
        return WorkspaceResponse.from(ws);
    }

    @Transactional(readOnly = true)
    public Page<WorkspaceResponse> list(Pageable pageable, AuthUser principal) {
        Page<Workspace> page = principal.role() == AppUser.Role.ADMIN
                ? workspaceRepository.findAll(pageable)
                : workspaceRepository.findByOwner_Id(principal.id(), pageable);
        return page.map(WorkspaceResponse::from);
    }

    @Transactional(readOnly = true)
    public WorkspaceResponse get(UUID id, AuthUser principal) {
        return WorkspaceResponse.from(requireVisible(id, principal));
    }

    @Transactional
    public WorkspaceResponse update(UUID id, WorkspaceUpsertRequest request, AuthUser principal) {
        Workspace ws = requireVisible(id, principal);
        if (!request.name().equals(ws.getName())
                && workspaceRepository.existsByOwner_IdAndName(principal.id(), request.name())) {
            throw new ApiException(409, "WORKSPACE_NAME_EXISTS",
                    "A workspace with this name already exists for this user");
        }
        ws.setName(request.name());
        try {
            workspaceRepository.saveAndFlush(ws);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(409, "WORKSPACE_NAME_EXISTS",
                    "A workspace with this name already exists for this user");
        }
        return WorkspaceResponse.from(ws);
    }

    @Transactional
    public void delete(UUID id, AuthUser principal) {
        Workspace ws = requireVisible(id, principal);
        if (scenarioRepository.existsByWorkspace_Id(id)) {
            throw new ApiException(409, "WORKSPACE_NOT_EMPTY",
                    "Workspace still contains scenarios; delete them first");
        }
        workspaceRepository.delete(ws);
    }

    /** Load a workspace the principal may see; 404 for missing or foreign-owned. */
    public Workspace requireVisible(UUID id, AuthUser principal) {
        Workspace ws = workspaceRepository.findById(id)
                .orElseThrow(() -> notFound());
        if (principal.role() != AppUser.Role.ADMIN
                && !ws.getOwner().getId().equals(principal.id())) {
            throw notFound();
        }
        return ws;
    }

    private AppUser ownerRef(AuthUser principal) {
        AppUser u = new AppUser();
        u.setId(principal.id());
        return u;
    }

    private ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Resource not found");
    }
}
