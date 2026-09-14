"""SQLAlchemy models.

`Job` is a shared cache (one row per posting, fetched once regardless of how
many users are searching) - see `services/pipeline_service.py`. Everything
personal to a user hangs off `UserJob`, which is what replaces the CLI's
`seen.json` (dedupe + application tracker in one place).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    receive_email: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_run_daily: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    profile: Mapped["Profile | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan")
    filter_config: Mapped["FilterConfig | None"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan")


class Profile(Base):
    """The resume-derived profile - same shape `jobhunt.llm.build_profile()` returns."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    resume_filename: Mapped[str | None] = mapped_column(String(255))
    # The uploaded file itself, stored in the DB (not on local disk) so it
    # survives a redeploy on hosts with an ephemeral filesystem (e.g.
    # Render's free tier) exactly like every other row in this table does.
    resume_bytes: Mapped[bytes | None] = mapped_column(LargeBinary)
    parsed_json: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="profile")


class FilterConfig(Base):
    """Same knobs as `config.yaml: filters` in the CLI, per user."""

    __tablename__ = "filter_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    include_titles: Mapped[list] = mapped_column(JSON, default=list)
    exclude_titles: Mapped[list] = mapped_column(JSON, default=list)
    locations: Mapped[list] = mapped_column(JSON, default=list)
    allow_remote: Mapped[bool] = mapped_column(Boolean, default=True)
    max_age_days: Mapped[int | None] = mapped_column(Integer, default=14)
    score_threshold: Mapped[float] = mapped_column(Float, default=6.0)
    max_per_digest: Mapped[int] = mapped_column(Integer, default=5)
    screen_batch_size: Mapped[int] = mapped_column(Integer, default=8)

    user: Mapped["User"] = relationship(back_populates="filter_config")


class Company(Base):
    """A board to poll. `is_global` rows are admin-curated and shown to
    everyone by default; a user can add their own on top."""

    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("ats", "slug", name="uq_company_ats_slug"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ats: Mapped[str] = mapped_column(String(20), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_global: Mapped[bool] = mapped_column(Boolean, default=True)
    added_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class UserCompanyExclusion(Base):
    """A user opting OUT of a global-list company. Absence of a row means
    "included" - this way new global companies apply to everyone by default
    without a migration touching every user."""

    __tablename__ = "user_company_exclusions"
    __table_args__ = (UniqueConstraint("user_id", "company_id", name="uq_user_company_exclusion"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)


class Job(Base):
    """Shared posting cache - one row per job_id regardless of how many users
    are searching. Refetched on a TTL (see config.job_cache_ttl_minutes)."""

    __tablename__ = "jobs"

    job_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    ats: Mapped[str] = mapped_column(String(20), nullable=False)
    company: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(1000), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    posted_at: Mapped[str | None] = mapped_column(String(50))
    salary: Mapped[str | None] = mapped_column(String(255))
    first_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserJob(Base):
    """Per-user personalization + tracker row. Replaces `seen.json`."""

    __tablename__ = "user_jobs"
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_user_job"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.job_id"), nullable=False, index=True)
    score: Mapped[float | None] = mapped_column(Float)
    reason: Mapped[str | None] = mapped_column(Text)
    draft: Mapped[dict] = mapped_column(JSON, default=dict)
    # new = seen but below threshold, shortlisted = made the digest,
    # applied = user marked it, dismissed = user hid it
    status: Mapped[str] = mapped_column(String(20), default="new")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    emailed: Mapped[bool] = mapped_column(Boolean, default=False)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Only tracks the most recent transition, not a full history - enough to
    # place "you marked this Interviewing/Offer/Rejected" on the calendar
    # without a separate status-history table.
    status_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped["Job"] = relationship()


class CacheState(Base):
    """Singleton row (id=1) tracking when the shared Job cache was last
    refetched from the ATS boards - separate from each Job's own
    first_fetched_at, which must NOT change on refresh or the TTL check
    below would never see a "fresh" cache."""

    __tablename__ = "cache_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RunLog(Base):
    """One row per pipeline run - the funnel history the dashboard renders."""

    __tablename__ = "run_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running|done|failed
    # Which step a running pipeline is on right now - fetching -> filtering
    # -> screening -> drafting -> done, committed to the DB as each step
    # starts (see services/pipeline_service.py) so a polling client sees
    # real progress instead of a static "running" label with every funnel
    # number pinned at 0 until the whole run finishes.
    stage: Mapped[str] = mapped_column(String(20), default="starting")
    scanned: Mapped[int] = mapped_column(Integer, default=0)
    passed_filters: Mapped[int] = mapped_column(Integer, default=0)
    candidates: Mapped[int] = mapped_column(Integer, default=0)
    shortlisted: Mapped[int] = mapped_column(Integer, default=0)
    scorer: Mapped[str] = mapped_column(String(20), default="llm")
    error: Mapped[str | None] = mapped_column(Text)
