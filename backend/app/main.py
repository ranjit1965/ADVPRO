import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import seed
from .config import settings
from .routers import auth, batch_import, biometric, course_requests, entries, hr, lookups, master, masters, misc, reports, users, work

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    seed.run()
    stop = batch_import.start_scheduler()  # monthly BatchMaster import
    yield
    stop.set()


app = FastAPI(title="Daily Entry Report API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, users, lookups, master, masters, work, entries, reports, hr, misc, biometric, course_requests, batch_import):
    app.include_router(r.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
