"""Tests for the random-key discrete route decoder (Phase 3)."""

import math

import pytest

from app.algorithms.base import UnknownNodeError
from app.decoder import DecodeResult, decode
from app.graph.cost_model import build_cost_snapshot
from app.graph.loader import build_graph
from app.schemas.graph import GraphPayload


def make_graph(nodes, edges, directed=True):
    ids = sorted({n["id"] for n in nodes} | {e["source"] for e in edges}
                 | {e["target"] for e in edges})
    payload = GraphPayload.model_validate(
        {"name": "dec", "directed": directed,
         "nodes": [{"id": i} for i in ids], "edges": edges}
    )
    return build_graph(payload)


def keys_for(graph, **overrides):
    """Deterministic default keys: node index order -> 0.5 baseline."""
    k = {n: 0.5 for n in graph.nodes}
    k.update(overrides)
    return k


def costed(nodes, edges, directed=True):
    """Graph with cost attributes so Dijkstra repair can run."""
    for e in edges:
        e.setdefault("length_m", 100.0)
        e.setdefault("speed_kmh", 36.0)
    g = make_graph(nodes, edges, directed)
    return build_cost_snapshot(g)


# --- Basic decoding --------------------------------------------------------


def test_linear_chain_unique_path():
    g = costed(
        [{"id": n} for n in "ABC"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "C", "cost": 1.0},
        ],
    )
    # overwrite cost attrs are fine; decoder only needs structure+closed
    r = decode(keys_for(g), g, "A", "C")
    assert r.feasible
    assert r.path == ["A", "B", "C"]
    assert not r.used_repair


def test_key_priority_selects_neighbour():
    # A->B and A->C both open; B-key < C-key steers first hop to B
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    k_low_b = keys_for(g, B=0.1, C=0.9)
    k_low_c = keys_for(g, B=0.9, C=0.1)
    assert decode(k_low_b, g, "A", "D").path == ["A", "B", "D"]
    assert decode(k_low_c, g, "A", "D").path == ["A", "C", "D"]


def test_equal_keys_tie_break_by_node_id():
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    r = decode(keys_for(g), g, "A", "D")
    # all keys equal -> "B" < "C" -> B path
    assert r.path == ["A", "B", "D"]


def test_closed_edge_skipped():
    g = make_graph(
        [{"id": n} for n in "ABC"],
        [
            {"source": "A", "target": "B", "cost": 0.1, "closed": True},
            {"source": "A", "target": "C", "cost": 5.0},
            {"source": "C", "target": "B", "cost": 1.0},
        ],
    )
    # A->B closed; only route is A->C->B
    r = decode(keys_for(g), g, "A", "B")
    assert r.feasible
    assert r.path == ["A", "C", "B"]


def test_visited_nodes_not_revisited():
    # triangle A-B, B-A implicit via undirected; ensure no A->B->A loop
    g = make_graph(
        [{"id": n} for n in "AB"],
        [{"source": "A", "target": "B", "cost": 1.0}],
        directed=False,
    )
    r = decode(keys_for(g), g, "A", "B")
    assert r.path == ["A", "B"]


# --- Repair -----------------------------------------------------------------


def test_dead_end_triggers_dijkstra_repair():
    # A->B dead end (B only connects back to A, visited); A->C->D is the route.
    # Greedy picks lowest key neighbour; force it into the dead end.
    g = costed(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "A", "cost": 1.0},  # only back-edge
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    # keys make decoder choose B first (dead end), then repair finds A-C-D
    k = keys_for(g, B=0.0, C=0.9, D=0.8, A=0.5)
    r = decode(k, g, "A", "D")
    assert r.feasible
    assert r.used_repair
    assert r.repair_reason == "no_candidates"
    assert r.dead_end_at == "B"
    # repaired path is the Dijkstra result, not the greedy prefix
    assert r.path == ["A", "C", "D"]


def test_max_steps_exhaustion_triggers_repair():
    # long chain; tiny max_steps forces budget exhaustion mid-route
    g = costed(
        [{"id": n} for n in "ABCDE"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "B", "target": "C", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
            {"source": "D", "target": "E", "cost": 1.0},
        ],
    )
    r = decode(keys_for(g), g, "A", "E", max_steps=2)
    assert r.feasible
    assert r.used_repair
    assert r.repair_reason == "max_steps"
    assert r.dead_end_at == "C"  # stopped after 2 expansions
    assert r.path == ["A", "B", "C", "D", "E"]


def test_unreachable_target_explicitly_infeasible():
    # costed graph so Dijkstra repair can run and report no route
    g2 = costed(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "C", "target": "D", "length_m": 100.0, "speed_kmh": 36.0},
        ],
    )
    r = decode(keys_for(g2), g2, "A", "D")
    assert not r.feasible
    assert r.path == []
    assert r.used_repair
    assert r.repair_reason == "no_candidates"


# --- Edge cases ---------------------------------------------------------------


def test_source_equals_target():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    r = decode(keys_for(g), g, "A", "A")
    assert r == DecodeResult(path=["A"], feasible=True)


def test_missing_source_raises():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(UnknownNodeError):
        decode(keys_for(g), g, "X", "B")


def test_missing_target_raises():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(UnknownNodeError):
        decode(keys_for(g), g, "A", "X")


def test_missing_keys_rejected():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="keys missing"):
        decode({"A": 0.5}, g, "A", "B")


def test_extra_keys_rejected():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="unknown nodes"):
        decode({"A": 0.5, "B": 0.5, "Z": 0.5}, g, "A", "B")


@pytest.mark.parametrize("bad_keys", [None, [0.5, 0.5], "AB", 42])
def test_non_mapping_keys_rejected(bad_keys):
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="mapping"):
        decode(bad_keys, g, "A", "B")


def test_huge_integer_key_rejected_without_overflow():
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    # 10**400 overflows float conversion inside math.isfinite
    with pytest.raises(ValueError, match="finite number"):
        decode({"A": 0.5, "B": 10**400}, g, "A", "B")


@pytest.mark.parametrize("bad_key", [math.nan, math.inf, True, "x"])
def test_invalid_key_values_rejected(bad_key):
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="finite number"):
        decode({"A": 0.5, "B": bad_key}, g, "A", "B")


@pytest.mark.parametrize("bad_steps", [0, -1, 1.5, True, "x"])
def test_invalid_max_steps_rejected(bad_steps):
    g = make_graph([{"id": "A"}, {"id": "B"}],
                   [{"source": "A", "target": "B", "cost": 1.0}])
    with pytest.raises(ValueError, match="max_steps"):
        decode(keys_for(g), g, "A", "B", max_steps=bad_steps)


def test_undirected_reverse_traversal():
    g = make_graph(
        [{"id": "A"}, {"id": "B"}],
        [{"source": "A", "target": "B", "cost": 1.0}],
        directed=False,
    )
    r = decode(keys_for(g), g, "B", "A")
    assert r.feasible
    assert r.path == ["B", "A"]


def test_deterministic_same_keys_same_path():
    g = make_graph(
        [{"id": n} for n in "ABCD"],
        [
            {"source": "A", "target": "B", "cost": 1.0},
            {"source": "A", "target": "C", "cost": 1.0},
            {"source": "B", "target": "D", "cost": 1.0},
            {"source": "C", "target": "D", "cost": 1.0},
        ],
    )
    k = keys_for(g, A=0.1, B=0.4, C=0.2, D=0.9)
    r1 = decode(k, g, "A", "D")
    r2 = decode(k, g, "A", "D")
    assert r1 == r2
