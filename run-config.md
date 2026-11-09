Run and Deployment Guide

This repository contains a Flask-based image processing app. This document describes recommended development and production run conventions, Docker usage, and quick commands.

Development (local / with live reload)

- Use a virtualenv locally:

  ```bash
  python -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  DEV=1 python app.py
  ```

  On Windows PowerShell, use:

  ```powershell
  .\venv\Scripts\Activate.ps1
  $env:DEV = "1"
  python app.py
  ```

  The app enables live reload when `DEV=1` or, when `DEV` is unset, `FLASK_ENV=development`. With neither set, `python app.py` starts the regular Flask server. Startup logs identify the active mode. Hard refresh open app tabs after switching modes to remove any previous live-reload client.

- Using Docker (development):

  - Compose (development) mounts the source and uploads directory for quick iteration. It maps host port `55000` to container port `5000`.

  ```bash
  docker compose up --build
  # then open http://localhost:55000
  ```

  - The development compose file sets `DEV=1` and runs `python app.py` so the live-reload server is used inside the container. The production override explicitly runs Gunicorn.

Production (recommended)

- Use a WSGI server (Gunicorn) to run the Flask app, not the livereload server.

  - Build the image and run with Docker (production):

  ```bash
  # build
  docker build -t image-transformer:latest .

  # run (example)
  docker run -d --name image_transformer_prod -p 5000:5000 \
    -e SECRET_KEY="<replace-with-secure-value>" \
    image-transformer:latest
  ```

  - Or use the production compose override:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
  ```

- The default image CMD uses `gunicorn app:app --bind 0.0.0.0:5000 --workers 4`.

Configuration and secrets

- Use environment variables for configuration:
  - `SECRET_KEY` — set to a secure random value in production.
  - `DEV` — set to `1`/`true` for development to enable livereload. Default in compose dev file is `DEV=1`.
  - `HOST`, `PORT` — override host/port when running locally via `python app.py`.

- Do not commit secrets. Use `.env` files (gitignored), Docker secrets, or your orchestration platform's secret store.

Docker image best practices applied

- Gunicorn installed and used as the default process for production runs.
- Non-root user created in the image for improved security.
- `static/uploads` is expected to be mounted as a volume in development; for production, consider mounting persistent storage or using object storage (S3).
- Added `docker-compose.prod.yml` with a healthcheck and no source mounts.

Checklist before production

- [ ] Set a secure `SECRET_KEY` via env or secrets.
- [ ] Disable any debug/logging verbose levels.
- [ ] Configure persistent storage for uploads.
- [ ] Add TLS and reverse proxy (nginx) if exposing publicly.
- [ ] Add monitoring, logging, and automated deploys/CI.
