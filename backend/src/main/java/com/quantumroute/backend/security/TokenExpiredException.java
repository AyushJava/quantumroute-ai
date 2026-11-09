package com.quantumroute.backend.security;

/** Token expired beyond the configured clock skew. Maps to 401 TOKEN_EXPIRED. */
public class TokenExpiredException extends RuntimeException {
    public TokenExpiredException(String message) {
        super(message);
    }
}
