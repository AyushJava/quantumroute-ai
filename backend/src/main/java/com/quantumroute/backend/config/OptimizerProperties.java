package com.quantumroute.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.optimizer")
public class OptimizerProperties {

    /** Base URL of the Python FastAPI optimizer, e.g. http://localhost:8000 */
    private String baseUrl = "http://localhost:8000";

    /** TCP connection timeout in milliseconds. */
    private long connectTimeoutMs = 3000;

    /** Response (read) timeout in milliseconds. */
    private long readTimeoutMs = 60000;

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public long getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(long connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public long getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(long readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }
}
