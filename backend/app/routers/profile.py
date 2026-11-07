from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from jobhunt import llm
from jobhunt.providers import LLMError, ProviderBusy, resolve, resolve_backup

from .. import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/profile", tags=["profile"])
log = logging.getLogger(__name__)

ALLOWED_SUFFIXES = {".pdf", ".txt", ".md"}
MAX_RESUME_BYTES = 8 * 1024 * 1024  # 8MB
_CONTENT_TYPES = {".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown"}


def _extract_profile(body: bytes, is_pdf: bool) -> dict:
    """Resume -> profile dict via the primary LLM provider. If that fails and a
    backup provider is configured (LLM_BACKUP_PROVIDER), try it before giving
    up. When both fail the *primary's* error is raised - it is the one that
    says what is wrong with the main setup."""
    def attempt(provider, model) -> dict:
        return llm.build_profile(
            resume_bytes=body if is_pdf else None,
            resume_text=None if is_pdf else body.decode("utf-8", errors="replace"),
            is_pdf=is_pdf, provider=provider, model=model,
        )

    provider, model = resolve("draft")
    try:
        return attempt(provider, model)
    except (LLMError, ValueError) as primary_error:
        log.warning("resume parsing failed on %s: %s", provider.name, primary_error)
        try:
            backup = resolve_backup("draft")
        except LLMError as e:
            log.warning("LLM_BACKUP_PROVIDER is set but unusable: %s", e)
            backup = None
        if backup is None:
            raise primary_error
        try:
            profile = attempt(*backup)
        except (LLMError, ValueError) as backup_error:
            log.warning("resume parsing failed on backup %s too: %s", backup[0].name, backup_error)
            raise primary_error from None
        log.warning("resume parsed by backup provider %s after %s failed", backup[0].name, provider.name)
        return profile


@router.get("", response_model=schemas.ProfileOut)
def get_profile(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.profile:
        raise HTTPException(status_code=404, detail="no profile yet - upload a resume")
    return user.profile


@router.post("/resume", response_model=schemas.ProfileOut)
async def upload_resume(
    resume: UploadFile,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suffix = Path(resume.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="resume must be .pdf, .txt or .md")

    body = await resume.read()
    if len(body) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=400, detail="resume too large (max 8MB)")

    try:
        parsed = _extract_profile(body, is_pdf=suffix == ".pdf")
    except ProviderBusy:
        # Already retried (and, if configured, tried the backup provider) - the
        # raw provider error is noise to an end user and is in the server log.
        raise HTTPException(
            status_code=503,
            detail="our AI service is busy right now (try uploading again in a minute)",
        ) from None
    except (LLMError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"resume extraction failed: {e}") from None

    if user.profile:
        user.profile.resume_filename = resume.filename
        user.profile.resume_bytes = body
        user.profile.parsed_json = parsed
    else:
        db.add(models.Profile(
            user_id=user.id, resume_filename=resume.filename,
            resume_bytes=body, parsed_json=parsed,
        ))
    db.commit()
    db.refresh(user)
    return user.profile


@router.get("/resume")
def download_resume(user: models.User = Depends(get_current_user)):
    """Retrieve the originally uploaded resume file, stored in the DB
    (see Profile.resume_bytes) rather than on disk."""
    if not user.profile or not user.profile.resume_bytes:
        raise HTTPException(status_code=404, detail="no resume file on record")
    suffix = Path(user.profile.resume_filename or "").suffix.lower()
    content_type = _CONTENT_TYPES.get(suffix, "application/octet-stream")
    filename = user.profile.resume_filename or "resume"
    return Response(
        content=user.profile.resume_bytes, media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("", response_model=schemas.ProfileOut)
def update_profile(
    body: schemas.ProfileUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create or correct the profile by hand.

    This is also the fallback onboarding path when no LLM provider is
    configured (or resume extraction fails): the profile is just JSON in the
    shape jobhunt.llm.build_profile() produces, and a user can type it in
    directly instead of uploading a resume. Upsert, not update-only, so that
    path works for a brand-new user with no `profile` row yet.
    """
    if user.profile:
        user.profile.parsed_json = body.parsed_json
    else:
        db.add(models.Profile(user_id=user.id, parsed_json=body.parsed_json))
    db.commit()
    db.refresh(user)
    return user.profile
