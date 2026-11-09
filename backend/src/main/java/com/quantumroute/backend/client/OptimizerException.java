package com.quantumroute.backend.client;

/**
 * Optimizer call failed with an HTTP error response. Carries the optimizer's
 * standard error contract ({@code code, message, details, traceId}).
 */
public class OptimizerException extends RuntimeException {

    private final int httpStatus;
    private final String code;
    private final String traceId;

    public OptimizerException(int httpStatus, String code, String message, String traceId) {
        super(message);
        this.httpStatus = httpStatus;
        this.code = code;
        this.traceId = traceId;
    }

    public int getHttpStatus() { return httpStatus; }
    public String getCode() { return code; }
    public String getTraceId() { return traceId; }
}
