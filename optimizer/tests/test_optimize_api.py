"""Tests for POST /api/v1/optimize."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

GRAPH = {
    "name": "api-test",
    "directed": False,
    "nodes": [
        {"id": "A", "lat": 12.9, "lon": 77.6},
        {"id": "B", "lat": 13.0, "lon": 77.7},
        {"id": "C", "lat": 13.1, "lon": 77.8},
        {"id": "D"},  # no coordinates -> geometry must be null
    ],
    "edges": [
        {"id": "e-ab", "source": "A", "target": "B",
         "length_m": 1000.0, "speed_kmh": 50.0, "cost": 1.0,
         "congestion": 0.1, "closed": False},
        {"source": "B", "target": "C",
         "length_m": 2000.0, "speed_kmh": 60.0, "cost": 2.0,
         "congestion": 0.2, "closed": False},
        {"source": "A", "target": "C",
         "length_m": 5000.0, "speed_kmh": 80.0, "cost": 5.0,
         "closed": True},  # closed edge must be excluded
    ],
}


def req(algorithm, source="A", target="B", parameters=None, weights=None):
    body = {
        "graph": GRAPH,
        "sourceNodeId": source,
        "targetNodeId": target,
        "algorithm": algorithm,
        "objectiveWeights": weights or {"alpha": 0.6, "beta": 0.25, "gamma": 0.15},
        "parameters": parameters or {},
    }
    return client.post("/api/v1/optimize", json=body)


def test_health_preserved():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "UP"


def test_dijkstra_feasible():
    r = req("DIJKSTRA")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "COMPLETED"
    assert body["algorithm"] == "DIJKSTRA"
    assert body["feasible"] is True
    assert body["route"]["nodeIds"] == ["A", "B"]
    # supplied edge id preserved
    assert body["route"]["edgeIds"] == ["e-ab"]
    # all route nodes have coords -> LineString [lon, lat]
    assert body["route"]["geometry"]["type"] == "LineString"
    assert body["route"]["geometry"]["coordinates"] == [[77.6, 12.9], [77.7, 13.0]]
    assert body["metrics"]["distanceMeters"] > 0
    assert body["metrics"]["estimatedTravelTimeSeconds"] > 0
    assert "algorithmMetadata" not in body or body["algorithmMetadata"] is None


def test_dijkstra_unreachable_infeasible():
    # D has no edges -> unreachable from A
    r = req("DIJKSTRA", target="D")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "COMPLETED"
    assert body["feasible"] is False
    assert body["route"]["nodeIds"] == []
    assert body["route"]["edgeIds"] == []
    assert body["route"]["geometry"] is None
    assert body["metrics"] is None


def test_dijkstra_missing_coords_null_geometry():
    r = req("DIJKSTRA", target="D")
    # infeasible anyway; use B->C path check instead via A* on subset? D unreachable.
    # Instead verify geometry null when a node lacks coords on a feasible path:
    g = dict(GRAPH)
    g["nodes"] = [dict(n) for n in GRAPH["nodes"]]
    g["nodes"][1] = {"id": "B"}  # strip B coords
    body = {
        "graph": g, "sourceNodeId": "A", "targetNodeId": "B",
        "algorithm": "DIJKSTRA",
        "objectiveWeights": {"alpha": 0.6, "beta": 0.25, "gamma": 0.15},
        "parameters": {},
    }
    resp = client.post("/api/v1/optimize", json=body)
    assert resp.status_code == 200
    assert resp.json()["route"]["geometry"] is None


def test_astar_zero_heuristic():
    r = req("ASTAR", target="C")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["feasible"] is True
    # closed A->C edge excluded; cheapest open path A->B->C
    assert body["route"]["nodeIds"] == ["A", "B", "C"]


def test_unknown_node_422():
    r = req("DIJKSTRA", source="ZZZ")
    assert r.status_code == 422
    err = r.json()["detail"] if "detail" in r.json() else r.json()
    assert err["code"] == "UNKNOWN_NODE"
    for k in ("code", "message", "details", "traceId"):
        assert k in err


def test_dijkstra_rejects_parameters():
    r = req("DIJKSTRA", parameters={"foo": 1})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_PARAMETERS"


def test_invalid_algorithm_422():
    r = req("BELLMAN")
    assert r.status_code == 422


def test_qpso_success_with_metadata():
    r = req("QPSO", parameters={
        "particles": 10, "maxIterations": 5, "seed": 42,
        "timeBudgetS": 5.0,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "COMPLETED"
    assert body["algorithm"] == "QPSO"
    meta = body["algorithmMetadata"]
    assert meta is not None
    for k in ("seed", "iterationsRun", "usedRepair", "repairRate",
              "feasibilityRate", "convergenceTrace", "parameters"):
        assert k in meta
    assert meta["seed"] == 42


def test_qpso_rejects_unknown_parameter_key():
    r = req("QPSO", parameters={"bogus": 1, "seed": 1})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "INVALID_PARAMETERS"


def test_qpso_requires_seed():
    r = req("QPSO", parameters={"particles": 5})
    assert r.status_code == 422


def test_edge_id_encoding_collision_safe_with_delimiters():
    # node IDs containing ':', '|', '->', '--' must not collide or corrupt
    g = {
        "name": "delim",
        "directed": False,
        "nodes": [{"id": "a:b"}, {"id": "c|d"}, {"id": "e->f"}, {"id": "g--h"}],
        "edges": [
            {"source": "a:b", "target": "c|d", "length_m": 1.0,
             "speed_kmh": 10.0},
            {"source": "e->f", "target": "g--h", "length_m": 1.0,
             "speed_kmh": 10.0},
        ],
    }
    body = {
        "graph": g, "sourceNodeId": "a:b", "targetNodeId": "c|d",
        "algorithm": "DIJKSTRA",
        "objectiveWeights": {"alpha": 0.6, "beta": 0.25, "gamma": 0.15},
        "parameters": {},
    }
    resp = client.post("/api/v1/optimize", json=body)
    assert resp.status_code == 200, resp.text
    edge_ids = resp.json()["route"]["edgeIds"]
    assert len(edge_ids) == 1
    # length-prefixed encoding round-trips the exact pair
    assert edge_ids[0] == "3:a:b|3:c|d"

    # second edge gets a distinct, non-colliding id
    body["sourceNodeId"], body["targetNodeId"] = "e->f", "g--h"
    resp2 = client.post("/api/v1/optimize", json=body)
    assert resp2.status_code == 200
    assert resp2.json()["route"]["edgeIds"][0] == "4:e->f|4:g--h"


def test_missing_graph_422():
    body = {"sourceNodeId": "A", "targetNodeId": "B", "algorithm": "DIJKSTRA"}
    r = client.post("/api/v1/optimize", json=body)
    assert r.status_code == 422
