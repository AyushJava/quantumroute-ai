package com.quantumroute.backend.security;

/** Token signature/format invalid or otherwise unusable. Maps to 401 INVALID_TOKEN. */
public class InvalidTokenException extends RuntimeException {
    public InvalidTokenException(String message, Throwable cause) {
        super(message, cause);
    }
}
