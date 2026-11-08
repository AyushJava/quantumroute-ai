"""A* shortest-path algorithm (Phase 1)."""

from app.algorithms.base import PathResult, UnknownNodeError
from app.algorithms.astar.astar import find_shortest_path

__all__ = ["PathResult", "UnknownNodeError", "find_shortest_path"]
