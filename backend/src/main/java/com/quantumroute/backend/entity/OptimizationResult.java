package com.quantumroute.backend.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

@Entity
@Table(name = "optimization_result")
public class OptimizationResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(optional = false)
    @JoinColumn(name = "job_id", nullable = false, unique = true)
    private OptimizationJob job;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "route_json", nullable = false, columnDefinition = "jsonb")
    private JsonNode routeJson;

    @Column(nullable = false)
    private boolean feasible;

    @Column(name = "distance_m")
    private Double distanceM;

    @Column(name = "time_s")
    private Double timeS;

    @Column
    private Double congestion;

    @Column
    private Double objective;

    @Column(name = "runtime_ms")
    private Long runtimeMs;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public OptimizationJob getJob() { return job; }
    public void setJob(OptimizationJob job) { this.job = job; }

    public JsonNode getRouteJson() { return routeJson; }
    public void setRouteJson(JsonNode routeJson) { this.routeJson = routeJson; }

    public boolean isFeasible() { return feasible; }
    public void setFeasible(boolean feasible) { this.feasible = feasible; }

    public Double getDistanceM() { return distanceM; }
    public void setDistanceM(Double distanceM) { this.distanceM = distanceM; }

    public Double getTimeS() { return timeS; }
    public void setTimeS(Double timeS) { this.timeS = timeS; }

    public Double getCongestion() { return congestion; }
    public void setCongestion(Double congestion) { this.congestion = congestion; }

    public Double getObjective() { return objective; }
    public void setObjective(Double objective) { this.objective = objective; }

    public Long getRuntimeMs() { return runtimeMs; }
    public void setRuntimeMs(Long runtimeMs) { this.runtimeMs = runtimeMs; }
}
