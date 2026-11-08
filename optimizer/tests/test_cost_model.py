"""Tests for the Phase 2 cost model (cost components, normalization,
objective weights, snapshots and route metrics)."""

import math

import pytest

from app.algorithms.dijkstra import find_shortest_path
from app.graph.cost_model import (
    build_cost_snapshot,
    edge_components,
    evaluate_path,
    travel_time_seconds,
)
from app.graph.loader import build_graph
from app.schemas.cost import ObjectiveWeights
from app.schemas.graph import GraphPayload


def make_graph(edges, directed=True):
    node_ids = sorted({e["source"] for e in edges} | {e["target"] for e in edges})
    payload = GraphPayload.model_validate(
        {
            "name": "cost-test",
            "directed": directed,
            "nodes": [{"id": n} for n in node_ids],
            "edges": edges,
        }
    )
    return build_graph(payload)


def demo_graph():
    """Hand-calculated graph:

    A->B: 100 m @ 36 km/h -> 10 s, dist 100, cong 0
    A->C: 200 m @ 36 km/h -> 20 s, dist 200, cong 0
    B->D: 100 m @ 36 km/h -> 10 s, dist 100, cong 0
    C->D: 100 m @ 36 km/h -> 10 s, dist 100, cong 1.0

    Ranges: time [10,20], dist [100,200], cong [0,1].
    Default weights .6/.25/.15 -> costs: AB=0, AC=0.85, BD=0, CD=0.15.
    """
    return make_graph(
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "A", "target": "C", "length_m": 200.0, "speed_kmh": 36.0},
            {"source": "B", "target": "D", "length_m": 100.0, "speed_kmh": 36.0},
            {
                "source": "C",
                "target": "D",
                "length_m": 100.0,
                "speed_kmh": 36.0,
                "congestion": 1.0,
            },
        ]
    )


# --- travel_time_seconds -----------------------------------------------


def test_travel_time_known_value():
    assert travel_time_seconds(100.0, 36.0) == pytest.approx(10.0)


def test_travel_time_zero_distance():
    assert travel_time_seconds(0.0, 36.0) == 0.0


@pytest.mark.parametrize("bad_speed", [0.0, -5.0, math.nan, math.inf, -math.inf])
def test_travel_time_rejects_bad_speed(bad_speed):
    with pytest.raises(ValueError):
        travel_time_seconds(100.0, bad_speed)


@pytest.mark.parametrize("bad_len", [-1.0, math.nan, math.inf])
def test_travel_time_rejects_bad_length(bad_len):
    with pytest.raises(ValueError):
        travel_time_seconds(bad_len, 36.0)


# --- edge_components -----------------------------------------------------


def test_edge_components_extracts_values():
    comp = edge_components({"length_m": 100.0, "speed_kmh": 36.0, "congestion": 0.5})
    assert comp.distance_m == 100.0
    assert comp.time_s == pytest.approx(10.0)
    assert comp.congestion == 0.5


def test_edge_components_congestion_defaults_to_zero():
    comp = edge_components({"length_m": 100.0, "speed_kmh": 36.0})
    assert comp.congestion == 0.0


def test_edge_components_requires_length_and_speed():
    with pytest.raises(ValueError, match="length_m"):
        edge_components({"speed_kmh": 36.0})
    with pytest.raises(ValueError, match="speed_kmh"):
        edge_components({"length_m": 100.0})


@pytest.mark.parametrize("bad", [-0.1, 1.1, math.nan, math.inf])
def test_edge_components_rejects_bad_congestion(bad):
    with pytest.raises(ValueError, match="congestion"):
        edge_components({"length_m": 100.0, "speed_kmh": 36.0, "congestion": bad})


def test_edge_components_allows_zero_distance():
    comp = edge_components({"length_m": 0.0, "speed_kmh": 50.0})
    assert comp.distance_m == 0.0
    assert comp.time_s == 0.0


# --- ObjectiveWeights ----------------------------------------------------


def test_default_weights():
    w = ObjectiveWeights()
    assert (w.alpha, w.beta, w.gamma) == (0.60, 0.25, 0.15)


@pytest.mark.parametrize("field", ["alpha", "beta", "gamma"])
def test_weights_reject_negative(field):
    with pytest.raises(Exception):
        ObjectiveWeights(**{field: -0.1})


@pytest.mark.parametrize("field", ["alpha", "beta", "gamma"])
def test_weights_reject_non_finite(field):
    with pytest.raises(Exception):
        ObjectiveWeights(**{field: math.inf})
    with pytest.raises(Exception):
        ObjectiveWeights(**{field: math.nan})


def test_weights_reject_all_zero():
    with pytest.raises(Exception, match="not all be zero"):
        ObjectiveWeights(alpha=0.0, beta=0.0, gamma=0.0)


def test_weights_need_not_sum_to_one():
    w = ObjectiveWeights(alpha=2.0, beta=0.0, gamma=0.0)
    assert w.alpha == 2.0


# --- Normalization --------------------------------------------------------


def test_min_max_normalization_known_values():
    snap = build_cost_snapshot(demo_graph())
    # e2 (A->C) is max on time and distance, min congestion -> 0.85
    assert snap.edges["A", "C"]["cost"] == pytest.approx(0.85)
    # e4 (C->D) is max on congestion only -> gamma = 0.15
    assert snap.edges["C", "D"]["cost"] == pytest.approx(0.15)
    # e1/e3 are min on time+distance, min congestion -> 0
    assert snap.edges["A", "B"]["cost"] == pytest.approx(0.0)
    assert snap.edges["B", "D"]["cost"] == pytest.approx(0.0)


def test_constant_component_normalizes_to_zero():
    # equal lengths -> distance column constant -> contributes nothing
    g = make_graph(
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 50.0},
            {"source": "A", "target": "C", "length_m": 100.0, "speed_kmh": 25.0},
        ]
    )
    w_dist_only = ObjectiveWeights(alpha=0.0, beta=1.0, gamma=0.0)
    snap = build_cost_snapshot(g, w_dist_only)
    assert snap.edges["A", "B"]["cost"] == pytest.approx(0.0)
    assert snap.edges["A", "C"]["cost"] == pytest.approx(0.0)

    w_time_only = ObjectiveWeights(alpha=1.0, beta=0.0, gamma=0.0)
    snap2 = build_cost_snapshot(g, w_time_only)
    # times: 7.2s vs 14.4s -> min-max -> 0.0 and 1.0
    assert snap2.edges["A", "B"]["cost"] == pytest.approx(0.0)
    assert snap2.edges["A", "C"]["cost"] == pytest.approx(1.0)


def test_custom_weights_change_costs():
    g = demo_graph()
    w = ObjectiveWeights(alpha=0.0, beta=0.0, gamma=1.0)
    snap = build_cost_snapshot(g, w)
    assert snap.edges["C", "D"]["cost"] == pytest.approx(1.0)
    assert snap.edges["A", "B"]["cost"] == pytest.approx(0.0)


# --- Snapshots ------------------------------------------------------------


def test_snapshot_does_not_mutate_original():
    g = demo_graph()
    before = {(u, v): dict(d) for u, v, d in g.edges(data=True)}
    build_cost_snapshot(g)
    after = {(u, v): dict(d) for u, v, d in g.edges(data=True)}
    assert before == after
    assert all("cost" not in d for d in after.values())


def test_snapshot_is_independent_copy():
    g = demo_graph()
    snap = build_cost_snapshot(g)
    assert snap is not g
    snap.edges["A", "B"]["cost"] = 999.0
    assert "cost" not in g.edges["A", "B"]


def test_closed_edges_preserved_and_costed():
    g = make_graph(
        [
            {"source": "A", "target": "B", "length_m": 50.0, "speed_kmh": 36.0,
             "closed": True},
            {"source": "A", "target": "C", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "C", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
        ]
    )
    snap = build_cost_snapshot(g)
    assert snap.has_edge("A", "B")
    assert snap.edges["A", "B"]["closed"] is True
    assert "cost" in snap.edges["A", "B"]

    # routing on the snapshot still excludes the closed edge
    r = find_shortest_path(snap, "A", "B")
    assert r.path == ["A", "C", "B"]


def test_snapshot_requires_cost_attributes():
    g = make_graph([{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="length_m"):
        build_cost_snapshot(g)


def test_undirected_snapshot():
    g = make_graph(
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "B", "target": "C", "length_m": 200.0, "speed_kmh": 36.0},
        ],
        directed=False,
    )
    snap = build_cost_snapshot(g)
    assert not snap.is_directed()
    assert "cost" in snap.edges["A", "B"]


# --- evaluate_path ---------------------------------------------------------


def test_evaluate_path_hand_calculated():
    snap = build_cost_snapshot(demo_graph())
    m = evaluate_path(snap, ["A", "B", "D"])
    assert m.distance_m == pytest.approx(200.0)
    assert m.time_s == pytest.approx(20.0)
    assert m.congestion == pytest.approx(0.0)
    assert m.objective_value == pytest.approx(0.0)

    m2 = evaluate_path(snap, ["A", "C", "D"])
    assert m2.distance_m == pytest.approx(300.0)
    assert m2.time_s == pytest.approx(30.0)
    assert m2.congestion == pytest.approx(1.0)
    # A->C cost 0.85 + C->D cost 0.15
    assert m2.objective_value == pytest.approx(1.0)


def test_evaluate_path_objective_matches_dijkstra_total():
    snap = build_cost_snapshot(demo_graph())
    r = find_shortest_path(snap, "A", "D")
    m = evaluate_path(snap, r.path)
    assert m.objective_value == pytest.approx(r.total_cost)


def test_evaluate_path_single_node_zeros():
    snap = build_cost_snapshot(demo_graph())
    m = evaluate_path(snap, ["A"])
    assert m.distance_m == 0.0
    assert m.time_s == 0.0
    assert m.congestion == 0.0
    assert m.objective_value == 0.0


def test_evaluate_path_requires_snapshot():
    g = demo_graph()
    with pytest.raises(ValueError, match="cost snapshot"):
        evaluate_path(g, ["A", "B"])


def test_evaluate_path_rejects_nonexistent_edge():
    snap = build_cost_snapshot(demo_graph())
    with pytest.raises(ValueError, match="non-existent edge"):
        evaluate_path(snap, ["A", "D"])  # no direct A->D edge
