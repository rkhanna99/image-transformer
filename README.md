# Image Transformer Toolkit

Flask app for batch-friendly photo transformations: metadata overlays, palette bars, and white borders with print-ready aspect control.

## Features
- Metadata overlay generator (camera/lens/settings/GPS + custom photo name).
- Multi-image white-border generator with aspect ratio padding.
- Batch uploads with per-image options.
- Palette-aware QR code generator with optional manual colors and PNG/JPEG export.
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

2) Run the app with live reload (PowerShell):
```powershell
$env:DEV = "1"
python app.py
```

3) Open `http://127.0.0.1:5000`.

For a regular local server without live reload, set `$env:DEV = "0"` before starting. Hard refresh open browser tabs after switching modes so they use the current server's reload settings.

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
- `/qr-code` creates a QR code for an HTTP(S) URL; its optional reference image supplies colors only.
- Metadata and border upload endpoints create background jobs and return a `job_id`.
- The palette form generates its output directly and redirects to the completed job's results.
- Standalone and QR palettes group similar RGB shades from a thumbnail up to 256 pixels per side. Extraction tries ten deterministic K-means initializations, keeps the best fit, and orders swatches by sampled cluster frequency.
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

## QR code generator
Open `/qr-code`, enter an HTTP(S) destination, and optionally choose a reference image. The image is used only to extract dominant colors and is never included in the encoded URL or sent to the destination. Automatic color pairs use a conservative 7:1 contrast threshold; if the image palette cannot provide one, the tool uses black on white. PNG is the default export, with JPEG also available. Reference images are limited to 10 MB and 25 megapixels.

After generating, use **Customize colors** below the preview to pick foreground and background colors from the image palette or the color pickers. Click **Apply colors** to update the preview and download together. **Reset colors** restores the original generated pair for you to apply again. Downloads are disabled while edits are unapplied. Changing the destination, reference image, or format requires generating again before customizing.

Select the **checkerboard swatch** in the background palette for an RGBA PNG with a clear background and opaque QR modules, then click **Apply colors**. Applying transparency switches a JPEG selection to PNG; JPEG cannot preserve transparency. The checkerboard appears only in the preview. Select a solid background swatch or use the background color picker to return to an opaque background. The transparency swatch is also available without a reference image.

Manual color choices are always accepted when they are valid hex colors. Low contrast (below the recommended 7:1) or a light foreground on a dark background shows a warning without blocking generation or download. With transparency, contrast depends on the surface behind the code; test it on the final poster. The API accepts `transparent_background=true` for PNG and returns `transparent_background`, `contrast_ratio` (null for transparency), and an optional `warning` alongside the asset.

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
- Run the QR browser regression check with `node tests/qr_code_browser.cjs` (Node 22+ and Chrome). It checks native pointer selection and Apply, with and without an image palette. Set `CHROME_BIN` or `PYTHON` if the executables need explicit paths.

## Troubleshooting
- A Joblib physical-core warning on Windows can appear the first time an image palette is extracted in a server process (including a QR code with a reference image). Older Joblib versions try to run `wmic`, which may be unavailable. This project pins Joblib 1.5.3, which uses PowerShell CPU detection. Run `python -m pip install -r requirements.txt` and restart the server after updating dependencies.
- Repeated `GET /livereload` 404s mean a browser reload client is contacting a server without the live-reload endpoint. Start with `DEV=1` for live reload, or hard refresh all open app tabs after starting with `DEV=0`. The QR generation response is separate from these reload requests.

## Improvement backlog
See `project_notes/1-2-26_notes.md` for ideas and known gaps.
