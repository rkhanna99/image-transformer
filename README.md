# Image Transformer Toolkit

Flask app for batch-friendly photo transformations: metadata overlays, palette bars, and white borders with print-ready aspect control.

## Features
- Metadata overlay generator (camera/lens/settings/GPS + custom photo name).
- Multi-image white-border generator with aspect ratio padding.
- Batch uploads with per-image options.
- Palette extraction (7-color bar) appended to output.
- Standalone color palette generator: choose 1–32 dominant colors and download square tiles as a PNG.
  Fully transparent pixels are ignored; images with fewer colors produce fewer tiles.
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

The development compose file maps host port `55000` to container port `5000`.
Open `http://localhost:55000`. See `run-config.md` for production settings.

## How it works
- `/` is the tool chooser.
- `/metadata` uploads images for metadata overlays.
- `/border` uploads images for white borders.
- `/palette` uploads an image and a color count for a standalone palette.
- Metadata and border upload endpoints create background jobs and return a `job_id`.
- The palette form generates its output directly and redirects to the completed job's results.
- Results render in `/results/<job_id>` and poll `/api/jobs/<job_id>` until processing completes.

## Endpoint payloads
All processing endpoints accept `multipart/form-data` because files are uploaded with the request.
The preferred contract is a `payload` form field containing JSON.

`POST /process-image`
```json
{
  "address": "Oeschinensee, Switzerland",
  "latitude": "46.4975",
  "longitude": "7.7149",
  "photoName": "Lake Oeschinensee",
  "aspectRatio": "Default",
  "customAspectRatio": null
}
```

`POST /process-images`
```json
{
  "images": [
    {
      "address": "Zermatt, Switzerland",
      "latitude": null,
      "longitude": null,
      "photoName": "Matterhorn",
      "aspectRatio": "4:5",
      "customAspectRatio": "4:5"
    }
  ]
}
```

`POST /white-border`
```json
{
  "borderSize": 12,
  "aspectRatio": "3:2"
}
```

The legacy flat form fields are still accepted as a fallback.

## Project layout
- `app.py` - Flask entrypoint and routes.
- `processing_scripts/` - Core image processing pipeline and helpers.
- `services/` - Upload + processing orchestration.
- `templates/` - HTML views.
- `static/` - JS/CSS and runtime uploads.
- `tests/` - Palette regression tests and experimental scripts.

## Configuration notes
- Uploaded inputs and outputs are stored per job under `static/uploads/jobs/<job_id>/`.
- Job metadata is stored in `data/jobs/<job_id>.json`.
- Set `SECRET_KEY` in production; local development falls back to a placeholder.
- Geocoding uses Nominatim via `geopy` and can be rate-limited.

## Usage tips
- Metadata overlay accepts either an address or explicit latitude/longitude.
- `Default` aspect ratio uses the image's intrinsic aspect.
- Use `Custom` ratio as `W:H` (e.g., `3:2`).

## Known limitations
- EXIF can be missing or incomplete; some metadata fields may be blank.
- Background execution currently uses an in-process thread pool for local development.
- Jobs do not survive a full app restart while running; interrupted jobs are marked failed on next boot.
- Uploaded files still live on the web node filesystem; move to object storage for production.
- Run palette regression tests with `python -m unittest discover -s tests -p test_color_palette.py`.
  Other test scripts require local images or network access; CI is not configured.

## Improvement backlog
See `project_notes/1-2-26_notes.md` for ideas and known gaps.
