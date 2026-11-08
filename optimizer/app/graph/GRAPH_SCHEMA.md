# Graph JSON Schema (Phase 1)

This document defines the road-graph JSON format used by the QuantumRoute AI
optimizer service. It is the wire/storage format described in the Revision 2.0
blueprint (§5.1 Graph formulation) and is validated by
`app/schemas/graph.py` (`GraphPayload`, `Node`, `Edge`).

## Top-level object

```json
{
  "name": "demo-grid",
  "directed": true,
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

| Field      | Type    | Required | Description                                                        |
|------------|---------|----------|--------------------------------------------------------------------|
| `name`     | string  | no       | Human-readable graph name; defaults to `"unnamed"`.                |
| `directed` | boolean | no       | `true` → `networkx.DiGraph`; `false` → undirected `networkx.Graph`. Defaults to `true`. |
| `nodes`    | array   | yes      | Non-empty list of node objects.                                    |
| `edges`    | array   | no       | List of edge objects; may be empty (edgeless graph).               |

## Node object

```json
{ "id": "A", "lat": 28.6139, "lon": 77.2090 }
```

| Field | Type   | Required | Description                                            |
|-------|--------|----------|--------------------------------------------------------|
| `id`  | string | yes      | Unique, non-empty node identifier.                     |
| `lat` | number | no       | Latitude in decimal degrees, WGS84, range [-90, 90].   |
| `lon` | number | no       | Longitude in decimal degrees, WGS84, range [-180, 180]. |

Coordinates are optional because Phase 1 routing is topology/cost based; they
exist for map display and future spatial queries (PostGIS integration in
Phase 4).

## Edge object

```json
{ "source": "A", "target": "B", "cost": 4.2, "closed": false }
```

| Field    | Type    | Required | Description                                                              |
|----------|---------|----------|--------------------------------------------------------------------------|
| `source` | string  | yes      | ID of the edge's start node; must be a declared node.                    |
| `target` | string  | yes      | ID of the edge's end node; must be a declared node.                      |
| `cost`   | number  | yes      | Non-negative, finite scalar routing cost (see Units).                    |
| `closed` | boolean | no       | If `true`, the edge is retained for reporting but excluded from routing. Defaults to `false`. |

### Extensibility for Phase 2

`Edge` permits additional attributes (`extra="allow"`) so Phase 2 can attach
`length_m`, `speed_kmh`, `congestion`, `vehicle_class`, `oneway`, etc. without
a breaking schema change. Phase 1 algorithms read only `cost` and `closed`.

## Units

- **`cost`** — dimensionless scalar in arbitrary but *consistent* units for
  Phase 1. Phase 2 will replace/augment it with a normalized weighted sum of
  travel time, distance and congestion components (blueprint §5.2). All edges
  in a payload must use the same cost basis.
- **Coordinates** — decimal degrees (WGS84).

## Directedness

- `directed: true` → `networkx.DiGraph`; each edge applies only `source → target`.
- `directed: false` → `networkx.Graph`; edges are traversable both ways and
  each edge still records a canonical `source`/`target` orientation.
- A* requires a consistent graph type; directedness is fixed per payload.

## Parallel edges — decision: NOT supported in v1

The schema rejects multiple edges between the same ordered node pair
(`(source, target)`; unordered when `directed: false`). Rationale:

- `networkx.Graph`/`DiGraph` cannot represent parallel edges; supporting them
  would require `MultiGraph`/`MultiDiGraph`, which complicates path
  reconstruction (routes must identify *which* parallel edge was used).
- Phase 1 test graphs and small demo extracts do not need parallel edges.
- **Revisit condition:** if Phase 2+ real OSM data requires dual carriageways
  or turn-specific edges, migrate to `MultiDiGraph` and add an edge `id`/`key`
  to the schema. This is a documented, deliberate limitation.

## Validation rules (enforced at parse time)

1. Node IDs are unique and non-empty.
2. Every edge `source`/`target` references a declared node.
3. `cost` is finite and `>= 0` (algorithms require non-negative weights).
4. Self-loops (`source == target`) are rejected.
5. Parallel edges are rejected (see above).
6. `closed: true` edges are valid input but must be excluded by algorithms.

## Example

```json
{
  "name": "two-path-demo",
  "directed": true,
  "nodes": [
    { "id": "A", "lat": 28.6139, "lon": 77.2090 },
    { "id": "B" },
    { "id": "C" },
    { "id": "D", "lat": 28.7041, "lon": 77.1025 }
  ],
  "edges": [
    { "source": "A", "target": "B", "cost": 1.0 },
    { "source": "B", "target": "D", "cost": 1.0 },
    { "source": "A", "target": "C", "cost": 1.0 },
    { "source": "C", "target": "D", "cost": 5.0 },
    { "source": "B", "target": "C", "cost": 0.5, "closed": true }
  ]
}
```

Expected Phase 1 result for A→D: path `A → B → D`, total cost `2.0`
(the closed edge `B → C` must not be used; the `A → C → D` path costs `6.0`).
