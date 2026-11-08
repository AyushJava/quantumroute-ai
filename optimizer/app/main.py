from fastapi import FastAPI

app = FastAPI(title="QuantumRoute AI Optimizer")

@app.get("/api/health")
def health_check():
    return {
        "service": "QuantumRoute Optimizer",
        "status": "UP"
    }
