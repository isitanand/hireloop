from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ------------------------------------------------------------------- auth --
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    is_admin: bool
    receive_email: bool
    auto_run_daily: bool
    created_at: datetime


class UserUpdate(BaseModel):
    name: str | None = None
    receive_email: bool | None = None
    auto_run_daily: bool | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# ---------------------------------------------------------------- profile --
class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    resume_filename: str | None
    parsed_json: dict[str, Any]
    updated_at: datetime


class ProfileUpdate(BaseModel):
    """Manual edits after resume extraction - the model can get things wrong."""
    parsed_json: dict[str, Any]


# ---------------------------------------------------------------- filters --
class FilterConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    include_titles: list[str]
    exclude_titles: list[str]
    locations: list[str]
    allow_remote: bool
    max_age_days: int | None
    score_threshold: float
    max_per_digest: int
    screen_batch_size: int


class FilterConfigUpdate(BaseModel):
    include_titles: list[str] | None = None
    exclude_titles: list[str] | None = None
    locations: list[str] | None = None
    allow_remote: bool | None = None
    max_age_days: int | None = None
    score_threshold: float | None = None
    max_per_digest: int | None = None
    screen_batch_size: int | None = None


# -------------------------------------------------------------- companies --
class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ats: str
    slug: str
    name: str
    is_global: bool
    included: bool  # resolved per-user: is this company in *your* search?


class CompanyCreate(BaseModel):
    ats: str = Field(pattern="^(greenhouse|lever|ashby)$")
    slug: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)


class CompanyToggle(BaseModel):
    included: bool


# ------------------------------------------------------------------- jobs --
class DraftOut(BaseModel):
    fit_summary: str = ""
    tailored_bullets: list[str] = []
    gaps: list[str] = []
    cover_note: str = ""
    questions_to_ask: list[str] = []


class UserJobOut(BaseModel):
    job_id: str
    ats: str
    company: str
    title: str
    location: str
    url: str
    description: str
    posted_at: str | None
    salary: str | None
    score: float | None
    reason: str | None
    draft: dict[str, Any]
    status: str
    first_seen_at: datetime
    emailed: bool
    applied_at: datetime | None
    status_updated_at: datetime | None


JOB_STATUSES = "new|shortlisted|applied|interviewing|offer|rejected|dismissed"


class MarkAppliedRequest(BaseModel):
    status: str = Field(default="applied", pattern=f"^({JOB_STATUSES})$")


class ManualJobCreate(BaseModel):
    company: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=500)
    location: str = Field(default="", max_length=255)
    url: str = Field(default="", max_length=1000)
    description: str = ""
    status: str = Field(default="applied", pattern=f"^({JOB_STATUSES})$")


class ClearHistoryPreview(BaseModel):
    clearable: int
    runs: int


class StatsOut(BaseModel):
    tracked: int
    shortlisted: int
    applied: int
    interviewing: int
    offer: int
    rejected: int
    dismissed: int


# --------------------------------------------------------------- pipeline --
class RunLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    stage: str
    scanned: int
    passed_filters: int
    candidates: int
    shortlisted: int
    scorer: str
    error: str | None


class RunRequest(BaseModel):
    scorer: str = Field(default="llm", pattern="^(llm|keyword)$")
    send_email: bool = False
