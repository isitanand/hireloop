from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import SessionLocal
from ..deps import get_current_user, get_db
from ..services.pipeline_service import run_pipeline_for_user

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# A run has no heartbeat - if the process hosting its background task dies
# mid-run (a Render redeploy, an OOM kill, a crash), nothing ever moves its
# row past status="running". Without this, that one row blocks every future
# run for the user forever: this endpoint 409s while `already_running`
# exists, and the dashboard's "Run search now" button stays disabled/spinning
# on any run whose latest status is "running". A real run's stage keeps
# advancing every commit (see pipeline_service.py); one untouched for this
# long is abandoned, not slow.
STALE_RUN_AFTER = timedelta(minutes=15)


def _run_in_background(user_id: int, run_log_id: int, scorer: str, send_email: bool) -> None:
    """Runs in a FastAPI BackgroundTask thread, so it needs its own DB
    session - the request-scoped one from `get_db` is already closed by the
    time this executes."""
    db = SessionLocal()
    try:
        user = db.get(models.User, user_id)
        run_log = db.get(models.RunLog, run_log_id)
        if user and run_log:
            run_pipeline_for_user(db, user, run_log, scorer=scorer, send_email=send_email)
    finally:
        db.close()


@router.post("/run", response_model=schemas.RunLogOut, status_code=202)
def start_run(
    body: schemas.RunRequest, background_tasks: BackgroundTasks,
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if not user.profile:
        raise HTTPException(status_code=400, detail="upload a resume before running a search")

    already_running = (
        db.query(models.RunLog)
        .filter_by(user_id=user.id, status="running")
        .first()
    )
    if already_running:
        started = already_running.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - started < STALE_RUN_AFTER:
            raise HTTPException(status_code=409, detail="a run is already in progress")
        already_running.status = "failed"
        already_running.stage = "failed"
        already_running.error = (
            "abandoned - no progress for over 15 minutes, likely a server "
            "restart mid-run"
        )
        already_running.finished_at = datetime.now(timezone.utc)
        db.commit()

    run_log = models.RunLog(user_id=user.id, status="running", scorer=body.scorer)
    db.add(run_log)
    db.commit()
    db.refresh(run_log)

    background_tasks.add_task(
        _run_in_background, user.id, run_log.id, body.scorer, body.send_email)
    return run_log


@router.get("/runs", response_model=list[schemas.RunLogOut])
def list_runs(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(models.RunLog)
        .filter_by(user_id=user.id)
        .order_by(models.RunLog.started_at.desc())
        .limit(20)
        .all()
    )


@router.get("/runs/{run_id}", response_model=schemas.RunLogOut)
def get_run(run_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    run_log = db.get(models.RunLog, run_id)
    if not run_log or run_log.user_id != user.id:
        raise HTTPException(status_code=404, detail="run not found")
    return run_log
