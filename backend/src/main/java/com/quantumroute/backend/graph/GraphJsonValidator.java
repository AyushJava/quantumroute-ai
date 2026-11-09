package com.quantumroute.backend.graph;

import com.fasterxml.jackson.databind.JsonNode;
import com.quantumroute.backend.exception.ApiException;

import java.util.HashSet;
import java.util.Set;

/**
 * Structural validation for graph JSON accepted at scenario import.
 * Mirrors the Phase 1 GraphPayload constraints plus the Phase 2 cost-model
 * input requirements (positive finite length_m / speed_kmh on every edge).
 * This is import-time validation only — full semantic fidelity is enforced
 * again when the optimizer consumes the graph.
 */
public final class GraphJsonValidator {

    private GraphJsonValidator() {}

    public static void validate(JsonNode graph, boolean directed) {
        if (graph == null || !graph.isObject()) {
            throw invalid("graph must be a JSON object");
        }
        JsonNode nodes = graph.get("nodes");
        if (nodes == null || !nodes.isArray() || nodes.isEmpty()) {
            throw invalid("graph.nodes must be a non-empty array");
        }

        Set<String> nodeIds = new HashSet<>();
        for (JsonNode node : nodes) {
            JsonNode id = node.get("id");
            if (id == null || !id.isTextual() || id.asText().isBlank()) {
                throw invalid("each node requires a non-blank string id");
            }
            if (!nodeIds.add(id.asText())) {
                throw invalid("duplicate node id: " + id.asText());
            }
            checkCoord(node.get("lat"), -90.0, 90.0, "lat");
            checkCoord(node.get("lon"), -180.0, 180.0, "lon");
        }

        JsonNode edges = graph.get("edges");
        if (edges == null || !edges.isArray()) {
            throw invalid("graph.edges must be an array");
        }

        Set<String> seenPairs = new HashSet<>();
        for (JsonNode edge : edges) {
            String source = requireNodeRef(edge.get("source"), nodeIds, "source");
            String target = requireNodeRef(edge.get("target"), nodeIds, "target");
            if (source.equals(target)) {
                throw invalid("edge from node to itself: " + source);
            }

            // parallel-edge check: ordered pair for directed, unordered for undirected
            String pair = directed ? source + "->" + target
                                   : (source.compareTo(target) <= 0
                                      ? source + "->" + target : target + "->" + source);
            if (!seenPairs.add(pair)) {
                throw invalid("parallel edge between " + source + " and " + target);
            }

            requireNonNegativeFinite(edge.get("length_m"), "length_m");
            requirePositiveFinite(edge.get("speed_kmh"), "speed_kmh");
            checkOptionalFinite(edge.get("cost"), "cost", true);
            checkOptionalFinite(edge.get("congestion"), "congestion", false);
            if (edge.has("closed") && !edge.get("closed").isBoolean()) {
                throw invalid("edge.closed must be a boolean");
            }
        }
    }

    private static String requireNodeRef(JsonNode ref, Set<String> nodeIds, String field) {
        if (ref == null || !ref.isTextual() || !nodeIds.contains(ref.asText())) {
            throw invalid("edge." + field + " must reference an existing node id");
        }
        return ref.asText();
    }

    private static void requirePositiveFinite(JsonNode value, String field) {
        if (value == null || !value.isNumber() || !Double.isFinite(value.asDouble())
                || value.asDouble() <= 0) {
            throw invalid("edge." + field + " must be a positive finite number");
        }
    }

    private static void requireNonNegativeFinite(JsonNode value, String field) {
        if (value == null || !value.isNumber() || !Double.isFinite(value.asDouble())
                || value.asDouble() < 0) {
            throw invalid("edge." + field + " must be a non-negative finite number");
        }
    }

    private static void checkOptionalFinite(JsonNode value, String field, boolean nonNegative) {
        if (value == null || value.isNull()) {
            return;
        }
        if (!value.isNumber() || !Double.isFinite(value.asDouble())) {
            throw invalid("edge." + field + " must be a finite number");
        }
        if (nonNegative && value.asDouble() < 0) {
            throw invalid("edge." + field + " must be non-negative");
        }
        if (!nonNegative && (value.asDouble() < 0 || value.asDouble() > 1)) {
            throw invalid("edge." + field + " must be within [0, 1]");
        }
    }

    private static void checkCoord(JsonNode value, double min, double max, String field) {
        if (value == null || value.isNull()) {
            return;
        }
        if (!value.isNumber() || !Double.isFinite(value.asDouble())
                || value.asDouble() < min || value.asDouble() > max) {
            throw invalid("node." + field + " must be a finite number in [" + min + ", " + max + "]");
        }
    }

    private static ApiException invalid(String message) {
        return new ApiException(400, "INVALID_GRAPH", message);
    }
}
