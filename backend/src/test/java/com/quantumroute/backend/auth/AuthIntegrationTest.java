package com.quantumroute.backend.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quantumroute.backend.entity.AppUser;
import com.quantumroute.backend.repository.AppUserRepository;
import com.quantumroute.backend.security.AuthUser;
import com.quantumroute.backend.security.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class AuthIntegrationTest {

    private static final String TEST_SECRET =
            "test-only-jwt-secret-key-0123456789abcdef";

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.jwt.secret", () -> TEST_SECRET);
    }

    @LocalServerPort
    private int port;

    private String base() {
        return "http://localhost:" + port;
    }

    @Autowired
    private AppUserRepository userRepo;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private PlatformTransactionManager txManager;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private TransactionTemplate tx;

    private TransactionTemplate tx() {
        if (tx == null) {
            tx = new TransactionTemplate(txManager);
        }
        return tx;
    }

    private record Resp(int status, String body) {}

    private Resp request(String method, String path, String body, String token) {
        try {
            var builder = HttpRequest.newBuilder(URI.create(base() + path))
                    .header("Content-Type", "application/json");
            if (token != null) {
                builder.header("Authorization", "Bearer " + token);
            }
            HttpRequest req = switch (method) {
                case "POST" -> builder.POST(
                        HttpRequest.BodyPublishers.ofString(body)).build();
                default -> builder.GET().build();
            };
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            return new Resp(res.statusCode(), res.body());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Resp postJson(String path, Map<String, Object> body) {
        try {
            return request("POST", path, objectMapper.writeValueAsString(body), null);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private Resp get(String path, String token) {
        return request("GET", path, null, token);
    }

    private JsonNode json(Resp r) throws Exception {
        return objectMapper.readTree(r.body());
    }

    private String registerUser(String email, String password) throws Exception {
        Resp r = postJson("/api/v1/auth/register",
                Map.of("email", email, "password", password, "displayName", "T"));
        if (r.status() != 201) {
            throw new AssertionError("register failed: " + r.body());
        }
        return json(r).get("id").asText();
    }

    private String loginToken(String email, String password) throws Exception {
        Resp r = postJson("/api/v1/auth/login",
                Map.of("email", email, "password", password));
        assertThat(r.status()).isEqualTo(200);
        JsonNode body = json(r);
        assertThat(body.get("tokenType").asText()).isEqualTo("Bearer");
        assertThat(body.get("expiresInSeconds").asLong()).isEqualTo(900);
        return body.get("accessToken").asText();
    }

    // --- Registration / login -------------------------------------------------

    @Test
    void registerAndLoginSuccess() throws Exception {
        String id = registerUser("User@Example.COM", "password123");
        assertThat(UUID.fromString(id)).isNotNull();

        Resp login = postJson("/api/v1/auth/login",
                Map.of("email", "user@example.com", "password", "password123"));
        assertThat(login.status()).isEqualTo(200);
        JsonNode body = json(login);
        assertThat(body.get("accessToken").asText()).isNotBlank();
        assertThat(body.get("user").get("email").asText()).isEqualTo("user@example.com");
        assertThat(body.get("user").get("role").asText()).isEqualTo("USER");
        assertThat(body.get("user").get("id").asText()).isEqualTo(id);

        AppUser stored = tx().execute(s ->
                userRepo.findByEmailIgnoreCase("user@example.com").orElseThrow());
        assertThat(stored.getEmail()).isEqualTo("user@example.com");
        assertThat(stored.getPasswordHash()).isNotEqualTo("password123");
        assertThat(stored.getPasswordHash()).startsWith("$2");
        assertThat(passwordEncoder.matches("password123", stored.getPasswordHash())).isTrue();
        assertThat(stored.getRole()).isEqualTo(AppUser.Role.USER);
    }

    @Test
    void duplicateEmailRejectedIncludingCaseVariants() throws Exception {
        registerUser("dup@example.com", "password123");
        Resp r = postJson("/api/v1/auth/register",
                Map.of("email", "DUP@example.com", "password", "password123"));
        assertThat(r.status()).isEqualTo(409);
        assertThat(json(r).get("code").asText()).isEqualTo("EMAIL_ALREADY_EXISTS");
    }

    @Test
    void passwordLongerThan72Utf8BytesRejected() throws Exception {
        Resp r = postJson("/api/v1/auth/register",
                Map.of("email", "longpw@example.com", "password", "é".repeat(40)));
        assertThat(r.status()).isEqualTo(400);
        assertThat(json(r).get("code").asText()).isEqualTo("PASSWORD_TOO_LONG");
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveSameError() throws Exception {
        registerUser("creds@example.com", "password123");

        Resp wrongPw = postJson("/api/v1/auth/login",
                Map.of("email", "creds@example.com", "password", "wrongpass1"));
        Resp unknown = postJson("/api/v1/auth/login",
                Map.of("email", "nobody@example.com", "password", "password123"));

        assertThat(wrongPw.status()).isEqualTo(401);
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(json(wrongPw).get("code").asText()).isEqualTo("INVALID_CREDENTIALS");
        assertThat(json(unknown).get("code").asText()).isEqualTo("INVALID_CREDENTIALS");
        // identical error semantics for both cases (no user enumeration);
        // only the per-response traceId differs
        assertThat(json(wrongPw).get("code").asText())
                .isEqualTo(json(unknown).get("code").asText());
        assertThat(json(wrongPw).get("message").asText())
                .isEqualTo(json(unknown).get("message").asText());
    }

    // --- JWT / protected endpoints ---------------------------------------------

    @Test
    void validTokenAccessesProtectedEndpoint() throws Exception {
        registerUser("jwt@example.com", "password123");
        String token = loginToken("jwt@example.com", "password123");

        Resp r = get("/api/v1/test/ping", token);
        assertThat(r.status()).isEqualTo(200);
        assertThat(json(r).get("email").asText()).isEqualTo("jwt@example.com");
        assertThat(json(r).get("role").asText()).isEqualTo("USER");
    }

    @Test
    void missingAuthHeaderReturns401() throws Exception {
        Resp r = get("/api/v1/test/ping", null);
        assertThat(r.status()).isEqualTo(401);
        assertThat(json(r).get("code").asText()).isEqualTo("UNAUTHENTICATED");
    }

    @Test
    void malformedTokenReturns401() throws Exception {
        Resp r = get("/api/v1/test/ping", "not-a-jwt");
        assertThat(r.status()).isEqualTo(401);
        assertThat(json(r).get("code").asText()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void tamperedTokenReturns401() throws Exception {
        registerUser("tamper@example.com", "password123");
        String token = loginToken("tamper@example.com", "password123");
        String tampered = token.substring(0, token.lastIndexOf('.') + 1) + "AAAA";
        Resp r = get("/api/v1/test/ping", tampered);
        assertThat(r.status()).isEqualTo(401);
        assertThat(json(r).get("code").asText()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void tokenSignedWithDifferentSecretReturns401() throws Exception {
        AppUser u = new AppUser();
        u.setEmail("other-secret@example.com");
        u.setPasswordHash("x");
        u.setRole(AppUser.Role.USER);
        AppUser saved = tx().execute(s -> userRepo.save(u));

        String foreignToken = io.jsonwebtoken.Jwts.builder()
                .subject(saved.getId().toString())
                .claim("email", saved.getEmail())
                .claim("role", "USER")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 600_000))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                        "a-completely-different-secret-0123456789".getBytes(StandardCharsets.UTF_8)))
                .compact();

        Resp r = get("/api/v1/test/ping", foreignToken);
        assertThat(r.status()).isEqualTo(401);
        assertThat(json(r).get("code").asText()).isEqualTo("INVALID_TOKEN");
    }

    @Test
    void expiredTokenReturns401TokenExpired() throws Exception {
        AppUser u = new AppUser();
        u.setEmail("expired@example.com");
        u.setPasswordHash("x");
        u.setRole(AppUser.Role.USER);
        AppUser saved = tx().execute(s -> userRepo.save(u));

        // expired 10 minutes ago — beyond the 30s clock skew
        String expired = io.jsonwebtoken.Jwts.builder()
                .subject(saved.getId().toString())
                .claim("email", saved.getEmail())
                .claim("role", "USER")
                .issuedAt(new Date(System.currentTimeMillis() - 3_600_000))
                .expiration(new Date(System.currentTimeMillis() - 600_000))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                        TEST_SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();

        Resp r = get("/api/v1/test/ping", expired);
        assertThat(r.status()).isEqualTo(401);
        assertThat(json(r).get("code").asText()).isEqualTo("TOKEN_EXPIRED");
    }

    // --- Authorization ----------------------------------------------------------

    @Test
    void userCannotAccessAdminEndpointButAdminCan() throws Exception {
        registerUser("roleuser@example.com", "password123");
        String userToken = loginToken("roleuser@example.com", "password123");

        Resp denied = get("/api/v1/test/admin", userToken);
        assertThat(denied.status()).isEqualTo(403);

        AppUser admin = new AppUser();
        admin.setEmail("roleadmin@example.com");
        admin.setPasswordHash("x");
        admin.setRole(AppUser.Role.ADMIN);
        AppUser savedAdmin = tx().execute(s -> userRepo.save(admin));
        String adminToken = jwtService.generateToken(new AuthUser(
                savedAdmin.getId(), savedAdmin.getEmail(), savedAdmin.getRole()));

        Resp allowed = get("/api/v1/test/admin", adminToken);
        assertThat(allowed.status()).isEqualTo(200);
        assertThat(json(allowed).get("status").asText()).isEqualTo("admin-ok");
    }
}
