from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.optimize import router as optimize_router

app = FastAPI(title="QuantumRoute AI Optimizer")

app.include_router(optimize_router)


@app.get("/api/health")
def health_check():
    return {
        "service": "QuantumRoute Optimizer",
        "status": "UP"
    }


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={
        "code": "INVALID_REQUEST",
        "message": "Request validation failed",
        "details": {"fields": {
            ".".join(str(p) for p in e["loc"]): e["msg"]
            for e in exc.errors()}},
        "traceId": __import__("uuid").uuid4().hex,
    })


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={
        "code": "INTERNAL_ERROR",
        "message": "Unexpected server error",
        "details": {},
        "traceId": __import__("uuid").uuid4().hex,
    })
