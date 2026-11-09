package com.quantumroute.backend.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "optimization_job")
public class OptimizationJob {

    public enum Status {
        QUEUED, RUNNING, COMPLETED, FAILED, TIMEOUT
    }

    public enum Algorithm {
        DIJKSTRA, ASTAR, QPSO
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "scenario_id", nullable = false)
    private Scenario scenario;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private Algorithm algorithm;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode requestJson;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "error_message")
    private String errorMessage;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public Scenario getScenario() { return scenario; }
    public void setScenario(Scenario scenario) { this.scenario = scenario; }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public Algorithm getAlgorithm() { return algorithm; }
    public void setAlgorithm(Algorithm algorithm) { this.algorithm = algorithm; }

    public JsonNode getRequestJson() { return requestJson; }
    public void setRequestJson(JsonNode requestJson) { this.requestJson = requestJson; }

    public Instant getCreatedAt() { return createdAt; }

    public Instant getFinishedAt() { return finishedAt; }
    public void setFinishedAt(Instant finishedAt) { this.finishedAt = finishedAt; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
