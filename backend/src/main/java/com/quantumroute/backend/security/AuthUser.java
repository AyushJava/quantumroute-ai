package com.quantumroute.backend.security;

import com.quantumroute.backend.entity.AppUser;

import java.util.UUID;

/**
 * Immutable authenticated-user principal stored in the SecurityContext.
 * Deliberately NOT the JPA entity — the security context must not hold
 * managed/detached entity state.
 */
public record AuthUser(UUID id, String email, AppUser.Role role) {
}
