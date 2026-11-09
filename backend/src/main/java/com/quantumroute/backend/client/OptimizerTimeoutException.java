package com.quantumroute.backend.client;

/** Connection or response timeout reaching the optimizer. No retries. */
public class OptimizerTimeoutException extends OptimizerException {

    public OptimizerTimeoutException(String message, Throwable cause) {
        super(0, "OPTIMIZER_TIMEOUT", message, null);
        initCause(cause);
    }
}
