from __future__ import annotations

from typing import Generator

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import SessionLocal
from .security import decode_token


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthorized
    token = authorization.split(" ", 1)[1].strip()
    email = decode_token(token)
    if not email:
        raise unauthorized
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise unauthorized
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user


def verify_admin_secret(x_admin_secret: str | None = Header(default=None)) -> None:
    """Guards POST /admin/run-scheduled - called by the GitHub Actions cron,
    not by a logged-in user, so it authenticates with a shared secret instead
    of a JWT."""
    if not x_admin_secret or x_admin_secret != settings.admin_run_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="bad admin secret")
