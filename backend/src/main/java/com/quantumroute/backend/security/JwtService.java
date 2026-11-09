package com.quantumroute.backend.security;

import com.quantumroute.backend.entity.AppUser;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

/**
 * Issues and validates HS256 JWTs. The signing secret comes from
 * {@code app.jwt.secret} (env {@code JWT_SECRET}) with no usable default;
 * startup fails fast if it is missing or shorter than the HS256 256-bit
 * minimum.
 */
@Service
public class JwtService {

    private static final int HS256_MIN_KEY_BYTES = 32;

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiration-minutes:15}")
    private long expirationMinutes;

    @Value("${app.jwt.clock-skew-seconds:30}")
    private long clockSkewSeconds;

    private SecretKey key;

    @PostConstruct
    void init() {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < HS256_MIN_KEY_BYTES) {
            throw new IllegalStateException(
                    "app.jwt.secret must be at least " + HS256_MIN_KEY_BYTES
                            + " bytes (256 bits) for HS256");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    public long expirationSeconds() {
        return expirationMinutes * 60;
    }

    public String generateToken(AuthUser user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.id().toString())
                .claim("email", user.email())
                .claim("role", user.role().name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
                .signWith(key)
                .compact();
    }

    /**
     * Validate a token and return its principal. Throws
     * {@link TokenExpiredException} when expired beyond clock skew and
     * {@link InvalidTokenException} for malformed/invalid-signature tokens.
     */
    public AuthUser parse(String token) {
        Claims claims;
        try {
            claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (ExpiredJwtException e) {
            // allow configurable clock skew before declaring expiry
            Instant exp = e.getClaims().getExpiration().toInstant();
            if (Instant.now().isBefore(exp.plusSeconds(clockSkewSeconds))) {
                claims = e.getClaims();
            } else {
                throw new TokenExpiredException("token expired");
            }
        } catch (Exception e) {
            throw new InvalidTokenException("invalid token", e);
        }

        try {
            UUID id = UUID.fromString(claims.getSubject());
            String email = claims.get("email", String.class);
            AppUser.Role role = AppUser.Role.valueOf(claims.get("role", String.class));
            return new AuthUser(id, email, role);
        } catch (Exception e) {
            throw new InvalidTokenException("token claims invalid", e);
        }
    }
}
