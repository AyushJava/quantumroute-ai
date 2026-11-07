# ADR-001: Technology Stack

**Project:** QuantumRoute AI  
**Status:** Accepted  
**Date:** 7 November 2026

## 1. Context

QuantumRoute AI is an intelligent transportation route optimization platform using quantum-inspired metaheuristic optimization.

The system requires a frontend, backend, optimization engine, database and mapping capabilities.

## 2. Technology Decisions

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript | User interface |
| Mapping | Leaflet + OpenStreetMap | Road network visualization |
| Backend | Java 21 + Spring Boot 3 | Business logic and REST APIs |
| Security | Spring Security + JWT | Authentication and authorization |
| Optimizer | Python + FastAPI | QPSO and other optimization algorithms |
| Graph Processing | NetworkX, OSMnx | Road network and graph operations |
| Database | PostgreSQL + PostGIS | Persistent data and geographical information |
| ORM | Spring Data JPA + Hibernate | Database operations |
| Charts | Recharts | Optimization results and analytics |
| Deployment | Docker + Docker Compose | Containerization |
| Version Control | Git + GitHub | Source code management |

## 3. Architecture

The application follows a modular architecture.

- React frontend communicates with the Spring Boot backend.
- Spring Boot manages users, scenarios, requests and application workflows.
- Spring Boot communicates with the Python FastAPI optimizer.
- Python handles QPSO, Dijkstra, A*, PSO and GA implementations.
- PostgreSQL stores application and experiment data.

## 4. Key Decisions

1. Java Spring Boot is the primary application backend.
2. Python is dedicated to mathematical optimization and graph algorithms.
3. React and TypeScript provide the frontend.
4. PostgreSQL with PostGIS manages geographical and application data.
5. QPSO will be evaluated against classical optimization algorithms.
6. The initial traffic environment will support controlled, synthetic scenarios.

## 5. Consequences

This architecture separates application management from computational optimization.

It allows the frontend, backend and optimizer to be developed and tested independently while maintaining clear API boundaries.

## 6. Future Considerations

Real-time traffic provider integration, Redis caching and additional deployment infrastructure may be introduced when justified by project requirements.