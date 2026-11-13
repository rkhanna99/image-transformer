# Image Processing Toolkit

A Flask image-processing service with a React workspace for metadata compositions, white print borders, dominant-color palettes, and QR code generation. The browser submits original files to the existing image-processing backend; generated previews and downloads come from backend output files.
See [IMPLEMENTATION_HANDOFF.md](IMPLEMENTATION_HANDOFF.md) for the detailed frontend/backend contracts and safe test guidance.

## Local development

Use Python 3.11 and Node 22. Install the Python requirements and start Flask:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DEV=0 python app.py
```

In another terminal, use pnpm 10.34.3:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:5173`. Vite proxies backend requests to `TOOLKIT_BACKEND_URL`, defaulting to `http://127.0.0.1:5000`. When using the development Compose service instead, set `TOOLKIT_BACKEND_URL=http://127.0.0.1:55000`. Frontend edits use Vite reload; Flask runs with `DEV=0` to avoid injecting its live-reload script into the React page.

Build the frontend for Flask with `cd frontend && pnpm build`; Vite writes the production bundle to `static/ui/`. Flask serves it at `/`, `/metadata`, `/border`, `/palette`, `/qr-code`, and `/results/<job_id>`. If the bundle is missing, those routes return HTTP 503.

## Docker

For development, `docker compose up --build` starts only Flask at `http://localhost:55000`; run Vite on the host as above.

For a standalone production deployment, use the independent production Compose file:

```sh
docker compose -f docker-compose.prod.yml up --build -d
```

It builds the React assets in a Node 22 stage and serves them from the Python runtime with one Gunicorn worker and four request threads. Named volumes persist job records and uploaded/generated files across container recreation. One application replica is required by the current in-process job queue.

## Processing API

Uploads use multipart requests. The React client puts structured settings in a JSON `payload` form field and leaves multipart boundary generation to the browser. Metadata and border operations return HTTP 202 job records; clients poll their `status_url` while queued/running. Palette generation is synchronous at `POST /api/palette` and returns a completed job with swatch hex values and cluster frequencies. QR generation is synchronous at `POST /api/qr-code` and returns the generated image data URL and selected colors. Existing download and job-status routes remain available.

Metadata and border settings accept positive `W:H` ratios, as well as `Default`. Metadata requires an address or both latitude and longitude; explicit coordinates take precedence. Border size is an integer from 0 to 50. Palette extraction supports 1–32 colors, ignores fully transparent pixels, samples a thumbnail up to 256 pixels per side, and uses ten deterministic K-means initializations ordered by cluster frequency. QR reference images remain limited to 10 MB and 25 megapixels.

The React workspace starts empty, retains uploaded browser files until removed, and submits processing only from explicit Generate actions. Completed jobs remain available at their result URLs after refresh; browser upload drafts are session state and are not restored from a saved job.

## Checks

Run the Python regression suite after installing `requirements.txt`:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
```

The job and QR API test modules set `TOOLKIT_JOB_STORE` and `TOOLKIT_UPLOAD_ROOT` to temporary directories before importing Flask, so test jobs never enter the local job store. The optional Chrome workflow uses the built UI and needs Node 22 and Chrome:

```sh
cd frontend && pnpm build
cd ..
node tests/qr_code_browser.cjs
```

The browser check starts Flask with temporary job and upload storage. To check an already running disposable server, set `TOOLKIT_BASE_URL` to its local URL.
