package com.quantumroute.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.dto.ScenarioDetail;
import com.quantumroute.backend.dto.ScenarioSummary;
import com.quantumroute.backend.dto.ScenarioUpsertRequest;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.entity.Scenario;
import com.quantumroute.backend.entity.Workspace;
import com.quantumroute.backend.exception.ApiException;
import com.quantumroute.backend.graph.GraphJsonValidator;
import com.quantumroute.backend.repository.OptimizationJobRepository;
import com.quantumroute.backend.repository.ScenarioRepository;
import com.quantumroute.backend.security.AuthUser;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
public class ScenarioService {

    private final ScenarioRepository scenarioRepository;
    private final OptimizationJobRepository jobRepository;
    private final WorkspaceService workspaceService;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode toJsonNode(Map<String, Object> map) {
        return map == null ? null : MAPPER.valueToTree(map);
    }

    public ScenarioService(ScenarioRepository scenarioRepository,
                           OptimizationJobRepository jobRepository,
                           WorkspaceService workspaceService) {
        this.scenarioRepository = scenarioRepository;
        this.jobRepository = jobRepository;
        this.workspaceService = workspaceService;
    }

    @Transactional
    public ScenarioDetail create(UUID workspaceId, ScenarioUpsertRequest request,
                                 AuthUser principal) {
        Workspace ws = workspaceService.requireVisible(workspaceId, principal);
        JsonNode graph = toJsonNode(request.graph());
        if (graph == null) {
            throw new ApiException(400, "INVALID_GRAPH", "graph is required");
        }
        boolean directed = graph.path("directed").asBoolean(false);
        GraphJsonValidator.validate(graph, directed);

        Scenario s = new Scenario();
        s.setWorkspace(ws);
        s.setName(request.name() == null || request.name().isBlank()
                ? "Untitled scenario" : request.name());
        s.setGraphVersion(request.graphVersion() == null || request.graphVersion().isBlank()
                ? "v1" : request.graphVersion());
        s.setGraphJson(graph);
        s.setConfigJson(toJsonNode(request.config()));
        try {
            scenarioRepository.saveAndFlush(s);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(409, "SCENARIO_NAME_EXISTS",
                    "A scenario with this name already exists in this workspace");
        }
        return ScenarioDetail.from(s);
    }

    @Transactional(readOnly = true)
    public Page<ScenarioSummary> list(UUID workspaceId, Pageable pageable, AuthUser principal) {
        workspaceService.requireVisible(workspaceId, principal);
        return scenarioRepository.findByWorkspace_Id(workspaceId, pageable)
                .map(ScenarioSummary::from);
    }

    @Transactional(readOnly = true)
    public ScenarioDetail get(UUID id, AuthUser principal) {
        return ScenarioDetail.from(requireVisible(id, principal));
    }

    @Transactional
    public ScenarioDetail update(UUID id, ScenarioUpsertRequest request, AuthUser principal) {
        Scenario s = requireVisible(id, principal);

        if (request.name() != null) {
            s.setName(request.name());
        }
        JsonNode newConfig = toJsonNode(request.config());
        if (newConfig != null) {
            s.setConfigJson(newConfig);
        }

        JsonNode newGraph = toJsonNode(request.graph());
        if (newGraph != null) {
            boolean directed = newGraph.path("directed").asBoolean(false);
            GraphJsonValidator.validate(newGraph, directed);
            if (!newGraph.equals(s.getGraphJson())) {
                // graph content changed -> graphVersion must change too
                if (request.graphVersion() == null
                        || request.graphVersion().equals(s.getGraphVersion())) {
                    throw new ApiException(400, "GRAPH_VERSION_UNCHANGED",
                            "graphVersion must change when graph content changes");
                }
                s.setGraphJson(newGraph);
                s.setGraphVersion(request.graphVersion());
            }
        } else if (request.graphVersion() != null
                && !request.graphVersion().equals(s.getGraphVersion())) {
            // version label may be bumped without graph change
            s.setGraphVersion(request.graphVersion());
        }

        try {
            scenarioRepository.saveAndFlush(s);
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(409, "SCENARIO_NAME_EXISTS",
                    "A scenario with this name already exists in this workspace");
        }
        return ScenarioDetail.from(s);
    }

    @Transactional
    public void delete(UUID id, AuthUser principal) {
        Scenario s = requireVisible(id, principal);
        if (jobRepository.existsByScenario_Id(id)) {
            throw new ApiException(409, "SCENARIO_HAS_JOBS",
                    "Scenario has optimization jobs; job history is preserved");
        }
        scenarioRepository.delete(s);
    }

    private Scenario requireVisible(UUID id, AuthUser principal) {
        Scenario s = scenarioRepository.findById(id)
                .orElseThrow(() -> notFound());
        Workspace ws = s.getWorkspace();
        if (principal.role() != AppUser.Role.ADMIN
                && !ws.getOwner().getId().equals(principal.id())) {
            throw notFound();
        }
        return s;
    }

    private ApiException notFound() {
        return new ApiException(404, "NOT_FOUND", "Resource not found");
    }
}
