"""Shared result types for routing algorithms."""

from __future__ import annotations

from dataclasses import dataclass, field


class UnknownNodeError(ValueError):
    """Raised when a requested source or target node is absent from the graph."""


@dataclass(frozen=True)
class PathResult:
    """Outcome of a shortest-path query.

    Attributes
    ----------
    path:
        Ordered list of node IDs from source to target. Empty when
        ``found`` is False.
    total_cost:
        Sum of edge ``cost`` values along ``path``. ``0.0`` for a
        zero-edge route (source == target) or when ``found`` is False.
    found:
        True when a feasible route exists; False for unreachable targets.
    algorithm:
        Name of the algorithm that produced the result.
    """

    path: list[str] = field(default_factory=list)
    total_cost: float = 0.0
    found: bool = False
    algorithm: str = ""
