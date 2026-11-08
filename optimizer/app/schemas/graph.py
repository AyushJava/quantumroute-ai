"""Graph JSON schema for QuantumRoute AI road networks.

A graph payload describes a weighted road network as G = (V, E):

- ``nodes``: intersections/endpoints. Each node has a unique string ``id``
  and optional geographic coordinates (``lat``, ``lon`` in decimal degrees,
  WGS84).
- ``edges``: directed road segments. Each edge has ``source`` and ``target``
  node IDs plus a single non-negative scalar ``cost`` used for routing.
- ``directed``: when true the graph is treated as a ``networkx.DiGraph``;
  when false as an undirected ``networkx.Graph`` (each edge still lists a
  canonical ``source``/``target`` orientation for reporting).

Units
-----
- ``cost`` is a dimensionless scalar in arbitrary consistent units for Phase 1.
  Phase 2 will derive it from ``length_m`` / ``speed_kmh`` / congestion and
  normalized time/distance/congestion components; the schema already permits
  those optional attributes to be carried on edges.
- Coordinates, when present, are decimal degrees (WGS84).

Validation rules (enforced by ``GraphPayload``)
----------------------------------------------
- Node IDs must be unique and non-empty.
- Every edge ``source``/``target`` must reference a declared node.
- ``cost`` must be finite and >= 0 (algorithms require non-negative weights).
- Self-loops (source == target) are rejected.
- Parallel edges between the same ordered node pair are rejected in v1; see
  ``GRAPH_SCHEMA.md`` for the rationale and the Phase 2 revisit condition.
- ``closed`` edges are retained in the graph but flagged; routing algorithms
  must exclude them (enforced in Phase 1 algorithm implementation).
"""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Node(BaseModel):
    """A graph node (road intersection or endpoint)."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, description="Unique node identifier")
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lon: float | None = Field(default=None, ge=-180.0, le=180.0)


class Edge(BaseModel):
    """A directed road segment with a scalar routing cost.

    Optional attributes (``length_m``, ``speed_kmh``, ``congestion``,
    ``closed``, ...) are permitted for forward compatibility with the Phase 2
    cost model; unknown extra attributes are preserved.
    """

    model_config = ConfigDict(extra="allow")

    source: str = Field(min_length=1)
    target: str = Field(min_length=1)
    cost: float = Field(ge=0.0, description="Non-negative scalar routing cost")
    closed: bool = Field(default=False, description="If true, edge is unavailable for routing")

    @field_validator("cost")
    @classmethod
    def _cost_must_be_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("edge cost must be finite")
        return v


class GraphPayload(BaseModel):
    """Top-level road-graph payload."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(default="unnamed", min_length=1)
    directed: bool = Field(
        default=True,
        description="True for a directed graph (DiGraph); false for undirected (Graph)",
    )
    nodes: list[Node] = Field(min_length=1)
    edges: list[Edge] = Field(default_factory=list)

    @field_validator("nodes")
    @classmethod
    def _unique_node_ids(cls, nodes: list[Node]) -> list[Node]:
        ids = [n.id for n in nodes]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate node ids are not allowed")
        return nodes

    @model_validator(mode="after")
    def _validate_edges(self) -> "GraphPayload":
        node_ids = {n.id for n in self.nodes}
        seen_pairs: set[tuple[str, str]] = set()
        for edge in self.edges:
            if edge.source == edge.target:
                raise ValueError(f"self-loop edge {edge.source!r} -> {edge.target!r} is not allowed")
            for endpoint in (edge.source, edge.target):
                if endpoint not in node_ids:
                    raise ValueError(f"edge references unknown node {endpoint!r}")
            key = (edge.source, edge.target)
            if not self.directed:
                key = (min(key), max(key))
            if key in seen_pairs:
                raise ValueError(
                    f"parallel edge between {edge.source!r} and {edge.target!r} is not supported"
                )
            seen_pairs.add(key)
        return self

    def edge_attributes(self, edge: Edge) -> dict[str, Any]:
        """Return edge attributes (minus source/target) for graph storage."""
        return {k: v for k, v in edge.model_dump().items() if k not in {"source", "target"}}
