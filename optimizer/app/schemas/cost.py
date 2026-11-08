"""Objective weight configuration for the Phase 2 cost model.

Weights are non-negative, finite, and must not all be zero. They are NOT
required to sum to 1 — the blueprint treats them as relative importances of
the normalized time, distance and congestion components.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ObjectiveWeights(BaseModel):
    """Weights for the normalized multi-objective edge cost.

    ``alpha`` weights normalized travel time, ``beta`` normalized distance,
    ``gamma`` normalized congestion. Defaults match the blueprint's API
    example (0.60 / 0.25 / 0.15).
    """

    model_config = ConfigDict(extra="forbid")

    alpha: float = Field(default=0.60, ge=0.0)
    beta: float = Field(default=0.25, ge=0.0)
    gamma: float = Field(default=0.15, ge=0.0)

    @field_validator("alpha", "beta", "gamma")
    @classmethod
    def _weights_must_be_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("objective weights must be finite")
        return v

    @model_validator(mode="after")
    def _not_all_zero(self) -> "ObjectiveWeights":
        if self.alpha == 0.0 and self.beta == 0.0 and self.gamma == 0.0:
            raise ValueError("objective weights must not all be zero")
        return self
