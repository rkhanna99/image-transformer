# Image Transformer Toolkit

Flask app for batch-friendly photo transformations: metadata overlays, palette bars, and white borders with print-ready aspect control.

## Features
- Metadata overlay generator (camera/lens/settings/GPS + custom photo name).
- Multi-image white-border generator with aspect ratio padding.
- Batch uploads with per-image options.
- Palette extraction (7-color bar) appended to output.
- Single or bulk ZIP downloads.
- Live-reload development server.

## Quick start (local)
1) Create a virtualenv and install deps:
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

2) Run the app:
```bash
python app.py
```

3) Open `http://127.0.0.1:5000`.

## Docker
```bash
docker compose up --build
```

The compose file maps host port dynamically (`"0:5000"`). Check the assigned port with:
```bash
docker ps
```
If you prefer a fixed port, change it to `"5000:5000"` in `docker-compose.yml`.

## How it works
- `/` is the tool chooser.
- `/metadata` uploads images for metadata overlays.
- `/border` uploads images for white borders.
- Results render in `/results` with single or bulk download options.

## Project layout
- `app.py` - Flask entrypoint and routes.
- `processing_scripts/` - Core image processing pipeline and helpers.
- `services/` - Upload + processing orchestration.
- `templates/` - HTML views.
- `static/` - JS/CSS and runtime uploads.
- `tests/` - Experimental scripts (not a full test suite).

## Configuration notes
- Uploads are stored in `static/uploads` and cleaned on startup and exit.
- `app.secret_key` is hard-coded for now; move to an env var for production.
- Geocoding uses Nominatim via `geopy` and can be rate-limited.

## Usage tips
- Metadata overlay accepts either an address or explicit latitude/longitude.
- `Default` aspect ratio uses the image's intrinsic aspect.
- Use `Custom` ratio as `W:H` (e.g., `3:2`).

## Known limitations
- EXIF can be missing or incomplete; some metadata fields may be blank.
- Long-running batch processing is synchronous and can be slow for large sets.
- Tests are not automated; add a test harness if you need CI.

## Improvement backlog
See `project_notes/1-2-26_notes.md` for ideas and known gaps.
