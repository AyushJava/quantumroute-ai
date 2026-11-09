package com.quantumroute.backend.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class OptimizerClientTest {

    private final ObjectMapper om = new ObjectMapper();
    private OptimizerClient client;
    private MockRestServiceServer server;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl("http://optimizer.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new OptimizerClient(builder.build());
    }

    private JsonNode request() throws Exception {
        return om.readTree("""
                {"graph":{"name":"g","directed":false,"nodes":[{"id":"A"},{"id":"B"}],
                 "edges":[{"source":"A","target":"B","length_m":1,"speed_kmh":1}]},
                 "sourceNodeId":"A","targetNodeId":"B","algorithm":"DIJKSTRA",
                 "objectiveWeights":{"alpha":0.6,"beta":0.25,"gamma":0.15},
                 "parameters":{}}
                """);
    }

    @Test
    void feasibleResponseDeserializes() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"status":"COMPLETED","algorithm":"DIJKSTRA","feasible":true,
                         "route":{"nodeIds":["A","B"],"edgeIds":["1:A|1:B"],
                                  "geometry":{"type":"LineString","coordinates":[[1,2],[3,4]]}},
                         "metrics":{"distanceMeters":1000.0,
                                    "estimatedTravelTimeSeconds":72.0,
                                    "congestionPenalty":0.2,"objectiveValue":0.5},
                         "runtimeMs":42}
                        """, MediaType.APPLICATION_JSON));

        JsonNode res = client.optimize(request());

        assertThat(res.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(res.get("feasible").asBoolean()).isTrue();
        assertThat(res.get("route").get("nodeIds").get(1).asText()).isEqualTo("B");
        assertThat(res.get("metrics").get("distanceMeters").asDouble()).isEqualTo(1000.0);
        assertThat(res.get("runtimeMs").asInt()).isEqualTo(42);
        server.verify();
    }

    @Test
    void infeasibleResponseDeserializes() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"status":"COMPLETED","algorithm":"ASTAR","feasible":false,
                         "route":{"nodeIds":[],"edgeIds":[],"geometry":null},
                         "metrics":null,"runtimeMs":7}
                        """, MediaType.APPLICATION_JSON));

        JsonNode res = client.optimize(request());

        assertThat(res.get("feasible").asBoolean()).isFalse();
        assertThat(res.get("route").get("nodeIds").isEmpty()).isTrue();
        assertThat(res.get("metrics").isNull()).isTrue();
        server.verify();
    }

    @Test
    void qpsoMetadataPreserved() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("""
                        {"status":"COMPLETED","algorithm":"QPSO","feasible":true,
                         "route":{"nodeIds":["A","B"],"edgeIds":[],"geometry":null},
                         "metrics":{"distanceMeters":1.0,
                                    "estimatedTravelTimeSeconds":1.0,
                                    "congestionPenalty":0.0,"objectiveValue":0.3},
                         "runtimeMs":100,
                         "algorithmMetadata":{"seed":42,"iterationsRun":5,
                            "usedRepair":false,"repairRate":0.0,
                            "feasibilityRate":1.0,"convergenceTrace":[0.5,0.3],
                            "parameters":{"particles":10}}}
                        """, MediaType.APPLICATION_JSON));

        JsonNode res = client.optimize(request());

        JsonNode meta = res.get("algorithmMetadata");
        assertThat(meta.get("seed").asInt()).isEqualTo(42);
        assertThat(meta.get("convergenceTrace").size()).isEqualTo(2);
        server.verify();
    }

    @Test
    void http422MapsOptimizerErrorContract() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                        .body("""
                        {"detail":{"code":"UNKNOWN_NODE","message":"node ZZZ missing",
                         "details":{"node":"ZZZ"},"traceId":"abc-123"}}
                        """)
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.optimize(request()))
                .isInstanceOf(OptimizerException.class)
                .satisfies(e -> {
                    OptimizerException oe = (OptimizerException) e;
                    assertThat(oe.getHttpStatus()).isEqualTo(422);
                    assertThat(oe.getCode()).isEqualTo("UNKNOWN_NODE");
                    assertThat(oe.getTraceId()).isEqualTo("abc-123");
                    assertThat(oe.getMessage()).contains("ZZZ");
                });
        server.verify();
    }

    @Test
    void http500MapsServerError() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body("{\"detail\":{\"code\":\"INTERNAL_ERROR\",\"message\":\"boom\",\"details\":{},\"traceId\":\"t1\"}}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.optimize(request()))
                .isInstanceOf(OptimizerException.class)
                .satisfies(e -> {
                    OptimizerException oe = (OptimizerException) e;
                    assertThat(oe.getHttpStatus()).isEqualTo(500);
                    assertThat(oe.getCode()).isEqualTo("INTERNAL_ERROR");
                });
    }

    @Test
    void http504MapsGatewayTimeout() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.GATEWAY_TIMEOUT)
                        .body("{\"detail\":{\"code\":\"TIMEOUT\",\"message\":\"too slow\",\"details\":{},\"traceId\":\"t2\"}}")
                        .contentType(MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.optimize(request()))
                .isInstanceOf(OptimizerException.class)
                .satisfies(e -> assertThat(((OptimizerException) e).getHttpStatus()).isEqualTo(504));
    }

    @Test
    void connectionFailureMapsUnavailable() {
        // point at a port nothing listens on
        var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        var restClient = RestClient.builder()
                .baseUrl("http://127.0.0.1:1")
                .requestFactory(factory)
                .build();
        OptimizerClient dead = new OptimizerClient(restClient);

        assertThatThrownBy(() -> dead.optimize(om.createObjectNode()))
                .isInstanceOf(OptimizerUnavailableException.class)
                .satisfies(e -> assertThat(((OptimizerException) e).getCode())
                        .isEqualTo("OPTIMIZER_UNAVAILABLE"));
    }

    @Test
    void readTimeoutThrowsOptimizerTimeoutException() throws Exception {
        // real HTTP server that never responds within the client read timeout
        var server = com.sun.net.httpserver.HttpServer.create(
                new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v1/optimize", exchange -> {
            try {
                Thread.sleep(5000);
            } catch (InterruptedException ignored) {
            }
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            int port = server.getAddress().getPort();
            var factory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(java.time.Duration.ofMillis(1000));
            factory.setReadTimeout(java.time.Duration.ofMillis(300));
            OptimizerClient slow = new OptimizerClient(RestClient.builder()
                    .baseUrl("http://127.0.0.1:" + port)
                    .requestFactory(factory)
                    .build());

            assertThatThrownBy(() -> slow.optimize(request()))
                    .isInstanceOf(OptimizerTimeoutException.class)
                    .satisfies(e -> assertThat(((OptimizerException) e).getCode())
                            .isEqualTo("OPTIMIZER_TIMEOUT"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void nonJsonErrorBodyStillMaps() throws Exception {
        server.expect(requestTo("http://optimizer.test/api/v1/optimize"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY).body("bad gateway"));

        assertThatThrownBy(() -> client.optimize(request()))
                .isInstanceOf(OptimizerException.class)
                .satisfies(e -> {
                    OptimizerException oe = (OptimizerException) e;
                    assertThat(oe.getHttpStatus()).isEqualTo(502);
                    assertThat(oe.getCode()).isEqualTo("OPTIMIZER_SERVER_ERROR");
                });
    }
}
