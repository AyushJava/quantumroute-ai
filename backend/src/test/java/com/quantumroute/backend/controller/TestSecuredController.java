package com.quantumroute.backend.controller;

import com.quantumroute.backend.security.AuthUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Test-only secured endpoints used to verify authentication and
 * USER/ADMIN authorization. Not part of the production API surface.
 */
@RestController
@RequestMapping("/api/v1/test")
public class TestSecuredController {

    @GetMapping("/ping")
    public Map<String, String> ping(@AuthenticationPrincipal AuthUser user) {
        return Map.of("email", user.email(), "role", user.role().name());
    }

    @GetMapping("/admin")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, String> admin() {
        return Map.of("status", "admin-ok");
    }
}
