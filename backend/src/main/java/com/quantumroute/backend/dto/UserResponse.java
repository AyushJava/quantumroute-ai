package com.quantumroute.backend.dto;

import com.quantumroute.backend.entity.AppUser;

import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName, String role) {

    public static UserResponse from(AppUser user) {
        return new UserResponse(user.getId(), user.getEmail(),
                user.getDisplayName(), user.getRole().name());
    }
}
