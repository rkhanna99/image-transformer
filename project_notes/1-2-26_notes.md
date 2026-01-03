# Image Transformer Toolkit Project Notes (1/2/2026)

## Overview
- Stack: Flask app (`app.py`), PIL/Piexif/GeoPy/Pylette processing (`processing_scripts`), UI via Bootswatch/Bootstrap + vanilla JS, assets in `static/`, views in `templates/`.
- Capabilities: single/multi-image metadata overlays, multi-image white-border generator, downloads (single or zip), live-reload dev server.

## Application entrypoint (app.py)
- Configures Flask, static/templates, session secret, upload dir `static/uploads` (cleaned on start/exit via `cleanup_directory`).
- Routes:
  - `/` renders `templates/home.html` (tool chooser).
  - `/metadata` -> metadata overlay form (`upload.html`).
  - `/border` -> border form (`border.html`).
  - `/process-image` single upload -> `services/image_upload_service.process_metadata_overlay`, stores processed path in session, redirects to `/results`.
  - `/process-images` multi-upload variant; iterates files and per-index form fields, stores multiple results in session.
  - `/white-border` multi-upload border handler; parses aspect ratio, generates bordered images with `create_simple_border`, stores results in session.
  - `/results` renders `templates/results.html` with one or many processed URLs; handles back navigation to the correct form.
  - `/download/<filename>` and `/download-all` stream single or zipped results from `static/uploads`.
- Dev server: Livereload watches templates/static; disables cache for development.

## Image processing core (processing_scripts/)
- `helpers.py`:
  - Metadata: `get_image_metadata` (EXIF + optional GPS injection via piexif; shutter speed normalization; timezone adjustment using `timezonefinder` and `pytz`), `format_shutter_speed`, `change_timezone`.
  - Text rendering: `calculate_font_size`, `adjust_line_font` to prevent overlap, `generate_metadata_image` builds a 2-line overlay with camera/lens/settings/GPS/name.
  - Geometry/aspect tools: `get_aspect_ratio`, `calculate_padding_for_aspect_ratio`, `get_proportions` (scale values vs reference dimensions), `best_aspect_ratios_for_padding`, `setup_print_padding`.
  - Color palette: `get_palette_dimensions`, `local_display` override for Pylette palette rendering.
  - I/O: `save_image` (user-interactive overwrite logic), `cleanup_directory`.
  - Bordering: `create_simple_border` mirrors JS preview logic—uniform border then aspect padding to target ratio.
  - GPS utils: `get_coordinates_from_address` (Nominatim), `format_gps_decimal`, `to_dms`, `dms_to_decimal`.
  - Misc: `to_float` for safe parsing.
- `image_transformer.py`:
  - Overrides `Palette.display` with `local_display`.
  - `process_image(...)`: opens + transpose image, extracts metadata (optional GPS), builds metadata overlay, extracts 7-color palette, stacks overlay + image + palette, adds borders (either print-mode via `setup_print_padding` or constant border), optional local save, returns final PIL image.
  - CLI guard shows example usage.

## Upload/processing service (services/image_upload_service.py)
- `process_metadata_overlay(file, form, upload_folder)`:
  - Saves upload with uuid prefix.
  - Resolves lat/long (address geocode fallback), aspect ratio parsing (`Default` -> intrinsic, `Custom` -> `W:H`, other predefined values).
  - Calls `process_image`, saves output as `processed_<uuid>_name`, returns path; errors logged.

## Frontend templates (templates/)
- `home.html`: Two cards linking to Metadata Overlay and Border Creator; includes fade-in/out navigation transitions.
- `upload.html`: Multi-image carousel form (per-image address/GPS/name/aspect fields), dropzone, loading screen; powered by `static/js/script.js`.
- `border.html`: Multi-image dropzone/canvas preview, border slider, aspect dropdown, loading screen; powered by `static/js/border.js`.
- `results.html`: Displays carousel of processed images with per-image download and bulk download; driven by `static/js/results.js`.

## Frontend scripts (static/js/)
- `script.js`: Manages multi-image form carousel, per-image aspect options based on orientation, drag/drop, previews, unified submit to `/process-image` (single) or `/process-images` (multi), loading screen, reset logic.
- `border.js`: Multi-image carousel for border tool, canvas preview replicating Python border math, aspect dropdown (with custom), drag/drop, slider updates, submit to `/white-border`, loading handling, reset.
- `results.js`: Carousel controller for results page; blob URL caching + preloading, keyboard nav, download links (single/zip), beforeunload cleanup.

## Styles (static/css/styles.css)
- Layout for dropzones, canvas container, aspect-ratio dropdown alignment, buttons, loading overlay, responsive tweaks.

## Deployment
- `Dockerfile` builds Python 3.11 slim image, installs `requirements.txt`, runs `python app.py` with livereload.
- `docker-compose.yml` builds service, binds dynamic host port to 5000, mounts project and uploads for persistence, dev flags set.
- `requirements.txt` pins imaging (Pillow), EXIF, geocoding/timezone, palette extraction, ML stack (scikit-learn dependencies unused currently), livereload.

## Improvement opportunities
- Error handling & UX:
  - Add user-facing error flashes for processing failures instead of silent redirects (`app.py` routes and JS fetch handlers).
  - Validate form inputs on client and server (aspect ratio format, lat/long numeric) to cut down on exceptions.
- Stability:
  - Guard EXIF access in `get_image_metadata` when `_getexif()` is None; avoid key errors on missing tags.
  - Nominatim requests need rate limiting and error handling; consider cached geocoder or offline fallback.
- Security:
  - Move `app.secret_key` to env var; filter uploaded MIME types; limit file size; randomize upload paths per session to avoid guessing.
- Performance:
  - Avoid writing palette to disk (`color_palette.jpg`)—use in-memory stream.
  - Consider background processing for large batches (RQ/Celery) and async status polling instead of session storage.
- Code quality:
  - Add unit tests for helpers (`tests/` scaffold exists) and integration tests for routes.
  - Remove interactive `save_image` prompt or guard for headless environments.
  - Deduplicate aspect-ratio option generation shared between `border.js` and `script.js`.
- Operations:
  - Docker Compose currently exposes random host port (`"0:5000"`); pin to `5000:5000` for clarity or use env var.
  - Add `.env` sample and config validation.

## Potential future functionality
1) Batch jobs with queue + progress UI (websocket/SSE) for large uploads.
2) Additional overlays: histograms, focus peaking masks, lens corrections preview.
3) Palette theming: export palette as swatches/ASE/GPL; allow palette-based border colors instead of white.
4) Template editor: choose overlay layouts, fonts, colors, watermark placement.
5) Cloud storage targets: upload/download to S3/GCS, presigned URLs; make uploads stateless.
6) Mobile-friendly capture: PWA with on-device EXIF extraction and offline queueing, then sync.
7) CLI/SDK wrapper to run `process_image` headlessly for automation.
8) Auto aspect suggestion: recommend print sizes based on `best_aspect_ratios_for_padding` output with UI display.

