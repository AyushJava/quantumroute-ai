"""Build a NetworkX graph from a validated ``GraphPayload``.

Closed edges are preserved in the graph; routing algorithms are responsible
for excluding them (see ``app.graph.GRAPH_SCHEMA`` for the schema rules).
"""

from __future__ import annotations

import networkx as nx

from app.schemas.graph import GraphPayload


def build_graph(payload: GraphPayload) -> nx.Graph:
    """Convert a validated ``GraphPayload`` into a NetworkX graph.

    Returns ``nx.DiGraph`` when ``payload.directed`` is true, otherwise an
    undirected ``nx.Graph``. Node ``lat``/``lon`` and all edge attributes
    (``cost``, ``closed`` and any Phase-2 extras) are preserved.
    """
    graph: nx.Graph = nx.DiGraph() if payload.directed else nx.Graph()
    graph.graph["name"] = payload.name
    graph.graph["directed"] = payload.directed

    for node in payload.nodes:
        attrs = {"lat": node.lat, "lon": node.lon}
        graph.add_node(node.id, **{k: v for k, v in attrs.items() if v is not None})

    for edge in payload.edges:
        graph.add_edge(edge.source, edge.target, **payload.edge_attributes(edge))

    return graph
