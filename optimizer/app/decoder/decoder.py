"""Random-key discrete route decoder (Phase 3, blueprint §5.5).

Encoding
--------
A candidate solution is a vector of continuous keys, one per graph node
(``keys[node]``). Node order is ``sorted(graph.nodes)`` so key vectors are
deterministic. The decoder performs a greedy walk from ``source`` to
``target``: at each step it moves to the eligible outgoing neighbour with the
smallest key, breaking ties by node ID. Only the *relative ordering* of keys
matters — the encoding expresses a global node-priority ranking and cannot
represent edge-specific or context-dependent preferences (documented
limitation).

Rules
-----
- Only valid outgoing edges are considered (respects directed/undirected
  graphs via ``graph.adj``).
- ``closed=True`` edges and already-visited nodes are skipped.
- The walk stops at ``target``, when no eligible neighbour exists
  (``repair_reason="no_candidates"``), or when ``max_steps`` is exhausted
  (``repair_reason="max_steps"``).

Repair (documented strategy)
----------------------------
On dead-end or step-budget exhaustion the greedy prefix is DISCARDED and the
existing Dijkstra implementation performs a full-route replacement on the
same graph. ``used_repair``, ``dead_end_at`` and ``repair_reason`` record
that this happened so repair frequency can be reported separately and does
not inflate apparent decoder/QPSO performance. If Dijkstra also finds no
route, the result is explicitly infeasible (empty path).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import networkx as nx

from app.algorithms.base import UnknownNodeError
from app.algorithms.dijkstra import find_shortest_path

_REPAIR_NO_CANDIDATES = "no_candidates"
_REPAIR_MAX_STEPS = "max_steps"


@dataclass(frozen=True)
class DecodeResult:
    """Outcome of decoding a key vector into a candidate route.

    Attributes
    ----------
    path:
        Ordered node IDs of the candidate route. Empty when infeasible.
        For repaired results this is the Dijkstra path, not the greedy one.
    feasible:
        True when a route to ``target`` exists (decoded or repaired).
    used_repair:
        True when greedy decoding dead-ended or exhausted ``max_steps`` and
        the Dijkstra fallback produced the path.
    dead_end_at:
        Node where greedy decoding stopped when repair was triggered.
    repair_reason:
        ``"no_candidates"`` or ``"max_steps"`` when ``used_repair`` is True;
        ``None`` otherwise.
    """

    path: list[str]
    feasible: bool
    used_repair: bool = False
    dead_end_at: str | None = None
    repair_reason: str | None = None


def _validate_keys(keys: Mapping[str, float], graph: nx.Graph) -> None:
    """Ensure ``keys`` is a Mapping covering exactly the graph's nodes.

    Every node must have a finite numeric key; booleans, non-numeric values,
    missing nodes and unknown extra keys are all rejected.
    """
    if not isinstance(keys, Mapping):
        raise ValueError(f"keys must be a mapping of node ID -> key, got {type(keys).__name__}")

    key_nodes = set(keys)
    graph_nodes = set(graph.nodes)
    missing = sorted(graph_nodes - key_nodes)
    if missing:
        raise ValueError(f"keys missing for nodes: {missing}")
    extra = sorted(key_nodes - graph_nodes)
    if extra:
        raise ValueError(f"keys contain unknown nodes not in graph: {extra}")

    for node, key in keys.items():
        if isinstance(key, bool) or not isinstance(key, (int, float)):
            raise ValueError(f"key for node {node!r} must be a finite number, got {key!r}")
        try:
            finite = math.isfinite(key)
        except OverflowError:
            # e.g. an extremely large int that cannot convert to float
            finite = False
        if not finite:
            raise ValueError(f"key for node {node!r} must be a finite number, got {key!r}")


def decode(
    keys: Mapping[str, float],
    graph: nx.Graph,
    source: str,
    target: str,
    max_steps: int | None = None,
) -> DecodeResult:
    """Decode a random-key vector into a route from ``source`` to ``target``.

    Parameters
    ----------
    keys:
        Mapping of node ID -> continuous priority key. Must cover exactly
        the nodes in ``graph`` (no missing, no extras); values must be
        finite numbers (booleans rejected).
    graph:
        ``networkx.Graph`` or ``DiGraph`` cost snapshot (closed edges are
        skipped; edge ``cost`` is only needed if Dijkstra repair runs).
    source, target:
        Node IDs; both must exist in ``graph``.
    max_steps:
        Expansion budget; defaults to ``4 * |V|``. Must be a positive int.

    Returns
    -------
    DecodeResult
        ``feasible=True`` with a valid path when a route exists (possibly
        via Dijkstra repair); ``feasible=False`` with an empty path when
        neither greedy decoding nor Dijkstra can reach ``target``.

    Raises
    ------
    UnknownNodeError
        If ``source`` or ``target`` is absent from ``graph``.
    ValueError
        On missing/invalid keys, invalid ``max_steps``, or — during repair —
        invalid edge weights (same precondition as Dijkstra).
    """
    if source not in graph:
        raise UnknownNodeError(f"source node {source!r} is not in the graph")
    if target not in graph:
        raise UnknownNodeError(f"target node {target!r} is not in the graph")
    _validate_keys(keys, graph)

    if max_steps is None:
        max_steps = 4 * graph.number_of_nodes()
    if isinstance(max_steps, bool) or not isinstance(max_steps, int) or max_steps <= 0:
        raise ValueError(f"max_steps must be a positive integer, got {max_steps!r}")

    if source == target:
        return DecodeResult(path=[source], feasible=True)

    visited = {source}
    path = [source]
    current = source
    steps = 0
    repair_reason: str | None = None

    while current != target:
        if steps >= max_steps:
            repair_reason = _REPAIR_MAX_STEPS
            break
        candidates = [
            v for v, data in graph.adj[current].items()
            if not data.get("closed", False) and v not in visited
        ]
        if not candidates:
            repair_reason = _REPAIR_NO_CANDIDATES
            break
        nxt = min(candidates, key=lambda v: (keys[v], v))
        path.append(nxt)
        visited.add(nxt)
        current = nxt
        steps += 1

    if current == target:
        return DecodeResult(path=path, feasible=True)

    # Dead end or budget exhausted: full-route Dijkstra replacement.
    repaired = find_shortest_path(graph, source, target)
    return DecodeResult(
        path=repaired.path if repaired.found else [],
        feasible=repaired.found,
        used_repair=True,
        dead_end_at=current,
        repair_reason=repair_reason,
    )
