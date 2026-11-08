"""Tests for the graph schema and NetworkX loader (Phase 1)."""

import json
import math
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.graph.loader import build_graph
from app.schemas.graph import GraphPayload

FIXTURES = Path(__file__).parent / "fixtures"


def payload(**overrides) -> dict:
    base = {
        "name": "test",
        "directed": True,
        "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}],
        "edges": [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "C", "cost": 2.0},
        ],
    }
    base.update(overrides)
    return base


# --- Schema validation -------------------------------------------------


def test_valid_sample_graph_loads():
    data = json.loads((FIXTURES / "two_path_graph.json").read_text())
    p = GraphPayload.model_validate(data)
    assert len(p.nodes) == 4
    assert len(p.edges) == 5


def test_duplicate_node_ids_rejected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(nodes=[{"id": "A"}, {"id": "A"}, {"id": "B"}])
        )


def test_unknown_node_reference_rejected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(edges=[{"source": "A", "target": "Z", "cost": 1.0}])
        )


def test_negative_cost_rejected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(edges=[{"source": "A", "target": "B", "cost": -0.1}])
        )


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_non_finite_cost_rejected(bad):
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(edges=[{"source": "A", "target": "B", "cost": bad}])
        )


def test_self_loop_rejected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(edges=[{"source": "A", "target": "A", "cost": 1.0}])
        )


def test_parallel_edges_rejected_directed():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(
                edges=[
                    {"source": "A", "target": "B", "cost": 1.0},
                    {"source": "A", "target": "B", "cost": 2.0},
                ]
            )
        )


def test_parallel_edges_rejected_undirected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(
            payload(
                directed=False,
                edges=[
                    {"source": "A", "target": "B", "cost": 1.0},
                    {"source": "B", "target": "A", "cost": 2.0},
                ],
            )
        )


def test_empty_node_list_rejected():
    with pytest.raises(ValidationError):
        GraphPayload.model_validate(payload(nodes=[], edges=[]))


# --- Loader ------------------------------------------------------------


def test_builds_digraph_when_directed():
    g = build_graph(GraphPayload.model_validate(payload(directed=True)))
    assert g.is_directed()
    assert set(g.nodes) == {"A", "B", "C"}
    assert g.has_edge("A", "B")
    assert not g.has_edge("B", "A")


def test_builds_undirected_graph_when_not_directed():
    g = build_graph(GraphPayload.model_validate(payload(directed=False)))
    assert not g.is_directed()
    assert g.has_edge("A", "B")
    # undirected: traversal is possible in both directions
    assert g.has_edge("B", "A")


def test_node_coordinates_preserved():
    p = GraphPayload.model_validate(
        payload(
            nodes=[{"id": "A", "lat": 28.6, "lon": 77.2}, {"id": "B"}],
            edges=[{"source": "A", "target": "B", "cost": 1.0}],
        )
    )
    g = build_graph(p)
    assert g.nodes["A"]["lat"] == 28.6
    assert g.nodes["A"]["lon"] == 77.2
    assert "lat" not in g.nodes["B"]


def test_edge_attributes_preserved():
    p = GraphPayload.model_validate(
        payload(
            edges=[
                {
                    "source": "A",
                    "target": "B",
                    "cost": 3.5,
                    "closed": False,
                    "length_m": 120.0,
                    "speed_kmh": 50.0,
                }
            ]
        )
    )
    g = build_graph(p)
    attrs = g.edges["A", "B"]
    assert attrs["cost"] == 3.5
    assert attrs["closed"] is False
    assert attrs["length_m"] == 120.0
    assert attrs["speed_kmh"] == 50.0


def test_closed_edges_retained_in_graph():
    p = GraphPayload.model_validate(
        payload(
            edges=[
                {"source": "A", "target": "B", "cost": 1.0, "closed": True},
                {"source": "B", "target": "C", "cost": 2.0},
            ]
        )
    )
    g = build_graph(p)
    assert g.has_edge("A", "B")
    assert g.edges["A", "B"]["closed"] is True
    assert g.number_of_edges() == 2
