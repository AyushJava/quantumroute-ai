"""Request/response schemas for POST /api/v1/optimize."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.cost import ObjectiveWeights
from app.schemas.graph import GraphPayload
from app.schemas.qpso import QpsoConfig


class QpsoParameters(BaseModel):
    """CamelCase API view of QpsoConfig; mapped to snake_case internally."""

    model_config = ConfigDict(extra="forbid")

    particles: int | None = Field(default=None, gt=0)
    maxIterations: int | None = Field(default=None, gt=0)
    seed: int | None = Field(default=None, ge=0)
    thetaStart: float | None = Field(default=None, gt=0.0)
    thetaEnd: float | None = Field(default=None, gt=0.0)
    maxSteps: int | None = Field(default=None, gt=0)
    timeBudgetS: float | None = Field(default=None, gt=0.0)
    stagnationIters: int | None = Field(default=None, gt=0)


class OptimizeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    graph: GraphPayload
    sourceNodeId: str = Field(min_length=1)
    targetNodeId: str = Field(min_length=1)
    algorithm: Literal["DIJKSTRA", "ASTAR", "QPSO"]
    objectiveWeights: ObjectiveWeights = Field(default_factory=ObjectiveWeights)
    parameters: dict[str, Any] = Field(default_factory=dict)


class RouteOut(BaseModel):
    nodeIds: list[str]
    edgeIds: list[str]
    geometry: dict[str, Any] | None = None


class MetricsOut(BaseModel):
    distanceMeters: float
    estimatedTravelTimeSeconds: float
    congestionPenalty: float
    objectiveValue: float


class QpsoMetadataOut(BaseModel):
    seed: int
    iterationsRun: int
    usedRepair: bool
    repairRate: float
    feasibilityRate: float
    convergenceTrace: list[float]
    parameters: dict[str, Any]


class OptimizeResponse(BaseModel):
    status: Literal["COMPLETED"]
    algorithm: str
    feasible: bool
    route: RouteOut
    metrics: MetricsOut | None = None
    runtimeMs: int
    algorithmMetadata: QpsoMetadataOut | None = None
