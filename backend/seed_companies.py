"""Seed the shared `companies` table from the repo's companies.yaml.

Run once after the database is created:

    python backend/seed_companies.py

Safe to re-run - existing (ats, slug) pairs are skipped, so it only adds
new boards.
"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import models  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402

COMPANIES_YAML = Path(__file__).resolve().parent.parent / "companies.yaml"


def main() -> None:
    init_db()
    data = yaml.safe_load(COMPANIES_YAML.read_text(encoding="utf-8")) or {}
    entries = data.get("companies") or []

    db = SessionLocal()
    added = 0
    try:
        for e in entries:
            exists = db.query(models.Company).filter_by(ats=e["ats"], slug=e["slug"]).first()
            if exists:
                continue
            db.add(models.Company(ats=e["ats"], slug=e["slug"], name=e.get("name", e["slug"]),
                                   is_global=True, added_by_user_id=None))
            added += 1
        db.commit()
    finally:
        db.close()

    print(f"seeded {added} new companies ({len(entries)} in companies.yaml)")


if __name__ == "__main__":
    main()
