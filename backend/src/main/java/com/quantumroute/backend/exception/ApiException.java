package com.quantumroute.backend.exception;

/** Application exception carrying an API error code and HTTP status. */
public class ApiException extends RuntimeException {

    private final String code;
    private final int status;

    public ApiException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public String getCode() { return code; }
    public int getStatus() { return status; }
}
