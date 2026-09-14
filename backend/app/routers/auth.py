from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db
from ..security import create_access_token, hash_password, verify_password
from .filters import DEFAULT_EXCLUDE_TITLES, DEFAULT_INCLUDE_TITLES

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: schemas.RegisterRequest, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=400, detail="an account with this email already exists")

    is_first_user = db.query(models.User).count() == 0
    user = models.User(
        email=body.email, hashed_password=hash_password(body.password),
        name=body.name, is_admin=is_first_user,
    )
    db.add(user)
    db.flush()  # assign user.id before FK rows reference it
    db.add(models.FilterConfig(
        user_id=user.id, include_titles=DEFAULT_INCLUDE_TITLES,
        exclude_titles=DEFAULT_EXCLUDE_TITLES, locations=[],
    ))
    db.commit()
    return schemas.TokenResponse(access_token=create_access_token(user.email))


@router.post("/login", response_model=schemas.TokenResponse)
def login(body: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="incorrect email or password")
    return schemas.TokenResponse(access_token=create_access_token(user.email))


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=schemas.UserOut)
def update_me(
    body: schemas.UserUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: schemas.ChangePasswordRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
