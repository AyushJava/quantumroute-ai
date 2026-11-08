"""Dijkstra shortest-path algorithm over the optimizer's road graph.

Uses the edge ``cost`` attribute as the routing weight and never traverses
edges marked ``closed=True``. Deterministic: the priority queue is ordered by
``(distance, node_id)``, so equal-cost paths resolve identically on every run.

Precondition: all edge weights must be finite and non-negative. This is
validated up front; a violation raises ``ValueError``.
"""

from __future__ import annotations

import heapq
import math

import networkx as nx

from app.algorithms.base import PathResult, UnknownNodeError

_ALGORITHM = "dijkstra"


def _validate_weights(graph: nx.Graph) -> None:
    """Enforce Dijkstra's non-negative finite weight precondition."""
    for _u, _v, data in graph.edges(data=True):
        cost = data.get("cost")
        if cost is None or not isinstance(cost, (int, float)) or not math.isfinite(cost):
            raise ValueError(f"edge {_u!r} -> {_v!r} has missing or non-finite cost {cost!r}")
        if cost < 0:
            raise ValueError(f"edge {_u!r} -> {_v!r} has negative cost {cost}")


def find_shortest_path(graph: nx.Graph, source: str, target: str) -> PathResult:
    """Return the lowest-cost path from ``source`` to ``target``.

    Parameters
    ----------
    graph:
        A ``networkx.Graph`` or ``networkx.DiGraph`` as produced by
        ``app.graph.loader.build_graph``.
    source, target:
        Node IDs. Both must exist in ``graph``; otherwise
        ``UnknownNodeError`` is raised.

    Returns
    -------
    PathResult
        ``found=True`` with ``path`` and ``total_cost`` when a route exists
        (including the zero-edge ``source == target`` case). ``found=False``
        with an empty path when the target is unreachable.

    Raises
    ------
    UnknownNodeError
        If ``source`` or ``target`` is not a node in ``graph``.
    ValueError
        If any edge has a missing, non-finite or negative ``cost``.
    """
    if source not in graph:
        raise UnknownNodeError(f"source node {source!r} is not in the graph")
    if target not in graph:
        raise UnknownNodeError(f"target node {target!r} is not in the graph")

    _validate_weights(graph)

    if source == target:
        return PathResult(path=[source], total_cost=0.0, found=True, algorithm=_ALGORITHM)

    # dist[node] = best known cost; parent[node] = predecessor on best path.
    dist: dict[str, float] = {source: 0.0}
    parent: dict[str, str] = {}
    # Heap entries are (distance, node_id); node_id breaks distance ties so
    # the search order — and therefore the chosen equal-cost path — is fixed.
    heap: list[tuple[float, str]] = [(0.0, source)]
    settled: set[str] = set()

    while heap:
        d, u = heapq.heappop(heap)
        if u in settled:
            continue
        settled.add(u)
        if u == target:
            break

        for v, data in graph.adj[u].items():
            if data.get("closed", False):
                continue
            nd = d + data["cost"]
            if v not in dist or nd < dist[v]:
                dist[v] = nd
                parent[v] = u
                heapq.heappush(heap, (nd, v))

    if target not in dist:
        return PathResult(found=False, algorithm=_ALGORITHM)

    path = [target]
    while path[-1] != source:
        path.append(parent[path[-1]])
    path.reverse()

    return PathResult(
        path=path,
        total_cost=dist[target],
        found=True,
        algorithm=_ALGORITHM,
    )
