"""Tests for the A* shortest-path algorithm (Phase 1)."""

import json
import math
from pathlib import Path

import networkx as nx
import pytest

from app.algorithms.astar import find_shortest_path
from app.algorithms.base import PathResult, UnknownNodeError
from app.algorithms.dijkstra import find_shortest_path as dijkstra
from app.graph.loader import build_graph
from app.schemas.graph import GraphPayload

FIXTURES = Path(__file__).parent / "fixtures"


def make_graph(nodes, edges, directed=True):
    payload = GraphPayload.model_validate(
        {"name": "t", "directed": directed, "nodes": nodes, "edges": edges}
    )
    return build_graph(payload)


def chain_payload():
    return {
        "name": "t",
        "directed": True,
        "nodes": [{"id": n} for n in "ABCD"],
        "edges": [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    }


def two_route_graph():
    # A->B->D costs 2.0; A->C->D costs 6.0 (B->C edge is closed)
    data = json.loads((FIXTURES / "two_path_graph.json").read_text())
    return build_graph(GraphPayload.model_validate(data))


# --- Basic correctness ---------------------------------------------------


def test_two_node_graph():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 4.5}],
    )
    r = find_shortest_path(g, "A", "B")
    assert r == PathResult(path=["A", "B"], total_cost=4.5, found=True, algorithm="astar")


def test_shortest_path_selected_between_two_alternatives():
    r = find_shortest_path(two_route_graph(), "A", "D")
    assert r.found
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)


def test_higher_cost_route_not_selected():
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


def test_source_equals_target_zero_cost():
    g = build_graph(GraphPayload.model_validate(chain_payload()))
    r = find_shortest_path(g, "B", "B")
    assert r == PathResult(path=["B"], total_cost=0.0, found=True, algorithm="astar")


def test_missing_source_raises():
    g = build_graph(GraphPayload.model_validate(chain_payload()))
    with pytest.raises(UnknownNodeError):
        find_shortest_path(g, "X", "D")


def test_missing_target_raises():
    g = build_graph(GraphPayload.model_validate(chain_payload()))
    with pytest.raises(UnknownNodeError):
        find_shortest_path(g, "A", "X")


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


# --- Directed / undirected -----------------------------------------------


def test_directed_graph_respects_direction():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 1.0}],
        directed=True,
    )
    assert find_shortest_path(g, "A", "B").found
    assert find_shortest_path(g, "B", "A").found is False


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
    g = nx.DiGraph()
    g.add_node("A")
    g.add_node("B")
    g.add_edge("A", "B", cost=-1.0, closed=False)
    with pytest.raises(ValueError, match="negative cost"):
        find_shortest_path(g, "A", "B")


def test_missing_cost_attribute_rejected():
    g = nx.DiGraph()
    g.add_edge("A", "B", closed=False)
    with pytest.raises(ValueError, match="cost"):
        find_shortest_path(g, "A", "B")


# --- Heuristic behaviour --------------------------------------------------


def test_zero_heuristic_matches_dijkstra_cost():
    g = build_graph(GraphPayload.model_validate(chain_payload()))
    ra = find_shortest_path(g, "A", "D")  # default heuristic=None -> zero
    rd = dijkstra(g, "A", "D")
    assert ra.found and rd.found
    assert ra.total_cost == rd.total_cost
    assert ra.path == rd.path


def test_admissible_heuristic_finds_optimal_path():
    # h(node) = 0 for all nodes is trivially admissible; also try a small
    # consistent heuristic on the two-route fixture.
    g = two_route_graph()

    def zero_h(_node, _target):
        return 0.0

    r = find_shortest_path(g, "A", "D", heuristic=zero_h)
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)


def test_heuristic_actually_guides_search():
    # perfect heuristic h = true remaining cost -> A* expands almost nothing
    # but must still return the optimal path.
    remaining = {"A": 2.0, "B": 1.0, "C": 5.0, "D": 0.0}
    g = two_route_graph()
    calls = []

    def perfect_h(node, _target):
        calls.append(node)
        return remaining[node]

    r = find_shortest_path(g, "A", "D", heuristic=perfect_h)
    assert r.found
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)
    # target reached; heuristic was consulted during search
    assert calls


def test_invalid_heuristic_values_rejected():
    g = two_route_graph()
    with pytest.raises(ValueError, match="non-finite"):
        find_shortest_path(g, "A", "D", heuristic=lambda n, t: math.inf)
    with pytest.raises(ValueError, match="negative"):
        find_shortest_path(g, "A", "D", heuristic=lambda n, t: -1.0)


def test_positive_heuristic_at_target_rejected():
    g = two_route_graph()
    # h is 0 everywhere except the target, where it returns 1.0
    with pytest.raises(ValueError, match="must return 0"):
        find_shortest_path(
            g, "A", "D", heuristic=lambda n, t: 1.0 if n == t else 0.0
        )


def test_negative_heuristic_at_target_rejected():
    g = two_route_graph()
    with pytest.raises(ValueError, match="negative"):
        find_shortest_path(
            g, "A", "D", heuristic=lambda n, t: -1.0 if n == t else 0.0
        )


def test_non_finite_heuristic_at_target_rejected():
    g = two_route_graph()
    with pytest.raises(ValueError, match="non-finite"):
        find_shortest_path(
            g, "A", "D", heuristic=lambda n, t: math.inf if n == t else 0.0
        )


def test_valid_heuristic_zero_at_target_optimal():
    # admissible heuristic: exact remaining cost, 0 at target
    remaining = {"A": 2.0, "B": 1.0, "C": 5.0, "D": 0.0}
    g = two_route_graph()
    r = find_shortest_path(g, "A", "D", heuristic=lambda n, t: remaining[n])
    assert r.found
    assert r.path == ["A", "B", "D"]
    assert r.total_cost == pytest.approx(2.0)


def test_overestimating_heuristic_still_returns_valid_path():
    # An inadmissible heuristic may be suboptimal, but must still return a
    # connected, feasible path — document behaviour, not a crash.
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    # h wildly overestimates via C, steering search to settle target early
    remaining = {"A": 0.0, "B": 0.0, "C": 100.0, "D": 0.0}
    r = find_shortest_path(g, "A", "D", heuristic=lambda n, t: remaining[n])
    assert r.found
    assert r.path[0] == "A" and r.path[-1] == "D"
    assert all(g.has_edge(u, v) for u, v in zip(r.path, r.path[1:]))


# --- Non-mutation ---------------------------------------------------------


def test_input_graph_not_mutated():
    g = two_route_graph()
    nodes_before = dict(g.nodes(data=True))
    edges_before = {
        (u, v): dict(d) for u, v, d in g.edges(data=True)
    }
    find_shortest_path(g, "A", "D", heuristic=lambda n, t: 0.0)
    assert dict(g.nodes(data=True)) == nodes_before
    assert {(u, v): dict(d) for u, v, d in g.edges(data=True)} == edges_before
