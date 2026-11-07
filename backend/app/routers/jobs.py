from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from jobhunt.providers import LLMError

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..services import pipeline_service
from ..services.pipeline_service import compute_stats

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _to_out(uj: models.UserJob, job: models.Job) -> schemas.UserJobOut:
    return schemas.UserJobOut(
        job_id=job.job_id, ats=job.ats, company=job.company, title=job.title,
        location=job.location, url=job.url, description=job.description,
        posted_at=job.posted_at, salary=job.salary, score=uj.score, reason=uj.reason,
        draft=uj.draft or {}, status=uj.status, first_seen_at=uj.first_seen_at,
        emailed=uj.emailed, applied_at=uj.applied_at, status_updated_at=uj.status_updated_at,
    )


@router.get("", response_model=list[schemas.UserJobOut])
def list_jobs(
    status: str | None = Query(default=None, pattern=f"^({schemas.JOB_STATUSES})$"),
    # The AI-recommendation surfaces (dashboard feed) pass this so a job
    # that was screened and genuinely scored below the user's own
    # score_threshold never shows up there - "New" showing 2/10 matches
    # when the minimum is set to 6 defeats the point of the setting. A job
    # that hasn't been screened yet (score IS NULL) still passes through,
    # since that's "pending", not "rejected". The Tracker/CSV export omit
    # this flag on purpose - that view is the complete history, unfiltered.
    only_qualified: bool = Query(default=False),
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    q = db.query(models.UserJob).filter(models.UserJob.user_id == user.id)
    if status:
        q = q.filter(models.UserJob.status == status)
    if only_qualified:
        threshold = user.filter_config.score_threshold if user.filter_config else 6.0
        q = q.filter(
            (models.UserJob.score.is_(None)) | (models.UserJob.score >= threshold)
        )
    rows = q.order_by(models.UserJob.first_seen_at.desc()).all()
    job_ids = [r.job_id for r in rows]
    jobs_by_id = {j.job_id: j for j in db.query(models.Job).filter(models.Job.job_id.in_(job_ids)).all()}
    return [_to_out(r, jobs_by_id[r.job_id]) for r in rows if r.job_id in jobs_by_id]


@router.post("/manual", response_model=schemas.UserJobOut, status_code=201)
def add_manual_job(
    body: schemas.ManualJobCreate,
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    uj = pipeline_service.add_manual_job(db, user, body.model_dump())
    job = db.get(models.Job, uj.job_id)
    return _to_out(uj, job)


@router.post("/{job_id}/draft", response_model=schemas.UserJobOut)
def generate_draft(
    job_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    uj = db.query(models.UserJob).filter_by(user_id=user.id, job_id=job_id).first()
    job = db.get(models.Job, job_id)
    if not uj or not job:
        raise HTTPException(status_code=404, detail="job not found in your tracker")
    try:
        pipeline_service.generate_draft_for_job(db, user, uj, job)
    except pipeline_service.PipelineError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except LLMError as e:
        raise HTTPException(status_code=502, detail=f"AI drafting failed: {e}") from e
    db.refresh(uj)
    return _to_out(uj, job)


@router.get("/stats", response_model=schemas.StatsOut)
def stats(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return compute_stats(db, user.id)


# CLEARABLE_STATUSES are the AI's own, not-yet-acted-on recommendations -
# clearing history resets the "already seen" dedupe so the next run rescans
# everything from scratch. Real progress (applied/interviewing/offer/
# rejected) is a record of something the user actually did and is never
# touched by this, regardless of how the confirmation copy on the frontend
# phrases it - deleting a real application history would be a much bigger,
# unrelated action than "clear my scan history".
CLEARABLE_STATUSES = ("new", "shortlisted", "dismissed")


@router.get("/history/preview", response_model=schemas.ClearHistoryPreview)
def preview_clear_history(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = (
        db.query(models.UserJob)
        .filter(models.UserJob.user_id == user.id, models.UserJob.status.in_(CLEARABLE_STATUSES))
        .count()
    )
    runs = db.query(models.RunLog).filter(models.RunLog.user_id == user.id).count()
    return schemas.ClearHistoryPreview(clearable=jobs, runs=runs)


@router.delete("/history", response_model=schemas.ClearHistoryPreview)
def clear_history(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    jobs = (
        db.query(models.UserJob)
        .filter(models.UserJob.user_id == user.id, models.UserJob.status.in_(CLEARABLE_STATUSES))
        .delete(synchronize_session=False)
    )
    # RunLog is the "Search activity"/Analytics history - it's what the
    # dashboard actually shows as "scan history", so clearing history and
    # then still seeing old funnel charts would look like the action did
    # nothing. It's still just a log of past runs, not a record of
    # anything the user did, so it's safe to include here unlike UserJob
    # rows the user acted on.
    runs = db.query(models.RunLog).filter(models.RunLog.user_id == user.id).delete(synchronize_session=False)
    db.commit()
    return schemas.ClearHistoryPreview(clearable=jobs, runs=runs)


# NOTE: literal routes (/stats, /export/csv) must be registered before the
# catch-all /{job_id} routes below - Starlette matches in registration
# order, and job_id never contains "/" so a plain {job_id} converter (not
# :path) is enough and avoids it swallowing /export/csv anyway.
@router.get("/export/csv")
def export_csv(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(models.UserJob)
        .filter(models.UserJob.user_id == user.id)
        .order_by(models.UserJob.first_seen_at.desc())
        .all()
    )
    jobs_by_id = {
        j.job_id: j for j in
        db.query(models.Job).filter(models.Job.job_id.in_([r.job_id for r in rows])).all()
    }

    buf = io.StringIO()
    cols = ["job_id", "first_seen", "company", "title", "location", "score",
            "reason", "status", "applied_on", "url"]
    writer = csv.DictWriter(buf, fieldnames=cols)
    writer.writeheader()
    for r in rows:
        job = jobs_by_id.get(r.job_id)
        if not job:
            continue
        writer.writerow({
            "job_id": r.job_id, "first_seen": r.first_seen_at.isoformat(),
            "company": job.company, "title": job.title, "location": job.location,
            "score": r.score, "reason": r.reason, "status": r.status,
            "applied_on": r.applied_at.isoformat() if r.applied_at else "",
            "url": job.url,
        })
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tracker.csv"},
    )


@router.get("/{job_id}", response_model=schemas.UserJobOut)
def get_job(job_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    uj = db.query(models.UserJob).filter_by(user_id=user.id, job_id=job_id).first()
    job = db.get(models.Job, job_id)
    if not uj or not job:
        raise HTTPException(status_code=404, detail="job not found in your tracker")
    return _to_out(uj, job)


@router.patch("/{job_id}", response_model=schemas.UserJobOut)
def update_job_status(
    job_id: str, body: schemas.MarkAppliedRequest,
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    uj = db.query(models.UserJob).filter_by(user_id=user.id, job_id=job_id).first()
    job = db.get(models.Job, job_id)
    if not uj or not job:
        raise HTTPException(status_code=404, detail="job not found in your tracker")
    if uj.status != body.status:
        uj.status_updated_at = datetime.now(timezone.utc)
    uj.status = body.status
    uj.applied_at = datetime.now(timezone.utc) if body.status == "applied" else uj.applied_at
    db.commit()
    db.refresh(uj)
    return _to_out(uj, job)
