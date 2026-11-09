"""QPSO configuration schema (Phase 3).

Validated parameters for the quantum-behaved particle swarm optimizer.
``extra="forbid"`` rejects unexpected fields so typos fail loudly.
"""

from __future__ import annotations

import math

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class QpsoConfig(BaseModel):
    """Configuration for ``run_qpso``.

    Attributes
    ----------
    particles:
        Swarm size N.
    max_iterations:
        Fixed iteration budget T. With no ``time_budget_s`` this fully
        determines the run length -> reproducible results.
    seed:
        Required seed for ``numpy.random.default_rng`` (PCG64). Sole random
        source; identical inputs + seed + budget give identical results.
    theta_start / theta_end:
        Contraction-expansion coefficient schedule bounds. Theta decreases
        linearly: ``theta(t) = theta_start + (theta_end - theta_start) * t / T``.
        Defaults 1.0 -> 0.5 (canonical Sun et al. exploration->exploitation).
    max_steps:
        Per-decode expansion budget; ``None`` -> ``4 * |V|``.
    time_budget_s:
        Optional wall-clock budget; termination then depends on hardware
        load, so exact reproducibility is NOT guaranteed when set.
    stagnation_iters:
        Optional early stop after this many iterations without gbest
        improvement; ``None`` disables.
    """

    model_config = ConfigDict(extra="forbid")

    particles: int = Field(default=30, gt=0)
    max_iterations: int = Field(default=150, gt=0)
    seed: int = Field(ge=0)
    theta_start: float = Field(default=1.0, gt=0.0)
    theta_end: float = Field(default=0.5, gt=0.0)
    max_steps: int | None = Field(default=None, gt=0)
    time_budget_s: float | None = Field(default=None, gt=0.0)
    stagnation_iters: int | None = Field(default=None, gt=0)

    @field_validator("*", mode="before")
    @classmethod
    def _reject_bool(cls, v):
        # bool is a subclass of int; reject it before lax coercion turns
        # True/False into 1/0 for any numeric field.
        if isinstance(v, bool):
            raise ValueError("boolean values are not accepted")
        return v

    @field_validator("theta_start", "theta_end", "time_budget_s")
    @classmethod
    def _finite(cls, v: float | None) -> float | None:
        if v is not None and not math.isfinite(v):
            raise ValueError("value must be finite")
        return v

    @model_validator(mode="after")
    def _theta_ordered(self) -> "QpsoConfig":
        if self.theta_end > self.theta_start:
            raise ValueError("theta_end must be <= theta_start")
        return self
