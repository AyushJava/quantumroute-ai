-- Phase 4a: initial persistence schema for QuantumRoute AI.
-- UUID PKs, TIMESTAMPTZ UTC timestamps, JSONB payloads, CHECK constraints.

CREATE TABLE app_user (
    id            UUID PRIMARY KEY,
    email         VARCHAR(320) NOT NULL,
    password_hash VARCHAR(72)  NOT NULL,
    display_name  VARCHAR(120),
    role          VARCHAR(20)  NOT NULL DEFAULT 'USER'
                  CHECK (role IN ('USER', 'ADMIN')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Case-insensitive email uniqueness (service lowercases in 4b; this is the DB backstop)
CREATE UNIQUE INDEX uq_app_user_email_lower ON app_user (LOWER(email));

CREATE TABLE workspace (
    id         UUID PRIMARY KEY,
    owner_id   UUID         NOT NULL REFERENCES app_user(id),
    name       VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspace_owner ON workspace (owner_id);

CREATE TABLE scenario (
    id            UUID PRIMARY KEY,
    workspace_id  UUID         NOT NULL REFERENCES workspace(id),
    name          VARCHAR(120) NOT NULL,
    graph_version VARCHAR(80)  NOT NULL,
    graph_json    JSONB        NOT NULL,
    config_json   JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_scenario_workspace_name UNIQUE (workspace_id, name)
);
CREATE INDEX idx_scenario_workspace ON scenario (workspace_id);

CREATE TABLE optimization_job (
    id           UUID PRIMARY KEY,
    scenario_id  UUID         NOT NULL REFERENCES scenario(id),
    status       VARCHAR(20)  NOT NULL
                 CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT')),
    algorithm    VARCHAR(30)  NOT NULL
                 CHECK (algorithm IN ('DIJKSTRA', 'ASTAR', 'QPSO')),
    request_json JSONB        NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);
CREATE INDEX idx_job_scenario   ON optimization_job (scenario_id);
CREATE INDEX idx_job_status     ON optimization_job (status);
CREATE INDEX idx_job_created_at ON optimization_job (created_at);

CREATE TABLE optimization_result (
    id          UUID PRIMARY KEY,
    job_id      UUID NOT NULL UNIQUE REFERENCES optimization_job(id),
    route_json  JSONB NOT NULL,
    feasible    BOOLEAN NOT NULL,
    -- metrics are NULL for infeasible results; when present they must be
    -- finite and non-negative (Postgres treats NaN as > all values, so NaN
    -- and +/-Infinity need explicit rejection).
    distance_m  DOUBLE PRECISION
                CHECK (distance_m IS NULL OR (distance_m >= 0
                       AND distance_m <> 'NaN'::float8
                       AND distance_m <> 'Infinity'::float8
                       AND distance_m <> '-Infinity'::float8)),
    time_s      DOUBLE PRECISION
                CHECK (time_s IS NULL OR (time_s >= 0
                       AND time_s <> 'NaN'::float8
                       AND time_s <> 'Infinity'::float8
                       AND time_s <> '-Infinity'::float8)),
    congestion  DOUBLE PRECISION
                CHECK (congestion IS NULL OR (congestion >= 0
                       AND congestion <> 'NaN'::float8
                       AND congestion <> 'Infinity'::float8
                       AND congestion <> '-Infinity'::float8)),
    objective   DOUBLE PRECISION
                CHECK (objective IS NULL OR (objective >= 0
                       AND objective <> 'NaN'::float8
                       AND objective <> 'Infinity'::float8
                       AND objective <> '-Infinity'::float8)),
    runtime_ms  BIGINT
                CHECK (runtime_ms IS NULL OR runtime_ms >= 0)
);
-- No index on job_id: the UNIQUE constraint already provides one.
