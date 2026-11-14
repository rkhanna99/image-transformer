# Run and Deployment Guide

## Local development

Use Python 3.11 for Flask and Node 22 with pnpm 10.34.3 for the React client.

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DEV=0 TOOLKIT_RELOAD=1 python app.py
```

In a second terminal:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. Vite proxies to `TOOLKIT_BACKEND_URL`, defaulting to `http://127.0.0.1:5000`. If Flask runs in the development Compose service, set `TOOLKIT_BACKEND_URL=http://127.0.0.1:55000`. Flask uses `DEV=0`; Vite provides frontend reloads without adding Flask's live-reload script to the SPA.

For backend-only Docker development, `docker compose up --build` exposes Flask at `http://localhost:55000`. Run Vite on the host to work on the UI. The development service enables `TOOLKIT_RELOAD=1` for Python source reloads without the livereload script or debugger. Apply Compose configuration changes with `docker compose up -d`. If `TOOLKIT_RELOAD` is disabled, restart Flask after backend edits; Vite reloads frontend code only. Production does not enable Python reload.

## Production

The production Docker build compiles the UI with Node 22, copies the bundle into the Python runtime, and runs Gunicorn with one worker and four threads. One worker/replica is required by the current in-process job queue.

Run production independently from the development Compose file:

```sh
docker compose -f docker-compose.prod.yml up --build -d
```

The production Compose service persists `/app/data/jobs` and `/app/static/uploads` in separate named volumes. This leaves the compiled bundle in `/app/static/ui` visible. Check health with `docker compose -f docker-compose.prod.yml ps` and logs with `docker compose -f docker-compose.prod.yml logs -f`.

For isolated development and tests, set `TOOLKIT_JOB_STORE` and `TOOLKIT_UPLOAD_ROOT` to separate writable directories. The defaults are `data/jobs` and `static/uploads/jobs` under the project root. The Flask test modules use temporary directories for both paths before importing the app.

For non-Compose deployments, mount persistent storage at those same two paths and run exactly one application replica. Set `SECRET_KEY` through the deployment environment when Flask sessions are used. Do not mount the repository root over `/app` in production.
