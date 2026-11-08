"""Phase 2 cost model: edge cost components, normalization and snapshots.

Edge attributes (see ``app.graph.GRAPH_SCHEMA`` for the base schema):

- ``length_m``  — edge length in metres (>= 0, finite; required)
- ``speed_kmh`` — assumed speed in km/h (> 0, finite; required)
- ``congestion``— severity factor in [0.0, 1.0] (optional, default 0.0)

Per-edge components
-------------------
``time_s``      = ``length_m`` / (``speed_kmh`` / 3.6)   [seconds]
``distance_m`` = ``length_m``                            [metres]
``congestion`` = raw severity value                      [0..1]

Objective
---------
Each component is min-max normalized **over all edges of the graph snapshot**
(the same population for every algorithm in a comparison, per blueprint
§5.7):

    norm(x) = (x - min) / (max - min)     if max > min
            = 0.0                        if max == min   (constant column)

The scalar edge cost written into a snapshot is

    cost(e) = alpha * norm_time(e) + beta * norm_distance(e)
              + gamma * norm_congestion(e)

where ``alpha/beta/gamma`` come from ``app.schemas.cost.ObjectiveWeights``.
Weights are relative importances and need not sum to 1.

Snapshots
---------
``build_cost_snapshot`` returns a **copy** of the graph with computed
``cost`` attributes; the input graph is never mutated. The snapshot stores
the weights and normalization ranges under ``graph.graph["cost_snapshot"]``
so ``evaluate_path`` can report a consistent objective breakdown. Closed
edges are preserved and costed like any other edge; routing algorithms
continue to exclude them.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import networkx as nx

from app.schemas.cost import ObjectiveWeights

_SNAPSHOT_KEY = "cost_snapshot"
_MPS_PER_KMH = 1.0 / 3.6


@dataclass(frozen=True)
class EdgeComponents:
    """Raw (unnormalized) cost components of a single edge."""

    time_s: float
    distance_m: float
    congestion: float


@dataclass(frozen=True)
class RouteMetrics:
    """Aggregate metrics for a route under the cost-model objective.

    ``congestion`` is the sum of per-edge severity values along the path
    (documented aggregation; range is [0, path_length]). ``objective_value``
    is ``Z(P)`` — the sum of snapshot edge ``cost`` values.
    """

    distance_m: float
    time_s: float
    congestion: float
    objective_value: float


def _check_finite(name: str, value: float) -> float:
    # bool is a subclass of int in Python; reject it explicitly so True/False
    # are never accepted as distances, speeds or congestion values.
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number, got boolean {value!r}")
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    return float(value)


def travel_time_seconds(length_m: float, speed_kmh: float) -> float:
    """Estimated travel time ``t(e) = d(e) / v(e)`` in seconds.

    ``length_m`` must be finite and >= 0 (zero-length edges yield 0 s).
    ``speed_kmh`` must be finite and > 0.
    """
    d = _check_finite("length_m", length_m)
    v = _check_finite("speed_kmh", speed_kmh)
    if d < 0:
        raise ValueError(f"length_m must be >= 0, got {d}")
    if v <= 0:
        raise ValueError(f"speed_kmh must be > 0, got {v}")
    result = d / (v * _MPS_PER_KMH)
    if not math.isfinite(result):
        raise ValueError(
            f"travel time computation overflowed to a non-finite value "
            f"(length_m={d}, speed_kmh={v})"
        )
    return result


def edge_components(attrs: Mapping[str, object]) -> EdgeComponents:
    """Extract and validate the raw cost components of one edge.

    Requires ``length_m`` and ``speed_kmh``; ``congestion`` defaults to 0.0
    and must lie in [0.0, 1.0].
    """
    if "length_m" not in attrs:
        raise ValueError("edge is missing required attribute 'length_m'")
    if "speed_kmh" not in attrs:
        raise ValueError("edge is missing required attribute 'speed_kmh'")

    length_m = _check_finite("length_m", attrs["length_m"])  # type: ignore[arg-type]
    speed_kmh = _check_finite("speed_kmh", attrs["speed_kmh"])  # type: ignore[arg-type]
    if length_m < 0:
        raise ValueError(f"length_m must be >= 0, got {length_m}")
    if speed_kmh <= 0:
        raise ValueError(f"speed_kmh must be > 0, got {speed_kmh}")

    congestion = attrs.get("congestion", 0.0)
    congestion = _check_finite("congestion", congestion)  # type: ignore[arg-type]
    if not 0.0 <= congestion <= 1.0:
        raise ValueError(f"congestion must be in [0.0, 1.0], got {congestion}")

    return EdgeComponents(
        time_s=travel_time_seconds(length_m, speed_kmh),
        distance_m=length_m,
        congestion=congestion,
    )


def _norm(value: float, lo: float, hi: float) -> float:
    """Min-max normalize ``value`` into [0, 1]; constant columns map to 0."""
    if hi <= lo:
        return 0.0
    return (value - lo) / (hi - lo)


def _component_ranges(components: Sequence[EdgeComponents]) -> dict[str, tuple[float, float]]:
    """Min/max range of each component over the snapshot's edge population."""
    if not components:
        return {}
    return {
        "time_s": (min(c.time_s for c in components), max(c.time_s for c in components)),
        "distance_m": (
            min(c.distance_m for c in components),
            max(c.distance_m for c in components),
        ),
        "congestion": (
            min(c.congestion for c in components),
            max(c.congestion for c in components),
        ),
    }


def _edge_cost(components: EdgeComponents, ranges: dict[str, tuple[float, float]],
               weights: ObjectiveWeights) -> float:
    t_lo, t_hi = ranges["time_s"]
    d_lo, d_hi = ranges["distance_m"]
    c_lo, c_hi = ranges["congestion"]
    cost = (
        weights.alpha * _norm(components.time_s, t_lo, t_hi)
        + weights.beta * _norm(components.distance_m, d_lo, d_hi)
        + weights.gamma * _norm(components.congestion, c_lo, c_hi)
    )
    if not math.isfinite(cost):
        raise ValueError(f"computed edge cost is non-finite: {cost!r}")
    return cost


def build_cost_snapshot(
    graph: nx.Graph, weights: ObjectiveWeights | None = None
) -> nx.Graph:
    """Return a copy of ``graph`` with computed scalar ``cost`` per edge.

    The input graph is not mutated. Normalization ranges are computed over
    ALL edges of the snapshot (including closed edges) so every algorithm
    sees identical component scaling. Edges of the snapshot keep their raw
    attributes (``length_m``, ``speed_kmh``, ``congestion``, ``closed``, ...)
    plus the computed ``cost``. Snapshot metadata is stored under
    ``graph.graph["cost_snapshot"]`` for ``evaluate_path``.
    """
    weights = weights or ObjectiveWeights()

    # edge list order is deterministic for a given graph construction
    edge_items = [(u, v, dict(data)) for u, v, data in graph.edges(data=True)]
    components = [edge_components(data) for _u, _v, data in edge_items]
    ranges = _component_ranges(components)

    snapshot = graph.copy()
    snapshot.graph[_SNAPSHOT_KEY] = {
        "weights": weights.model_dump(),
        "ranges": {k: list(v) for k, v in ranges.items()},
    }

    for (u, v, _data), comp in zip(edge_items, components):
        snapshot.edges[u, v]["cost"] = _edge_cost(comp, ranges, weights)

    return snapshot


def _snapshot_params(graph: nx.Graph) -> tuple[ObjectiveWeights, dict[str, tuple[float, float]]]:
    meta = graph.graph.get(_SNAPSHOT_KEY)
    if meta is None:
        raise ValueError(
            "graph is not a cost snapshot; call build_cost_snapshot() first"
        )
    weights = ObjectiveWeights.model_validate(meta["weights"])
    ranges = {k: (float(v[0]), float(v[1])) for k, v in meta["ranges"].items()}
    return weights, ranges


def evaluate_path(graph: nx.Graph, path: Sequence[str]) -> RouteMetrics:
    """Aggregate route metrics for ``path`` on a cost snapshot.

    ``graph`` must be produced by ``build_cost_snapshot``. ``objective_value``
    is the sum of snapshot edge ``cost`` values (``Z(P)``); ``distance_m``,
    ``time_s`` and ``congestion`` are sums of the raw edge components.
    A single-node path yields all-zero metrics. Every node in ``path`` must
    exist in ``graph``; an empty path raises ``ValueError``.

    This function only aggregates metrics for the supplied path — it does
    NOT independently enforce routing constraints. A manually supplied path
    containing a ``closed`` edge can still be evaluated; Dijkstra and A*
    remain responsible for excluding closed edges during route finding.
    """
    _weights, _ranges = _snapshot_params(graph)

    if len(path) == 0:
        raise ValueError("path must contain at least one node")

    for node in path:
        if node not in graph:
            raise ValueError(f"path node {node!r} is not in the graph")

    distance_m = time_s = congestion = objective_value = 0.0
    for u, v in zip(path, path[1:]):
        data = graph.get_edge_data(u, v)
        if data is None:
            raise ValueError(f"path uses non-existent edge {u!r} -> {v!r}")
        comp = edge_components(data)
        distance_m += comp.distance_m
        time_s += comp.time_s
        congestion += comp.congestion
        objective_value += float(data["cost"])

    return RouteMetrics(
        distance_m=distance_m,
        time_s=time_s,
        congestion=congestion,
        objective_value=objective_value,
    )
