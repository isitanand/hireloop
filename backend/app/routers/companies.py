from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..deps import get_current_user, get_db

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[schemas.CompanyOut])
def list_companies(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    excluded_ids = {
        e.company_id for e in
        db.query(models.UserCompanyExclusion).filter_by(user_id=user.id).all()
    }
    out = []
    for c in db.query(models.Company).order_by(models.Company.name).all():
        if c.is_global:
            included = c.id not in excluded_ids
        else:
            if c.added_by_user_id != user.id:
                continue  # another user's private addition - not visible to you
            included = True
        out.append(schemas.CompanyOut(
            id=c.id, ats=c.ats, slug=c.slug, name=c.name, is_global=c.is_global, included=included,
        ))
    return out


@router.post("", response_model=schemas.CompanyOut, status_code=201)
def add_company(
    body: schemas.CompanyCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(models.Company).filter_by(ats=body.ats, slug=body.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="that board is already tracked")
    company = models.Company(
        ats=body.ats, slug=body.slug, name=body.name,
        is_global=user.is_admin, added_by_user_id=None if user.is_admin else user.id,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return schemas.CompanyOut(
        id=company.id, ats=company.ats, slug=company.slug, name=company.name,
        is_global=company.is_global, included=True,
    )


@router.patch("/{company_id}", response_model=schemas.CompanyOut)
def toggle_company(
    company_id: int, body: schemas.CompanyToggle,
    user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Opt a global-list company in/out of your own search."""
    company = db.get(models.Company, company_id)
    if not company or not company.is_global:
        raise HTTPException(status_code=404, detail="company not found")

    existing = db.query(models.UserCompanyExclusion).filter_by(
        user_id=user.id, company_id=company_id).first()
    if body.included and existing:
        db.delete(existing)
    elif not body.included and not existing:
        db.add(models.UserCompanyExclusion(user_id=user.id, company_id=company_id))
    db.commit()
    return schemas.CompanyOut(
        id=company.id, ats=company.ats, slug=company.slug, name=company.name,
        is_global=company.is_global, included=body.included,
    )


@router.delete("/{company_id}", status_code=204)
def remove_company(
    company_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Remove a board you personally added. Global boards can only be
    opted out of (PATCH), not deleted, since other users may still want them."""
    company = db.get(models.Company, company_id)
    if not company or company.added_by_user_id != user.id:
        raise HTTPException(status_code=404, detail="company not found")
    db.delete(company)
    db.commit()
