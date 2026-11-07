from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/filters", tags=["filters"])

# Sensible starting point for a freshly registered student (an empty include
# list matches EVERY title in jobhunt.prefilter, which is a confusing first
# run). Deliberately broader than the CLI's own config.yaml, which is tuned
# to one backend-focused persona (see profile.example.json) - a web signup
# pool spans every specialization, so the default here covers frontend,
# backend, full-stack and SRE/platform titles alike. Each user narrows this
# from Settings once they see their first shortlist.
DEFAULT_INCLUDE_TITLES = [
    r"\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web)\b.*\b(developer|engineer)\b",
    r"\b(developer|engineer)\b.*\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web)\b",
    r"\bsde\b", r"\bsde\s*-?\s*(i{1,3}|[123])\b",
    "software development engineer", "software engineer", "full stack developer",
    "frontend developer", "backend developer", "web developer", "react developer",
    r"\bsite reliability engineer\b", r"\bsre\b.*\bengineer\b",
    # Students/new grads are a big share of the signup pool and their target
    # titles ("Software Engineering Intern", "New Grad SWE") don't reliably
    # contain a bare "developer"/"engineer" token the patterns above catch -
    # "Engineering" != "Engineer" under \b matching. These require BOTH the
    # level word AND a software/engineering signal in the same title - a
    # bare r"\bintern\b" alone matched "Video Editor Intern" and "YouTube &
    # Content Intern" just as happily as "Software Engineer Intern", which
    # is exactly the false-positive this is meant to avoid.
    r"\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web|swe)\b.*\bintern(?:ship)?\b",
    r"\bintern(?:ship)?\b.*\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web|engineer|developer)\b",
    r"\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web|swe)\b.*\bnew[ -]?grad(?:uate)?\b",
    r"\bnew[ -]?grad(?:uate)?\b.*\b(software|backend|back-end|full[ -]?stack|frontend|front-end|web|engineer|developer)\b",
]
DEFAULT_EXCLUDE_TITLES = [
    r"\b(staff|principal|distinguished|fellow|architect)\b",
    # "Sr." / "Sr" is the same seniority level as "Senior" but a bare
    # \bsenior\b never matches the abbreviation, letting "Sr. Software
    # Engineer" postings straight through the filter meant to stop them.
    r"\b(senior|sr\.?)\b",
    r"\b(director|vp|vice president|head of|chief|cto)\b", r"\b(manager|management)\b",
    r"\b(sales|account executive|marketing|recruit|support|success)\b",
]


def _ensure(user: models.User, db: Session) -> models.FilterConfig:
    if not user.filter_config:
        fc = models.FilterConfig(
            user_id=user.id, include_titles=DEFAULT_INCLUDE_TITLES,
            exclude_titles=DEFAULT_EXCLUDE_TITLES, locations=[],
        )
        db.add(fc)
        db.commit()
        db.refresh(user)
    return user.filter_config


@router.get("", response_model=schemas.FilterConfigOut)
def get_filters(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _ensure(user, db)


@router.put("", response_model=schemas.FilterConfigOut)
def update_filters(
    body: schemas.FilterConfigUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fc = _ensure(user, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(fc, field, value)
    db.commit()
    db.refresh(fc)
    return fc
