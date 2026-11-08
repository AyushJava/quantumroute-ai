"""A* shortest-path algorithm over the optimizer's road graph.

Uses the edge ``cost`` attribute as the path cost (g-score) and never
traverses edges marked ``closed=True``. Reopening is supported: a node may be
re-expanded when a cheaper path to it is discovered, which keeps the result
optimal for any *admissible* heuristic (one that never overestimates the
remaining cost).

Heuristic
---------
``heuristic=None`` selects the zero heuristic, making A* equivalent to
Dijkstra and always optimal. A caller may pass ``heuristic(node, target)``
returning an estimated remaining cost. The estimate must be finite,
non-negative, and exactly ``0`` for the target node; admissibility (never
overestimating) is the caller's responsibility — an overestimating
heuristic can return a suboptimal (but still valid) path. Geographic
coordinates are deliberately NOT used automatically because scalar ``cost``
units are arbitrary in Phase 1, so no distance-based bound can be guaranteed.

Determinism: the priority queue is ordered by ``(f, g, node_id)``, so
equal-priority entries resolve identically on every run for string node IDs.

Precondition: all edge weights must be finite and non-negative (same rule as
the Dijkstra implementation); violations raise ``ValueError``.
"""

from __future__ import annotations

import heapq
import math
from collections.abc import Callable

import networkx as nx

from app.algorithms.base import PathResult, UnknownNodeError

_ALGORITHM = "astar"


def _validate_weights(graph: nx.Graph) -> None:
    """Enforce the non-negative finite weight precondition (same as Dijkstra)."""
    for u, v, data in graph.edges(data=True):
        cost = data.get("cost")
        if cost is None or not isinstance(cost, (int, float)) or not math.isfinite(cost):
            raise ValueError(f"edge {u!r} -> {v!r} has missing or non-finite cost {cost!r}")
        if cost < 0:
            raise ValueError(f"edge {u!r} -> {v!r} has negative cost {cost}")


def _eval_heuristic(
    heuristic: Callable[[str, str], float],
    node: str,
    target: str,
    cache: dict[str, float],
) -> float:
    """Return a validated heuristic value for ``node``, caching per node."""
    if node not in cache:
        h = heuristic(node, target)
        if not isinstance(h, (int, float)) or not math.isfinite(h):
            raise ValueError(f"heuristic returned non-finite value {h!r} for node {node!r}")
        if h < 0:
            raise ValueError(f"heuristic returned negative value {h} for node {node!r}")
        cache[node] = float(h)
    return cache[node]


def find_shortest_path(
    graph: nx.Graph,
    source: str,
    target: str,
    heuristic: Callable[[str, str], float] | None = None,
) -> PathResult:
    """Return the lowest-cost path from ``source`` to ``target`` using A*.

    Parameters
    ----------
    graph:
        A ``networkx.Graph`` or ``networkx.DiGraph`` as produced by
        ``app.graph.loader.build_graph``. Not mutated.
    source, target:
        Node IDs; both must exist or ``UnknownNodeError`` is raised.
    heuristic:
        Optional ``heuristic(node, target) -> float`` estimating the
        remaining cost. Must return ``0`` for ``(target, target)``, be
        finite and non-negative, and be admissible (never overestimate)
        for an optimal guarantee. ``None`` means the zero heuristic
        (Dijkstra behaviour, always optimal).

    Returns
    -------
    PathResult
        ``found=True`` with ``path``/``total_cost`` when a route exists
        (``source == target`` yields ``[source]`` at cost ``0.0``);
        ``found=False`` with an empty path when unreachable.

    Raises
    ------
    UnknownNodeError
        If ``source`` or ``target`` is absent from ``graph``.
    ValueError
        On missing/non-finite/negative edge costs, invalid heuristic
        outputs, or a heuristic that does not return ``0`` for the
        target node.
    """
    if source not in graph:
        raise UnknownNodeError(f"source node {source!r} is not in the graph")
    if target not in graph:
        raise UnknownNodeError(f"target node {target!r} is not in the graph")

    _validate_weights(graph)

    if source == target:
        return PathResult(path=[source], total_cost=0.0, found=True, algorithm=_ALGORITHM)

    h = heuristic if heuristic is not None else lambda _node, _target: 0.0
    hcache: dict[str, float] = {}

    # The heuristic must estimate zero remaining cost at the target;
    # a positive value would inflate the target's f-score and invalidate
    # the admissibility guarantee.
    if _eval_heuristic(h, target, target, hcache) != 0.0:
        raise ValueError(
            f"heuristic must return 0 for the target node, got "
            f"{hcache[target]} for {target!r}"
        )

    # g[node] = best known cost from source; parent tracks the best path.
    g_score: dict[str, float] = {source: 0.0}
    parent: dict[str, str] = {}
    # Heap entries are (f, g, node_id); f = g + h, and node_id breaks ties so
    # equal-priority ordering is deterministic for string node IDs.
    heap: list[tuple[float, float, str]] = [
        (_eval_heuristic(h, source, target, hcache), 0.0, source)
    ]

    while heap:
        _f, g, u = heapq.heappop(heap)
        if g > g_score.get(u, math.inf):
            continue  # stale entry superseded by a cheaper path
        if u == target:
            break  # target selected for expansion: g_score[target] is optimal

        for v, data in graph.adj[u].items():
            if data.get("closed", False):
                continue
            ng = g + data["cost"]
            if ng < g_score.get(v, math.inf):
                g_score[v] = ng
                parent[v] = u
                hv = _eval_heuristic(h, v, target, hcache)
                heapq.heappush(heap, (ng + hv, ng, v))

    if target not in g_score:
        return PathResult(found=False, algorithm=_ALGORITHM)

    path = [target]
    while path[-1] != source:
        path.append(parent[path[-1]])
    path.reverse()

    return PathResult(
        path=path,
        total_cost=g_score[target],
        found=True,
        algorithm=_ALGORITHM,
    )
