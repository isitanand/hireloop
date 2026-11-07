from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal
from ..deps import get_db, verify_admin_secret
from ..services.pipeline_service import run_pipeline_for_user

router = APIRouter(prefix="/admin", tags=["admin"])


def _run_all_in_background() -> None:
    db = SessionLocal()
    try:
        users = db.query(models.User).filter(
            models.User.auto_run_daily.is_(True)).all()
        for user in users:
            if not user.profile:
                continue
            run_log = models.RunLog(user_id=user.id, status="running", scorer="llm")
            db.add(run_log)
            db.commit()
            db.refresh(run_log)
            run_pipeline_for_user(db, user, run_log, scorer="llm", send_email=user.receive_email)
    finally:
        db.close()


@router.post("/run-scheduled", status_code=202, dependencies=[Depends(verify_admin_secret)])
def run_scheduled(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Hit by the daily GitHub Actions cron (see .github/workflows/daily.yml)
    instead of an in-process scheduler, which free-tier hosts that sleep/
    restart can't run reliably. Runs the pipeline for every user who has
    opted into `auto_run_daily`."""
    pending = db.query(models.User).filter(models.User.auto_run_daily.is_(True)).count()
    background_tasks.add_task(_run_all_in_background)
    return {"queued_users": pending}
