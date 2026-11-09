"""Tests for the QPSO optimizer and QpsoConfig (Phase 3)."""

import math

import pytest

from app.algorithms.base import UnknownNodeError
from app.algorithms.qpso import QpsoResult, run_qpso
from app.graph.cost_model import build_cost_snapshot, evaluate_path
from app.graph.loader import build_graph
from app.schemas.graph import GraphPayload
from app.schemas.qpso import QpsoConfig


def make_snapshot(edges, directed=True, name="qpso-test"):
    ids = sorted({e["source"] for e in edges} | {e["target"] for e in edges})
    payload = GraphPayload.model_validate(
        {
            "name": name,
            "directed": directed,
            "nodes": [{"id": i} for i in ids],
            "edges": edges,
        }
    )
    return build_cost_snapshot(build_graph(payload))


def demo_snapshot():
    """Two-route graph: A->B->D cheap-ish, A->C->D congested."""
    return make_snapshot(
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


def small_config(**overrides):
    base = {"particles": 8, "max_iterations": 10, "seed": 42}
    base.update(overrides)
    return QpsoConfig(**base)


# --- Config validation -----------------------------------------------------


def test_config_defaults():
    c = QpsoConfig(seed=1)
    assert c.particles == 30
    assert c.max_iterations == 150
    assert c.theta_start == 1.0
    assert c.theta_end == 0.5
    assert c.time_budget_s is None
    assert c.stagnation_iters is None


@pytest.mark.parametrize("field,value", [
    ("particles", 0), ("particles", -3), ("max_iterations", 0),
    ("seed", -1), ("theta_start", 0.0), ("theta_end", 0.0),
    ("max_steps", 0), ("time_budget_s", 0.0), ("stagnation_iters", 0),
])
def test_config_rejects_bad_values(field, value):
    with pytest.raises(Exception):
        QpsoConfig(seed=1, **{field: value})


def test_config_rejects_non_finite_theta():
    with pytest.raises(Exception):
        QpsoConfig(seed=1, theta_start=math.inf)
    with pytest.raises(Exception):
        QpsoConfig(seed=1, theta_end=math.nan)


def test_config_rejects_theta_end_greater_than_start():
    with pytest.raises(Exception, match="theta_end"):
        QpsoConfig(seed=1, theta_start=0.5, theta_end=1.0)


@pytest.mark.parametrize("field", [
    "particles", "max_iterations", "seed", "theta_start", "theta_end",
    "max_steps", "time_budget_s", "stagnation_iters",
])
@pytest.mark.parametrize("bad", [True, False])
def test_config_rejects_boolean_values(field, bad):
    kwargs = {"seed": 1, field: bad}
    if field == "seed":
        kwargs = {"seed": bad}
    with pytest.raises(Exception, match="boolean"):
        QpsoConfig(**kwargs)


def test_config_rejects_unexpected_fields():
    with pytest.raises(Exception):
        QpsoConfig(seed=1, bogus_field=3)


# --- run_qpso basics ---------------------------------------------------------


def test_missing_nodes_raise():
    g = demo_snapshot()
    with pytest.raises(UnknownNodeError):
        run_qpso(g, "X", "D", small_config())
    with pytest.raises(UnknownNodeError):
        run_qpso(g, "A", "X", small_config())


def test_connected_graph_returns_feasible_result():
    g = demo_snapshot()
    r = run_qpso(g, "A", "D", small_config())
    assert isinstance(r, QpsoResult)
    assert r.feasible
    assert r.path and r.path[0] == "A" and r.path[-1] == "D"
    assert r.objective_value is not None
    assert math.isfinite(r.objective_value)


def test_objective_consistent_with_evaluate_path():
    g = demo_snapshot()
    r = run_qpso(g, "A", "D", small_config())
    m = evaluate_path(g, r.path)
    assert m.objective_value == pytest.approx(r.objective_value)


def test_same_seed_same_budget_reproducible():
    g = demo_snapshot()
    cfg = small_config()
    r1 = run_qpso(g, "A", "D", cfg)
    r2 = run_qpso(g, "A", "D", cfg)
    assert r1.path == r2.path
    assert r1.objective_value == r2.objective_value
    assert r1.convergence_trace == r2.convergence_trace
    assert r1.iterations_run == r2.iterations_run
    assert r1.repair_rate == r2.repair_rate


def test_different_seeds_smoke():
    g = demo_snapshot()
    r1 = run_qpso(g, "A", "D", small_config(seed=1))
    r2 = run_qpso(g, "A", "D", small_config(seed=999))
    assert r1.seed == 1 and r2.seed == 999
    assert r1.feasible and r2.feasible
    # different seeds may explore differently; both must return valid routes
    assert r1.path[0] == "A" and r1.path[-1] == "D"
    assert r2.path[0] == "A" and r2.path[-1] == "D"


def test_convergence_trace_length():
    g = demo_snapshot()
    r = run_qpso(g, "A", "D", small_config(max_iterations=7))
    assert r.iterations_run == 7
    assert len(r.convergence_trace) == r.iterations_run + 1
    # trace is non-increasing best-fitness (gbest never worsens)
    assert all(
        r.convergence_trace[i + 1] <= r.convergence_trace[i] + 1e-12
        for i in range(len(r.convergence_trace) - 1)
    )


def test_rates_in_unit_interval():
    g = demo_snapshot()
    r = run_qpso(g, "A", "D", small_config())
    assert 0.0 <= r.repair_rate <= 1.0
    assert 0.0 <= r.feasibility_rate <= 1.0
    # connected graph: every evaluation should be feasible
    assert r.feasibility_rate == pytest.approx(1.0)


def test_repair_rate_tracked_separately(monkeypatch):
    # dead-end-prone graph: from A the decoder picks B or C by key; choosing
    # B dead-ends (B->A is visited) and triggers Dijkstra repair. With random
    # keys across particles/evaluations, repairs are essentially guaranteed.
    import app.algorithms.qpso.qpso as qpso_mod

    counts = {"total": 0, "repair": 0, "feasible": 0}
    real_decode = qpso_mod.decode

    def counting_decode(*args, **kwargs):
        res = real_decode(*args, **kwargs)
        counts["total"] += 1
        counts["repair"] += int(res.used_repair)
        counts["feasible"] += int(res.feasible)
        return res

    # patch the reference run_qpso actually uses, not the decoder module
    monkeypatch.setattr(qpso_mod, "decode", counting_decode)

    g = make_snapshot(
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "B", "target": "A", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "A", "target": "C", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "C", "target": "D", "length_m": 100.0, "speed_kmh": 36.0},
        ]
    )
    cfg = small_config()
    r = run_qpso(g, "A", "D", cfg)
    assert r.feasible
    assert counts["repair"] > 0  # at least one repair actually occurred

    # decoder called once per particle for init + once per completed iteration
    expected_calls = cfg.particles * (r.iterations_run + 1)
    assert counts["total"] == expected_calls

    # rates are computed over ALL decoder evaluations
    assert r.repair_rate == pytest.approx(counts["repair"] / counts["total"])
    assert r.feasibility_rate == pytest.approx(counts["feasible"] / counts["total"])


def test_unreachable_target_infeasible_no_inf_objective():
    g = make_snapshot(
        [
            {"source": "A", "target": "B", "length_m": 100.0, "speed_kmh": 36.0},
            {"source": "C", "target": "D", "length_m": 100.0, "speed_kmh": 36.0},
        ]
    )
    r = run_qpso(g, "A", "D", small_config())
    assert not r.feasible
    assert r.path == []
    assert r.objective_value is None  # inf never exposed as objective
    assert r.feasibility_rate == pytest.approx(0.0)


def test_time_budget_smoke():
    g = demo_snapshot()
    r = run_qpso(g, "A", "D", small_config(time_budget_s=60.0))
    assert r.iterations_run >= 0
    assert len(r.convergence_trace) == r.iterations_run + 1
    assert r.runtime_ms >= 0.0


def test_tiny_time_budget_terminates_early():
    # 1 microsecond is far below the cost of even the initial swarm decode,
    # so the run must stop before completing max_iterations on any hardware.
    g = demo_snapshot()
    cfg = small_config(max_iterations=50, time_budget_s=1e-6)
    r = run_qpso(g, "A", "D", cfg)
    assert r.iterations_run < cfg.max_iterations
    assert len(r.convergence_trace) == r.iterations_run + 1
    # result still structurally valid even with zero completed iterations
    assert isinstance(r.path, list)


def test_stagnation_early_stop():
    g = demo_snapshot()
    # force immediate stagnation: only 1 iteration allowed to improve
    r = run_qpso(g, "A", "D", small_config(stagnation_iters=1))
    assert r.iterations_run <= 3  # stops soon after first non-improving iter
    assert len(r.convergence_trace) == r.iterations_run + 1


def test_parameters_echo_config():
    g = demo_snapshot()
    cfg = small_config()
    r = run_qpso(g, "A", "D", cfg)
    assert r.parameters == cfg.model_dump()
    assert r.seed == cfg.seed
