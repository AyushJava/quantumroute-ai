package com.quantumroute.backend.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.util.Map;

/**
 * HTTP client for the Python FastAPI optimizer ({@code POST /api/v1/optimize}).
 * No automatic retries. Error responses are mapped to typed exceptions.
 */
public class OptimizerClient {

    private static final String OPTIMIZE_PATH = "/api/v1/optimize";

    private final RestClient restClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OptimizerClient(RestClient restClient) {
        this.restClient = restClient;
    }

    /**
     * Submit an optimization request. Returns the parsed response tree
     * (COMPLETED envelope for both feasible and infeasible outcomes).
     *
     * @throws OptimizerTimeoutException      on connect/read timeout
     * @throws OptimizerUnavailableException  on connection failure
     * @throws OptimizerException             on HTTP error responses
     */
    public JsonNode optimize(JsonNode request) {
        try {
            return restClient.post()
                    .uri(OPTIMIZE_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(objectMapper.convertValue(request, Map.class))
                    .exchange((req, res) -> {
                        String body = new String(res.getBody().readAllBytes());
                        if (res.getStatusCode().is2xxSuccessful()) {
                            return objectMapper.readTree(body);
                        }
                        throw mapHttpError(res.getStatusCode().value(), body);
                    });
        } catch (OptimizerException e) {
            throw e;
        } catch (ResourceAccessException e) {
            throw mapTransportError(e);
        } catch (java.io.UncheckedIOException e) {
            throw new OptimizerException(502, "OPTIMIZER_BAD_RESPONSE",
                    "unreadable optimizer response", null);
        }
    }

    private OptimizerException mapHttpError(int status, String body) {
        String code = status >= 500 ? "OPTIMIZER_SERVER_ERROR" : "OPTIMIZER_REJECTED";
        String message = "optimizer returned HTTP " + status;
        String traceId = null;
        try {
            JsonNode err = objectMapper.readTree(body);
            JsonNode detail = err.has("detail") && err.get("detail").isObject()
                    ? err.get("detail") : err;
            if (detail.hasNonNull("code")) code = detail.get("code").asText();
            if (detail.hasNonNull("message")) message = detail.get("message").asText();
            if (detail.hasNonNull("traceId")) traceId = detail.get("traceId").asText();
        } catch (Exception ignored) {
            // non-JSON error body — keep status-derived code/message
        }
        return new OptimizerException(status, code, message, traceId);
    }

    private RuntimeException mapTransportError(ResourceAccessException e) {
        Throwable cause = e.getCause();
        boolean timeout = cause instanceof SocketTimeoutException
                || (cause instanceof IOException && cause.getMessage() != null
                    && cause.getMessage().toLowerCase().contains("timed out"));
        if (timeout) {
            return new OptimizerTimeoutException("optimizer response timed out", e);
        }
        return new OptimizerUnavailableException("optimizer unreachable", e);
    }
}
