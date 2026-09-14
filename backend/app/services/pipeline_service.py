"""Orchestrates one user's run of the existing jobhunt pipeline.

This is intentionally a thin adapter: every real decision (what counts as a
match, how screening/drafting prompts are built, how JSON replies are
parsed) still lives in `jobhunt/`. This module's job is only to (a) keep a
*shared* Job cache so ten users don't refetch the same ATS boards ten times,
and (b) persist the per-user results into the database instead of
`seen.json` / `out/digest.html`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from jobhunt import digest as digest_mod
from jobhunt import llm, mailer
from jobhunt.fetch import Job as PipelineJob
from jobhunt.fetch import fetch_all
from jobhunt.mock import fetch_all_mock
from jobhunt.prefilter import prefilter
from jobhunt.providers import resolve, resolve_fallback_model

from .. import models
from ..config import settings


class PipelineError(RuntimeError):
    pass


# --------------------------------------------------------------- job cache --
def _cache_is_fresh(db: Session) -> bool:
    state = db.get(models.CacheState, 1)
    if not state or not state.last_refreshed_at:
        return False
    last = state.last_refreshed_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last < timedelta(minutes=settings.job_cache_ttl_minutes)


def refresh_job_cache(db: Session, force: bool = False, use_mock: bool = False) -> int:
    """Refetch every board in the shared `companies` table into `jobs`.

    Skipped when the cache is still within `job_cache_ttl_minutes`, unless
    `force` is set. Returns how many postings were fetched (0 if skipped).
    """
    if not force and _cache_is_fresh(db):
        return 0

    if use_mock:
        fetched = fetch_all_mock()
    else:
        companies = db.query(models.Company).all()
        if not companies:
            return 0
        company_dicts = [{"ats": c.ats, "slug": c.slug, "name": c.name} for c in companies]
        fetched = fetch_all(company_dicts)

    now = datetime.now(timezone.utc)
    for j in fetched:
        row = db.get(models.Job, j.job_id)
        if row:
            row.title, row.location, row.url = j.title, j.location, j.url
            row.description, row.posted_at, row.salary = j.description, j.posted_at, j.salary
        else:
            db.add(models.Job(
                job_id=j.job_id, ats=j.ats, company=j.company, title=j.title,
                location=j.location, url=j.url, description=j.description,
                posted_at=j.posted_at, salary=j.salary, first_fetched_at=now,
            ))

    state = db.get(models.CacheState, 1) or models.CacheState(id=1)
    state.last_refreshed_at = now
    db.merge(state)
    db.commit()
    return len(fetched)


def _row_to_job(row: models.Job) -> PipelineJob:
    return PipelineJob(
        job_id=row.job_id, ats=row.ats, company=row.company, title=row.title,
        location=row.location, url=row.url, description=row.description,
        posted_at=row.posted_at, salary=row.salary,
    )


def _user_companies(db: Session, user: models.User) -> list[models.Company]:
    excluded_ids = {
        e.company_id for e in
        db.query(models.UserCompanyExclusion).filter_by(user_id=user.id).all()
    }
    return [
        c for c in db.query(models.Company).all()
        if c.is_global and c.id not in excluded_ids or c.added_by_user_id == user.id
    ]


def compute_stats(db: Session, user_id: int) -> dict:
    rows = db.query(models.UserJob).filter_by(user_id=user_id).all()
    return {
        "tracked": len(rows),
        "shortlisted": sum(1 for r in rows if r.status == "shortlisted"),
        "applied": sum(1 for r in rows if r.status == "applied"),
        "interviewing": sum(1 for r in rows if r.status == "interviewing"),
        "offer": sum(1 for r in rows if r.status == "offer"),
        "rejected": sum(1 for r in rows if r.status == "rejected"),
        "dismissed": sum(1 for r in rows if r.status == "dismissed"),
    }


def add_manual_job(db: Session, user: models.User, data: dict) -> models.UserJob:
    """A user tracking a role they found themselves, outside the pipeline.

    Gets its own synthetic Job row (job_id prefixed "manual:" so it can never
    collide with a real "{ats}:{slug}:{id}" one from `refresh_job_cache`) so
    it can live in the same shared Job/UserJob tables as everything else -
    the tracker, CSV export, and job-detail page all work on it unmodified.
    """
    import uuid

    job_id = f"manual:{uuid.uuid4().hex[:12]}"
    job = models.Job(
        job_id=job_id, ats="manual", company=data["company"], title=data["title"],
        location=data.get("location") or "", url=data.get("url") or "",
        description=data.get("description") or "", posted_at=None, salary=None,
    )
    db.add(job)
    uj = models.UserJob(
        user_id=user.id, job_id=job_id, score=None, reason=None, draft={},
        status=data.get("status") or "applied",
        applied_at=datetime.now(timezone.utc) if (data.get("status") or "applied") == "applied" else None,
    )
    db.add(uj)
    db.commit()
    db.refresh(uj)
    return uj


def generate_draft_for_job(db: Session, user: models.User, uj: models.UserJob, job: models.Job) -> None:
    """On-demand version of the pipeline's own drafting stage, for a single
    job - a manually-added one (which never went through screen/draft at
    all), or one the user shortlisted by hand after it originally scored
    below threshold. Raises PipelineError/LLMError on failure; caller (the
    route) turns that into a clean HTTP error."""
    profile_row = user.profile
    if not profile_row or not profile_row.parsed_json:
        raise PipelineError("no profile yet - upload a resume first")

    pipeline_job = _row_to_job(job)
    provider, model = resolve("draft")
    llm.draft([pipeline_job], profile_row.parsed_json, provider=provider, model=model,
              fallback_model=resolve_fallback_model("draft"))
    uj.draft = pipeline_job.draft or {}
    db.commit()


# ------------------------------------------------------------------- run ---
def run_pipeline_for_user(
    db: Session, user: models.User, run_log: models.RunLog,
    scorer: str = "llm", send_email: bool = False, use_mock: bool = False,
) -> None:
    """Fetch -> prefilter -> dedupe -> screen -> draft -> persist -> email.

    Mutates `run_log` in place and commits. Any exception is caught, recorded
    on the run_log as `status="failed"`, and re-raised isn't needed - callers
    just read `run_log.status`.
    """
    try:
        profile_row = user.profile
        if not profile_row or not profile_row.parsed_json:
            raise PipelineError(
                "no profile yet - upload a resume first (POST /profile/resume)")
        profile = profile_row.parsed_json

        run_log.stage = "fetching"
        db.commit()
        refresh_job_cache(db, use_mock=use_mock)

        if use_mock:
            # Mirrors the CLI's own --mock behaviour: fixtures stand in for
            # the whole board list, so the per-user company selection (which
            # is drawn from companies.yaml / the real Company table and has
            # no relation to the mock slugs) doesn't apply here.
            cache_rows = db.query(models.Job).all()
        else:
            companies = _user_companies(db, user)
            allowed = {(c.ats, c.slug) for c in companies}
            # job_id is "{ats}:{slug}:{id}" - filter the shared cache down to
            # this user's selected boards by recovering (ats, slug) from it.
            cache_rows = [
                r for r in db.query(models.Job).all()
                if (r.ats, r.job_id.split(":", 2)[1]) in allowed
            ]
        jobs = [_row_to_job(r) for r in cache_rows]
        scanned = len(jobs)
        run_log.scanned = scanned
        run_log.stage = "filtering"
        db.commit()

        fc = user.filter_config
        filters = {
            "include_titles": fc.include_titles if fc else [],
            "exclude_titles": fc.exclude_titles if fc else [],
            "locations": fc.locations if fc else [],
            "allow_remote": fc.allow_remote if fc else True,
            "max_age_days": fc.max_age_days if fc else None,
        }
        jobs = prefilter(jobs, filters)
        passed_filters = len(jobs)
        run_log.passed_filters = passed_filters
        db.commit()

        existing_rows = {
            uj.job_id: uj for uj in
            db.query(models.UserJob).filter_by(user_id=user.id).all()
        }
        # A job whose screen batch failed (e.g. a transient LLM 503) was
        # persisted with score=None so the run could still finish, but if
        # it's just left alone it's stuck that way forever - excluded from
        # every future run's candidate pool by the same "already seen" dedupe
        # that protects real, screened jobs from being rescored pointlessly.
        # Only retry ones the user hasn't touched (status still "new"); once
        # they act on a job (or it gets a real score) it's left alone.
        retryable_ids = {
            jid for jid, uj in existing_rows.items()
            if uj.score is None and uj.status == "new"
        }
        seen_ids = set(existing_rows) - retryable_ids
        jobs = [j for j in jobs if j.job_id not in seen_ids]
        candidates = len(jobs)
        run_log.candidates = candidates
        # No per-batch hook into jobhunt.llm.screen() - "screening" covers
        # the whole AI scoring pass, which for real (non-keyword) runs is
        # the single slowest step (one network round-trip per batch of
        # candidates), not something to leave silent.
        run_log.stage = "screening" if jobs else "finishing"
        db.commit()

        if jobs:
            if scorer == "keyword":
                llm.keyword_screen(jobs, profile)
            else:
                provider, model = resolve("screen")
                llm.screen(
                    jobs, profile,
                    batch_size=(fc.screen_batch_size if fc else 8),
                    provider=provider, model=model,
                    fallback_model=resolve_fallback_model("screen"),
                )

        threshold = fc.score_threshold if fc else 6.0
        top_n = fc.max_per_digest if fc else 5
        # j.score is None for a job whose screen batch failed outright (see
        # the retry comment above) - it must never qualify for the
        # shortlist/draft just because `score_threshold` happens to be 0;
        # "unscored" and "scored a 0" are not the same thing.
        shortlist = sorted(
            [j for j in jobs if j.score is not None and j.score >= threshold],
            key=lambda j: j.score, reverse=True,
        )[:top_n]

        if shortlist and scorer == "llm":
            run_log.stage = "drafting"
            db.commit()
            provider, model = resolve("draft")
            llm.draft(shortlist, profile, provider=provider, model=model,
                      fallback_model=resolve_fallback_model("draft"))

        run_log.stage = "finishing"
        db.commit()

        shortlisted_ids = {j.job_id for j in shortlist}
        now = datetime.now(timezone.utc)
        for j in jobs:
            status = "shortlisted" if j.job_id in shortlisted_ids else "new"
            existing = existing_rows.get(j.job_id)
            if existing:
                # a retried, previously-unscored job - update in place rather
                # than insert, or the (user_id, job_id) unique constraint fails.
                existing.score, existing.reason = j.score, j.reason
                existing.draft, existing.status = j.draft or {}, status
            else:
                db.add(models.UserJob(
                    user_id=user.id, job_id=j.job_id, score=j.score, reason=j.reason,
                    draft=j.draft or {}, status=status,
                    first_seen_at=now, emailed=False,
                ))
        db.commit()

        if send_email and shortlist and user.receive_email:
            try:
                stats = compute_stats(db, user.id)
                subject, doc = digest_mod.build(shortlist, scanned, candidates, stats)
                mailer.send(subject, doc, to_addr=user.email)
                db.query(models.UserJob).filter(
                    models.UserJob.user_id == user.id,
                    models.UserJob.job_id.in_(shortlisted_ids),
                ).update({"emailed": True}, synchronize_session=False)
                db.commit()
            except Exception as e:  # noqa: BLE001 - email failure must not fail the run
                run_log.error = f"email failed: {type(e).__name__}: {e}"

        run_log.scanned = scanned
        run_log.passed_filters = passed_filters
        run_log.candidates = candidates
        run_log.shortlisted = len(shortlist)
        run_log.scorer = scorer
        run_log.status = "done"
        run_log.stage = "done"
        run_log.finished_at = datetime.now(timezone.utc)
        db.commit()

    except Exception as e:  # noqa: BLE001 - a run must record failure, never vanish silently
        db.rollback()
        run_log.status = "failed"
        run_log.stage = "failed"
        run_log.error = f"{type(e).__name__}: {e}"
        run_log.finished_at = datetime.now(timezone.utc)
        db.add(run_log)
        db.commit()
