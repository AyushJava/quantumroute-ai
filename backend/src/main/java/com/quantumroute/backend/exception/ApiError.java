package com.quantumroute.backend.exception;

import java.util.Map;

/** Contract error shape: {code, message, details, traceId} (blueprint §7.6). */
public record ApiError(String code, String message, Map<String, Object> details, String traceId) {

    public static ApiError of(String code, String message) {
        return new ApiError(code, message, Map.of(), java.util.UUID.randomUUID().toString());
    }

    public static ApiError of(String code, String message, Map<String, Object> details) {
        return new ApiError(code, message, details, java.util.UUID.randomUUID().toString());
    }
}
