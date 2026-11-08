"""Tests for the Dijkstra shortest-path algorithm (Phase 1)."""

import json
from pathlib import Path

import networkx as nx
import pytest

from app.algorithms.base import PathResult, UnknownNodeError
from app.algorithms.dijkstra import find_shortest_path
from app.graph.loader import build_graph
from app.schemas.graph import GraphPayload

FIXTURES = Path(__file__).parent / "fixtures"


def make_graph(nodes, edges, directed=True):
    """Build a NetworkX graph from raw node/edge dicts."""
    payload = GraphPayload.model_validate(
        {"name": "t", "directed": directed, "nodes": nodes, "edges": edges}
    )
    return build_graph(payload)


def chain_graph():
    return make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )


# --- Basic correctness ---------------------------------------------------


def test_two_node_graph():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 4.5}],
    )
    r = find_shortest_path(g, "A", "B")
    assert r == PathResult(path=["A", "B"], total_cost=4.5, found=True, algorithm="dijkstra")


def test_shortest_path_selected_between_two_routes():
    # A->B->D costs 2.0; A->C->D costs 6.0
    data = json.loads((FIXTURES / "two_path_graph.json").read_text())
    g = build_graph(GraphPayload.model_validate(data))
    r = find_shortest_path(g, "A", "D")
    assert r.found
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)


def test_higher_cost_route_not_chosen():
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 10.0},
        ],
    )
    r = find_shortest_path(g, "A", "D")
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)


def test_multiple_possible_routes_picks_minimum():
    g = chain_graph()
    # add a shortcut A->D direct at cost 10 vs chain cost 3
    g.add_edge("A", "D", cost=10.0, closed=False)
    r = find_shortest_path(g, "A", "D")
    assert r.path == ["A", "B", "C", "D"]
    assert r.total_cost == pytest.approx(3.0)


def test_zero_cost_edges():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}, {"id": "C"}],
        [
            {"source": "A", "target": "B", "cost": 0.0},
            {"source": "B", "target": "C", "cost": 0.0},
        ],
    )
    r = find_shortest_path(g, "A", "C")
    assert r.found
    assert r.path == ["A", "B", "C"]
    assert r.total_cost == 0.0


# --- Edge cases ----------------------------------------------------------


def test_closed_edge_excluded():
    g = make_graph(
        [{"id": n} for n in "ABC"],
        [
            {"source": "A", "target": "B", "cost": 0.1, "closed": True},
            {"source": "A", "target": "C", "cost": 5.0},
            {"source": "C", "target": "B", "cost": 1.0},
        ],
    )
    r = find_shortest_path(g, "A", "B")
    assert r.path == ["A", "C", "B"]
    assert r.total_cost == pytest.approx(6.0)


def test_disconnected_graph_returns_no_route():
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    r = find_shortest_path(g, "A", "D")
    assert r.found is False
    assert r.path == []
    assert r.total_cost == 0.0


def test_source_equals_target_zero_cost():
    g = chain_graph()
    r = find_shortest_path(g, "B", "B")
    assert r == PathResult(path=["B"], total_cost=0.0, found=True, algorithm="dijkstra")


def test_missing_source_node_raises():
    with pytest.raises(UnknownNodeError):
        find_shortest_path(chain_graph(), "X", "D")


def test_missing_target_node_raises():
    with pytest.raises(UnknownNodeError):
        find_shortest_path(chain_graph(), "A", "X")


def test_equal_cost_paths_deterministic():
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    results = [find_shortest_path(g, "A", "D") for _ in range(10)]
    assert all(r == results[0] for r in results)
    assert results[0].found
    assert results[0].total_cost == pytest.approx(2.0)
    # tie-break is by node id: B-path discovered before C-path
    assert results[0].path == ["A", "B", "D"]


# --- Directed / undirected -----------------------------------------------


def test_directed_graph_respects_direction():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 1.0}],
        directed=True,
    )
    assert find_shortest_path(g, "A", "B").found
    r = find_shortest_path(g, "B", "A")
    assert r.found is False


def test_undirected_graph_supports_reverse_traversal():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 2.0}],
        directed=False,
    )
    r = find_shortest_path(g, "B", "A")
    assert r.found
    assert r.total_cost == pytest.approx(2.0)


# --- Preconditions --------------------------------------------------------


def test_negative_edge_weight_rejected():
    # schema validation rejects negative costs, so build a malformed graph
    # directly to exercise the algorithm's precondition check
    g = nx.DiGraph()
    g.add_edge("A", "B", cost=-1.0, closed=False)
    g.add_node("A")
    g.add_node("B")
    with pytest.raises(ValueError, match="negative cost"):
        find_shortest_path(g, "A", "B")


def test_missing_cost_attribute_rejected():
    g = nx.DiGraph()
    g.add_edge("A", "B", closed=False)
    with pytest.raises(ValueError, match="cost"):
        find_shortest_path(g, "A", "B")
