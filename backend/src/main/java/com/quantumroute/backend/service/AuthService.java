package com.quantumroute.backend.service;

import com.quantumroute.backend.dto.AuthResponse;
import com.quantumroute.backend.dto.LoginRequest;
import com.quantumroute.backend.dto.RegisterRequest;
import com.quantumroute.backend.dto.UserResponse;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.exception.ApiException;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

@Service
public class AuthService {

    /** BCrypt silently truncates input beyond 72 bytes. */
    private static final int BCRYPT_MAX_BYTES = 72;

    private final AppUserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AppUserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ApiException(409, "EMAIL_ALREADY_EXISTS",
                    "An account with this email already exists");
        }
        if (request.password().getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new ApiException(400, "PASSWORD_TOO_LONG",
                    "Password must be at most 72 UTF-8 bytes");
        }

        AppUser user = new AppUser();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.displayName());
        user.setRole(AppUser.Role.USER);
        userRepository.save(user);
        return UserResponse.from(user);
    }

    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        AppUser user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> invalidCredentials());
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw invalidCredentials();
        }

        AuthUser principal = new AuthUser(user.getId(), user.getEmail(), user.getRole());
        String token = jwtService.generateToken(principal);
        return new AuthResponse(token, "Bearer",
                jwtService.expirationSeconds(), UserResponse.from(user));
    }

    private ApiException invalidCredentials() {
        // identical error for unknown email and wrong password (no enumeration)
        return new ApiException(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    private String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
