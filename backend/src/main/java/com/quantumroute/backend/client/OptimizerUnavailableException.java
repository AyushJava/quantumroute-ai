package com.quantumroute.backend.client;

/** Optimizer unreachable or connection-level failure (not a timeout). */
public class OptimizerUnavailableException extends OptimizerException {

    public OptimizerUnavailableException(String message, Throwable cause) {
        super(0, "OPTIMIZER_UNAVAILABLE", message, null);
        initCause(cause);
    }
}
