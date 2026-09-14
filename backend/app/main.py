from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import admin, auth, companies, filters, jobs, pipeline, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="jobhunt API",
    description="AI-powered job recommendation and application assistant for students - "
                 "backend for the jobhunt pipeline (fetch -> prefilter -> AI screen -> "
                 "AI draft -> track). Never auto-submits an application.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(filters.router)
app.include_router(companies.router)
app.include_router(pipeline.router)
app.include_router(jobs.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
