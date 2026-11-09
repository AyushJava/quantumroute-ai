package com.quantumroute.backend.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Extracts {@code Authorization: Bearer <jwt>}, validates it via
 * {@link JwtService} and populates the SecurityContext with an immutable
 * {@link AuthUser} principal. Token failures set a request attribute that
 * the authentication entry point translates into a contract-shaped 401.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String AUTH_ERROR_ATTRIBUTE = "quantumroute.auth.error";

    private final JwtService jwtService;

    public JwtAuthFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring("Bearer ".length()).trim();
            try {
                AuthUser user = jwtService.parse(token);
                var auth = new UsernamePasswordAuthenticationToken(
                        user, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + user.role().name())));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (TokenExpiredException e) {
                request.setAttribute(AUTH_ERROR_ATTRIBUTE, "TOKEN_EXPIRED");
            } catch (InvalidTokenException e) {
                request.setAttribute(AUTH_ERROR_ATTRIBUTE, "INVALID_TOKEN");
            }
        }
        chain.doFilter(request, response);
    }
}
