FROM python:3.12-slim

WORKDIR /srv

# jobhunt/ (the pipeline package) and companies.yaml live one level up from
# backend/ in the repo - copy the whole project so `import jobhunt` and the
# seed script both work unmodified.
COPY jobhunt/ ./jobhunt/
COPY companies.yaml ./companies.yaml
COPY backend/ ./backend/

RUN pip install --no-cache-dir -r backend/requirements.txt

WORKDIR /srv/backend
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["sh", "-c", "python seed_companies.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
