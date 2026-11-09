# 🚦 QuantumRoute AI

### Quantum-Inspired Intelligent Traffic Route Optimization

An intelligent transportation optimization platform designed to find efficient routes in complex road networks using Quantum-inspired Particle Swarm Optimization (QPSO) and other metaheuristic algorithms.

---

## 📌 Overview

Modern transportation networks face challenges such as traffic congestion, inefficient route planning, increased travel time, and high operational costs.

**QuantumRoute AI** aims to address these challenges through intelligent route optimization. It models road networks as weighted graphs and applies quantum-inspired metaheuristic techniques to identify efficient routes based on multiple transportation parameters.

The platform will also support dynamic traffic scenarios, allowing routes to be recalculated when road conditions change.

## 🎯 Project Objectives

- Optimize routes across complex transportation networks.
- Minimize travel time and overall route distance.
- Consider traffic congestion and road conditions.
- Implement Quantum-inspired Particle Swarm Optimization (QPSO).
- Compare QPSO with classical optimization algorithms.
- Support dynamic traffic updates and route recalculation.
- Provide interactive map-based route visualization.
- Evaluate algorithm performance using reproducible experiments.

## ✨ Key Features

The following features are planned for development:

- **Intelligent Route Optimization:** Find efficient paths between selected locations.
- **QPSO Optimization Engine:** Apply quantum-inspired optimization techniques to route planning.
- **Multiple Algorithm Comparison:** Compare QPSO with PSO, Genetic Algorithm, Ant Colony Optimization, Dijkstra, and A*.
- **Traffic Simulation:** Model congestion, road closures, and changing traffic conditions.
- **Dynamic Rerouting:** Recalculate routes when traffic conditions change.
- **Interactive Map Visualization:** Display road networks, optimized routes, and alternative paths.
- **Performance Analytics:** Analyze execution time, route quality, feasibility, and convergence.
- **Experiment Tracking:** Store algorithm parameters, random seeds, and benchmark results.

## 🧠 Optimization Approach

QuantumRoute AI uses a multi-objective optimization approach.

The proposed objective function is:

\[
Z(P) = \alpha T(P) + \beta D(P) + \gamma C(P)
\]

Where:

- **T(P):** Travel time of the selected path.
- **D(P):** Total distance of the selected path.
- **C(P):** Traffic congestion cost.
- **α, β, γ:** Configurable weights representing the importance of each objective.
- **P:** Candidate route.

The objective components will be normalized before combining them.

### Quantum-Inspired Particle Swarm Optimization (QPSO)

QPSO is a classical metaheuristic optimization algorithm inspired by quantum mechanics concepts.

It will be used to explore possible routing solutions and search for efficient routes without requiring an actual quantum computer.

Since road routes are discrete paths while QPSO operates using continuous particle positions, a suitable encoding and decoding mechanism will be implemented to convert optimization candidates into valid road-network paths.

## ⚙️ Algorithms

The platform is planned to support the following algorithms:

| Algorithm | Purpose |
|---|---|
| QPSO | Quantum-inspired route optimization |
| PSO | Particle Swarm Optimization baseline |
| GA | Genetic Algorithm baseline |
| ACO | Ant Colony Optimization baseline |
| Dijkstra | Shortest-path baseline |
| A* | Heuristic-based pathfinding |

All algorithms will be evaluated using consistent graph data, objective functions, constraints, and experimental conditions.

## 🏗️ System Architecture

QuantumRoute AI follows a modular architecture with three primary application layers.

### 1. Frontend

Responsible for user interaction, route requests, maps, and visualization.

**Technologies:**
- React.js
- TypeScript
- Leaflet
- OpenStreetMap
- Recharts

### 2. Main Backend

Responsible for application logic, authentication, scenario management, data persistence, and communication with the optimization service.

**Technologies:**
- Java
- Spring Boot
- Spring Security
- Spring Data JPA
- Hibernate
- REST APIs
- JWT Authentication

### 3. Optimization Service

Responsible for graph processing, route optimization, algorithm execution, and performance evaluation.

**Technologies:**
- Python
- FastAPI
- NumPy
- SciPy
- NetworkX
- OSMnx

### 4. Database and Infrastructure

Responsible for persistent storage and application deployment.

**Technologies:**
- PostgreSQL
- PostGIS
- Docker
- Docker Compose
- GitHub Actions

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js, TypeScript |
| UI and Visualization | Leaflet, OpenStreetMap, Recharts |
| Backend | Java, Spring Boot |
| Security | Spring Security, JWT |
| ORM | Spring Data JPA, Hibernate |
| Optimization | Python, FastAPI |
| Scientific Computing | NumPy, SciPy |
| Graph Processing | NetworkX, OSMnx |
| Database | PostgreSQL, PostGIS |
| API Communication | REST APIs |
| API Testing | Postman, Swagger |
| Version Control | Git, GitHub |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions |

## 📂 Project Structure

```text
QuantumRoute-AI/
│
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── .gitignore
├── .env.example
├── docker-compose.yml
│
├── docs/
│   ├── architecture/
│   ├── diagrams/
│   ├── api/
│   ├── research/
│   ├── user-guide/
│   ├── deployment/
│   └── final-report/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── services/
│   │   ├── types/
│   │   └── tests/
│   ├── package.json
│   └── Dockerfile
│
├── backend/
│   ├── src/
│   │   ├── main/
│   │   └── test/
│   ├── pom.xml
│   └── Dockerfile
│
├── optimizer/
│   ├── app/
│   │   ├── api/
│   │   ├── algorithms/
│   │   │   ├── qpso/
│   │   │   ├── dijkstra/
│   │   │   ├── astar/
│   │   │   ├── pso/
│   │   │   └── ga/
│   │   ├── graph/
│   │   ├── decoder/
│   │   ├── fitness/
│   │   ├── experiments/
│   │   └── schemas/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
│
├── infra/
│   ├── nginx/
│   └── scripts/
│
└── .github/
    └── workflows/
        ├── ci.yml
        └── release.yml
```

## 🔄 Development Roadmap

Development will be completed in the following phases:

| Phase | Description |
|---|---|
| Phase 0 | Foundation and project setup |
| Phase 1 | Road graph and routing algorithms |
| Phase 2 | Cost model and optimization objectives |
| Phase 3 | QPSO research prototype |
| Phase 4 | Backend integration |
| Phase 5 | Frontend development |
| Phase 6 | Dynamic traffic and rerouting |
| Phase 7 | Benchmarking and evaluation |
| Phase 8 | Deployment and documentation |

## 📊 Performance Evaluation

The algorithms will be evaluated using the following metrics:

- Route quality and objective value.
- Total travel time.
- Total route distance.
- Congestion cost.
- Algorithm execution time.
- Feasibility rate.
- Convergence behavior.
- Peak memory consumption.
- Dynamic rerouting latency.

Experiments will use repeated trials and reproducible configurations. Performance claims will be based on actual experimental results.

## 🔐 Security and Reliability

The planned system will incorporate:

- JWT-based authentication.
- Role-Based Access Control (RBAC).
- Secure API communication.
- Environment-based configuration.
- Input validation and error handling.
- Logging and monitoring.
- Reproducible optimization experiments.

## 🚀 Project Status

<em>Currently in development – Phase 4: Backend Integration.</em>

The optimizer (FastAPI), Spring Boot backend, and persistence layer are implemented through Phase 4e. The React frontend is planned for a later phase.

## 🏃 Running the Stack

### Prerequisites

- Docker + Docker Compose
- `JWT_SECRET` environment variable (required, minimum 32 bytes — generate with `openssl rand -hex 32`)

### Setup

```bash
cp .env.example .env   # then set JWT_SECRET (and optionally POSTGRES_PASSWORD)
```

`.env` is git-ignored — never commit real secrets.

### Start

```bash
docker compose up -d --build
```

Services:

| Service    | URL / port              | Notes                              |
|------------|-------------------------|------------------------------------|
| db         | `127.0.0.1:15432`       | PostgreSQL 16 + PostGIS            |
| optimizer  | `http://localhost:8000` | `GET /api/health`, `POST /api/v1/optimize` |
| backend    | `http://localhost:8081` | REST API under `/api/v1`           |
| frontend   | `http://localhost:5173` | Nginx-served React app (planned)   |

The backend waits for the database health check and the optimizer to start before launching.

### Smoke test

With the stack running:

```bash
./scripts/smoke-e2e.sh
```

Exercises register → login → workspace → scenario → DIJKSTRA job → result end-to-end (requires `curl` and `python3`).

### Stop (keep data)

```bash
docker compose stop        # or: docker compose down   (volumes are preserved)
```

The `pgdata` volume is **not** removed by `docker compose down` — database data persists. Only `docker compose down -v` deletes it.

## 🔮 Future Enhancements

- Integration with real-time traffic data providers.
- Support for larger transportation networks.
- Advanced adaptive optimization strategies.
- Multi-vehicle and fleet route optimization.
- Enhanced predictive traffic analysis.
- Cloud deployment and scalability improvements.

## ⚠️ Disclaimer

QuantumRoute AI is a research and development project. QPSO is a quantum-inspired classical optimization technique and does not require quantum computing hardware. All performance improvements and comparisons will be reported only after implementation and experimental validation.

---

**QuantumRoute AI**  
*Smarter Routes. Intelligent Optimization.*
