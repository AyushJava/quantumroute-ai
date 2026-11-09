"""POST /api/v1/optimize — run DIJKSTRA / ASTAR / QPSO on a graph payload."""

from __future__ import annotations

import time
import uuid
from typing import Any

import networkx as nx
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from app.algorithms.astar.astar import find_shortest_path as astar_search
from app.algorithms.base import PathResult, UnknownNodeError
from app.algorithms.dijkstra.dijkstra import find_shortest_path as dijkstra_search
from app.algorithms.qpso.qpso import QpsoResult, run_qpso
from app.graph.cost_model import RouteMetrics, build_cost_snapshot, evaluate_path
from app.graph.loader import build_graph
from app.schemas.optimize import (
    MetricsOut,
    OptimizeRequest,
    OptimizeResponse,
    QpsoMetadataOut,
    QpsoParameters,
    RouteOut,
)
from app.schemas.qpso import QpsoConfig

router = APIRouter(prefix="/api/v1", tags=["optimize"])

_DIJKSTRA_PARAMS: set[str] = set()
_ASTar_PARAMS: set[str] = set()


def _err(request: Request, status: int, code: str, message: str,
         details: dict[str, Any] | None = None) -> HTTPException:
    return HTTPException(
        status_code=status,
        detail={
            "code": code,
            "message": message,
            "details": details or {},
            "traceId": getattr(request.state, "trace_id", None) or uuid.uuid4().hex,
        },
    )


def _qpso_config(params: dict[str, Any]) -> QpsoConfig:
    """Map camelCase API parameters onto QpsoConfig (snake_case fields)."""
    allowed = {
        "particles": "particles",
        "maxIterations": "max_iterations",
        "seed": "seed",
        "thetaStart": "theta_start",
        "thetaEnd": "theta_end",
        "maxSteps": "max_steps",
        "timeBudgetS": "time_budget_s",
        "stagnationIters": "stagnation_iters",
    }
    unknown = set(params) - set(allowed)
    if unknown:
        raise _err_static(422, "INVALID_PARAMETERS",
                          f"unsupported QPSO parameter keys: {sorted(unknown)}")
    try:
        view = QpsoParameters.model_validate(params)
    except ValidationError as e:
        raise _err_static(422, "INVALID_PARAMETERS",
                          "invalid QPSO parameters",
                          {"fields": _field_errors(e)})
    kwargs = {snake: getattr(view, camel)
              for camel, snake in allowed.items()
              if getattr(view, camel) is not None}
    try:
        return QpsoConfig.model_validate(kwargs)
    except ValidationError as e:
        raise _err_static(422, "INVALID_PARAMETERS",
                          "invalid QPSO parameters",
                          {"fields": _field_errors(e)})


def _err_static(status: int, code: str, message: str,
                details: dict[str, Any] | None = None) -> HTTPException:
    return HTTPException(status_code=status, detail={
        "code": code, "message": message, "details": details or {},
        "traceId": uuid.uuid4().hex,
    })


def _field_errors(exc: ValidationError) -> dict[str, str]:
    return {".".join(str(p) for p in err["loc"]): err["msg"]
            for err in exc.errors()}


def _edge_id(graph: nx.Graph, u: str, v: str, directed: bool) -> str:
    data = graph.edges[u, v]
    supplied = data.get("id")
    if supplied is not None:
        return str(supplied)
    # deterministic, collision-safe encoding of the normalized (source, target)
    # pair: length-prefixed components so node IDs may contain any characters
    a, b = (u, v) if directed else tuple(sorted((u, v)))
    return f"{len(a)}:{a}|{len(b)}:{b}"


def _route_out(graph: nx.Graph, path: list[str], directed: bool) -> RouteOut:
    edge_ids = [_edge_id(graph, path[i], path[i + 1], directed)
                for i in range(len(path) - 1)]
    coords = []
    for node in path:
        attrs = graph.nodes[node]
        lat, lon = attrs.get("lat"), attrs.get("lon")
        if lat is None or lon is None:
            coords = None
            break
        coords.append([float(lon), float(lat)])  # GeoJSON: [longitude, latitude]
    geometry = ({"type": "LineString", "coordinates": coords}
                if coords else None)
    return RouteOut(nodeIds=list(path), edgeIds=edge_ids, geometry=geometry)


def _metrics_out(metrics: RouteMetrics) -> MetricsOut:
    return MetricsOut(
        distanceMeters=metrics.distance_m,
        estimatedTravelTimeSeconds=metrics.time_s,
        congestionPenalty=metrics.congestion,
        objectiveValue=metrics.objective_value,
    )


def _infeasible(algorithm: str, runtime_ms: int) -> OptimizeResponse:
    return OptimizeResponse(
        status="COMPLETED", algorithm=algorithm, feasible=False,
        route=RouteOut(nodeIds=[], edgeIds=[], geometry=None),
        metrics=None, runtimeMs=runtime_ms,
    )


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(request: Request, payload: OptimizeRequest) -> OptimizeResponse:
    try:
        base_graph = build_graph(payload.graph)
    except Exception as e:
        raise _err(request, 422, "INVALID_GRAPH", f"invalid graph payload: {e}")

    try:
        snapshot = build_cost_snapshot(base_graph, payload.objectiveWeights)
    except Exception as e:
        raise _err(request, 422, "INVALID_COST_MODEL", f"cost snapshot failed: {e}")

    directed = bool(payload.graph.directed)
    source, target = payload.sourceNodeId, payload.targetNodeId

    if payload.algorithm == "DIJKSTRA":
        if payload.parameters:
            raise _err(request, 422, "INVALID_PARAMETERS",
                       "DIJKSTRA accepts no parameters")
        t0 = time.perf_counter()
        try:
            result: PathResult = dijkstra_search(snapshot, source, target)
        except UnknownNodeError as e:
            raise _err(request, 422, "UNKNOWN_NODE", str(e))
        runtime_ms = int((time.perf_counter() - t0) * 1000)
        return _path_response(snapshot, directed, result, "DIJKSTRA", runtime_ms)

    if payload.algorithm == "ASTAR":
        if payload.parameters:
            raise _err(request, 422, "INVALID_PARAMETERS",
                       "ASTAR accepts no parameters")
        t0 = time.perf_counter()
        try:
            # approved zero heuristic for this checkpoint
            result = astar_search(snapshot, source, target, heuristic=None)
        except UnknownNodeError as e:
            raise _err(request, 422, "UNKNOWN_NODE", str(e))
        runtime_ms = int((time.perf_counter() - t0) * 1000)
        return _path_response(snapshot, directed, result, "ASTAR", runtime_ms)

    # QPSO
    try:
        config = _qpso_config(payload.parameters)
    except HTTPException:
        raise
    except Exception as e:
        raise _err(request, 422, "INVALID_PARAMETERS", str(e))
    try:
        qpso: QpsoResult = run_qpso(snapshot, source, target, config)
    except UnknownNodeError as e:
        raise _err(request, 422, "UNKNOWN_NODE", str(e))
    return _qpso_response(snapshot, directed, qpso)


def _path_response(graph: nx.Graph, directed: bool, result: PathResult,
                   algorithm: str, runtime_ms: int) -> OptimizeResponse:
    if not result.found:
        return _infeasible(algorithm, runtime_ms)
    metrics = evaluate_path(graph, result.path)
    return OptimizeResponse(
        status="COMPLETED", algorithm=algorithm, feasible=True,
        route=_route_out(graph, result.path, directed),
        metrics=_metrics_out(metrics), runtimeMs=runtime_ms,
    )


def _qpso_response(graph: nx.Graph, directed: bool,
                   result: QpsoResult) -> OptimizeResponse:
    runtime_ms = int(round(result.runtime_ms))
    metadata = QpsoMetadataOut(
        seed=result.seed,
        iterationsRun=result.iterations_run,
        usedRepair=result.used_repair,
        repairRate=result.repair_rate,
        feasibilityRate=result.feasibility_rate,
        convergenceTrace=list(result.convergence_trace),
        parameters=dict(result.parameters),
    )
    if not result.feasible or not result.path:
        return OptimizeResponse(
            status="COMPLETED", algorithm="QPSO", feasible=False,
            route=RouteOut(nodeIds=[], edgeIds=[], geometry=None),
            metrics=None, runtimeMs=runtime_ms, algorithmMetadata=metadata,
        )
    metrics = evaluate_path(graph, result.path)
    return OptimizeResponse(
        status="COMPLETED", algorithm="QPSO", feasible=True,
        route=_route_out(graph, result.path, directed),
        metrics=_metrics_out(metrics), runtimeMs=runtime_ms,
        algorithmMetadata=metadata,
    )
