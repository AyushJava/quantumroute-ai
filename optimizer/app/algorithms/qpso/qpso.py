"""Quantum-behaved Particle Swarm Optimization (QPSO) — Phase 3 prototype.

Implements the canonical Sun et al. quantum-behaved PSO formulation
(contraction-expansion coefficient theta, mean-best ``mbest`` attractor,
personal attractor, stochastic ``ln(1/u)`` position update) over the
random-key encoding decoded by ``app.decoder.decode``.

Candidate representation
------------------------
Each particle's position ``x_i in R^|V|`` is a vector of continuous keys,
one per node (node order = ``sorted(graph.nodes)``). ``decode`` turns keys
into a discrete route; ``evaluate_path`` on the cost snapshot gives the
objective ``Z(P)`` to minimize.

Update rule (per iteration t, particle i, dimension j)
------------------------------------------------------
    mbest   = mean over particles of pbest positions          (per dimension)
    p_i     = pbest_i + U(0,1) * (gbest - pbest_i)            (personal attractor)
    theta_t = theta_start + (theta_end - theta_start) * t / T (linear schedule)
    x_ij    = p_ij + s_ij * theta_t * |mbest_j - x_ij| * ln(1/u_ij)

where ``u_ij ~ U(0,1)`` (clipped away from 0) and ``s_ij in {-1,+1}``.

Fitness and feasibility
------------------------
Fitness = ``evaluate_path(snapshot, path).objective_value`` (minimize).
Infeasible decodes get internal fitness ``+inf`` — used only for ranking,
never exposed as a valid objective. ``QpsoResult.objective_value`` is
``None`` when no feasible solution exists.

Reproducibility
---------------
``numpy.random.default_rng(config.seed)`` (PCG64) is the sole random
source. With a fixed seed and fixed ``max_iterations`` (no
``time_budget_s``), identical inputs give bit-identical results.
``time_budget_s`` termination is wall-clock dependent and can affect exact
reproducibility across different hardware/load.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np
import networkx as nx

from app.algorithms.base import UnknownNodeError
from app.decoder import decode
from app.graph.cost_model import evaluate_path
from app.schemas.qpso import QpsoConfig

_U_FLOOR = 1e-12  # keep ln(1/u) finite


@dataclass(frozen=True)
class QpsoResult:
    """Outcome of a QPSO run (blueprint §5.7 result fields).

    ``objective_value`` is ``None`` when ``feasible`` is False — infinity is
    never exposed as a valid objective. ``convergence_trace`` has length
    ``iterations_run + 1`` and records the best internal fitness per
    iteration (may contain ``inf`` early if no feasible candidate exists
    yet).
    """

    path: list[str]
    objective_value: float | None
    feasible: bool
    used_repair: bool
    repair_rate: float
    feasibility_rate: float
    iterations_run: int
    runtime_ms: float
    seed: int
    parameters: dict = field(default_factory=dict)
    convergence_trace: list[float] = field(default_factory=list)


def _decode_all(
    X: np.ndarray,
    node_index: dict[str, int],
    graph: nx.Graph,
    source: str,
    target: str,
    max_steps: int,
) -> tuple[np.ndarray, list[dict], int, int]:
    """Decode every particle; return (fitness, decode_infos, feasible, repairs)."""
    n = X.shape[0]
    fits = np.empty(n)
    infos: list[dict] = []
    feasible = repairs = 0
    for i in range(n):
        keys = {node: float(X[i, idx]) for node, idx in node_index.items()}
        res = decode(keys, graph, source, target, max_steps=max_steps)
        if res.feasible:
            metrics = evaluate_path(graph, res.path)
            fits[i] = metrics.objective_value
            feasible += 1
        else:
            fits[i] = math.inf
        repairs += int(res.used_repair)
        infos.append(
            {
                "path": res.path,
                "used_repair": res.used_repair,
                "dead_end_at": res.dead_end_at,
                "repair_reason": res.repair_reason,
            }
        )
    return fits, infos, feasible, repairs


def run_qpso(
    graph: nx.Graph,
    source: str,
    target: str,
    config: QpsoConfig,
) -> QpsoResult:
    """Run the QPSO optimizer on a cost snapshot.

    Parameters
    ----------
    graph:
        Cost snapshot from ``build_cost_snapshot`` (edges carry ``cost``).
    source, target:
        Node IDs; must exist in ``graph``.
    config:
        Validated ``QpsoConfig``.

    Returns
    -------
    QpsoResult
        Best decoded route, objective, feasibility, rates, runtime, seed,
        parameter echo, and convergence trace.
    """
    if source not in graph:
        raise UnknownNodeError(f"source node {source!r} is not in the graph")
    if target not in graph:
        raise UnknownNodeError(f"target node {target!r} is not in the graph")

    node_order = sorted(graph.nodes)
    node_index = {node: i for i, node in enumerate(node_order)}
    dim = len(node_order)
    max_steps = config.max_steps if config.max_steps is not None else 4 * dim

    rng = np.random.default_rng(config.seed)
    t0 = time.perf_counter()

    n = config.particles
    X = rng.random((n, dim))
    fits, infos, feas_count, repair_count = _decode_all(
        X, node_index, graph, source, target, max_steps
    )
    evals = n

    pbest_X = X.copy()
    pbest_fit = fits.copy()
    pbest_info = list(infos)

    gbest_idx = int(np.argmin(pbest_fit))
    gbest_fit = float(pbest_fit[gbest_idx])

    trace = [gbest_fit]
    iterations_run = 0
    since_improve = 0

    for t in range(1, config.max_iterations + 1):
        if config.time_budget_s is not None and \
                (time.perf_counter() - t0) > config.time_budget_s:
            break

        theta_t = config.theta_start + (config.theta_end - config.theta_start) * (
            t / config.max_iterations
        )
        mbest = pbest_X.mean(axis=0)

        for i in range(n):
            # personal attractor: pbest pulled toward gbest
            attractor = pbest_X[i] + rng.random(dim) * (pbest_X[gbest_idx] - pbest_X[i])
            u = np.clip(rng.random(dim), _U_FLOOR, 1.0)
            signs = np.where(rng.random(dim) < 0.5, -1.0, 1.0)
            X[i] = attractor + signs * theta_t * np.abs(mbest - X[i]) * np.log(1.0 / u)

        fits, infos, f_new, r_new = _decode_all(
            X, node_index, graph, source, target, max_steps
        )
        evals += n
        feas_count += f_new
        repair_count += r_new

        improved = fits < pbest_fit
        pbest_X[improved] = X[improved]
        pbest_fit[improved] = fits[improved]
        for i in np.nonzero(improved)[0]:
            pbest_info[i] = infos[i]

        new_gbest_idx = int(np.argmin(pbest_fit))
        if pbest_fit[new_gbest_idx] < gbest_fit:
            gbest_fit = float(pbest_fit[new_gbest_idx])
            gbest_idx = new_gbest_idx
            since_improve = 0
        else:
            since_improve += 1

        iterations_run = t
        trace.append(gbest_fit)

        if config.stagnation_iters is not None and since_improve >= config.stagnation_iters:
            break

    runtime_ms = (time.perf_counter() - t0) * 1000.0
    best = pbest_info[gbest_idx]
    feasible = math.isfinite(gbest_fit)

    return QpsoResult(
        path=best["path"] if feasible else [],
        objective_value=gbest_fit if feasible else None,
        feasible=feasible,
        used_repair=best["used_repair"] if feasible else False,
        repair_rate=repair_count / evals,
        feasibility_rate=feas_count / evals,
        iterations_run=iterations_run,
        runtime_ms=runtime_ms,
        seed=config.seed,
        parameters=config.model_dump(),
        convergence_trace=trace,
    )
