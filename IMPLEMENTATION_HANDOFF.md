# Frontend integration handoff

This repository now serves the Figma redesign as a React SPA and retains Flask as the processing authority. The frontend source is in `frontend/`; Flask APIs and existing output builders remain the source of truth for image composition, palettes, QR colors, status, and downloads. Use this note when reviewing follow-up work or splitting future implementation tasks.

## Runtime layout and navigation

- `frontend/src/App.tsx` owns route selection, uploaded-source state, per-tool settings, result correlation, and the main workspace composition.
- `frontend/src/lib/toolkitApi.ts` is the typed HTTP boundary. It creates multipart forms but never sets `Content-Type`; the browser must add the multipart boundary.
- `frontend/src/types/toolkit.ts` defines source, metadata, job, palette, and QR response structures. The uploaded `File` stays in browser state and is submitted unchanged.
- `frontend/src/components/ToolControls.tsx` contains shared generation and aspect-ratio controls.
- `frontend/src/components/ThreeToolInspector.tsx` only displays a returned raster in the retained print view. The Three.js canvas is a texture bridge; it does not generate the downloaded file.
- Flask serves the production shell for `/`, `/metadata`, `/border`, `/palette`, `/qr-code`, and `/results/<job_id>`. Unknown paths are not rewritten to the SPA. If `static/ui/index.html` is absent, known shell paths return 503.
- Vite uses `/` as its development base, `/static/ui/` as its production base, writes to `static/ui/`, listens on port 5173, and proxies API, processing, static-upload, and download paths to `TOOLKIT_BACKEND_URL` (default `http://127.0.0.1:5000`). Use port 55000 for the current development Compose backend.
- Development Compose sets `TOOLKIT_RELOAD=1` to restart the serving Python process when imported source files change, while `DEV=0` avoids injecting browser scripts. The Werkzeug reloader parent skips interrupted-job recovery; its serving child performs recovery normally. The flag defaults off and has no effect on production WSGI startup. Without it, restart Flask after backend edits even when the React controls have hot-reloaded.

## Source and generated state

A workspace source is `{ id, file, previewUrl, name, fileSizeBytes, width, height, metadataDraft }`. IDs are generated per browser upload; filenames are display labels only and must never be used to associate a response with an upload. Dimensions come from real browser decoding and remain null when decoding fails. Failed previews show a placeholder while preserving the original file for backend submission.

The single ingestion function serves file-picker uploads, paste, and drag/drop. It creates one object URL per source. Removing a source revokes that URL and removes associated artifacts; unmount revokes remaining URLs. The workspace begins empty and can remain empty after removals. No example photographs, metadata, dimensions, camera fields, synthetic locations, or local fallback compositions are used as source data.

Generated output records are separate from source records and indexed by tool and source ID. Metadata and border requests capture settings at submission time. Their result fingerprints decide whether a retained preview is current; editing settings leaves the previous output visible but disables downloads until the current settings have been generated. A finished batch is associated by each output's `client_image_id`. Removing an image during a job prevents that image from being restored when the response arrives. Metadata settings are per image; border settings are shared by the submitted border job.

Uploading, editing fields, selecting another image, switching tools, and changing preview mode do not submit work. Only Generate actions submit processing. The backend reports job-wide queued/running/succeeded/failed status and does not report per-item progress, so the UI does not invent a percentage.

## Processing API contracts

All file operations use `FormData` and preserve the original file bytes. JSON settings are encoded in a `payload` part.

### Metadata, one source

`POST /process-image` includes `image: File` and:

```json
{
  "clientImageId": "opaque-client-id",
  "address": "Zermatt, Switzerland",
  "latitude": null,
  "longitude": null,
  "photoName": "Matterhorn",
  "aspectRatio": "DEFAULT",
  "customAspectRatio": null,
  "overlayStyle": "original",
  "themeTone": "linen-light",
  "showGpsCoordinates": true,
  "showColorStrip": true
}
```

`DEFAULT` is normalized to the backend's `Default`. For a custom ratio, send `aspectRatio: "Custom"` and the actual value such as `customAspectRatio: "21:9"`. Every image needs an address or a complete coordinate pair. Explicit coordinates take precedence; zero coordinates are valid.

Design settings are per image. `overlayStyle` accepts `original`, `card`, `overlay`, or `film`; `themeTone` accepts `linen-light` or `slate-dark`. Missing design fields default to Original/light/GPS shown/palette shown, preserving legacy requests. Visibility fields require actual booleans in JSON and `true`/`false` strings in legacy forms. Legacy batches accept indexed design field names such as `overlayStyle[0]`. Invalid options are rejected before job creation. `showGpsCoordinates` hides numeric coordinate annotations only, retaining the entered place label and location processing.

`processing_scripts.metadata_renderers` owns a pure function dispatch and the `MetadataRenderOptions`/`MetadataRenderContext` types. The existing `process_image` entry point prepares the oriented full-resolution image and EXIF, chooses a renderer, then applies print padding. Card/Overlay/Film port the Figma geometry in proportion to a 1200px reference width, use six deterministic dominant colors, and omit fabricated or missing metadata. Original retains its Times header, seven-color extraction, and default sizing; hiding its palette reclaims the palette strip and its spacing. The deterministic palette extractor lives in `processing_scripts.color_palette` and remains importable from the upload service for compatibility.

No metadata style crops or resizes the source photo. With `Default`, Card/Film keep their photo-plus-frame dimensions and Overlay keeps the source dimensions. Explicit ratios pad the completed composition using the export background. Original's `Default` retains source-photo-ratio print padding. Export appearance is independent of the UI theme. New-style fonts and their licenses are bundled under `fonts/`; renderers do not fetch fonts at runtime.

### Metadata batch

`POST /process-images` includes repeated `images: File` parts and `payload: { images: [...] }`. File order must exactly match metadata-entry order. Every entry has a unique `clientImageId` in the current UI. Settings remain independent per image.

### White border

`POST /white-border` includes repeated `images: File` parts and:

```json
{
  "clientImageIds": ["first-id", "second-id"],
  "borderSize": 10,
  "aspectRatio": "21:9"
}
```

Border sizes are whole numbers from 0 through 50. A named or custom ratio is sent as its actual string, not as `Custom`. Existing backend semantics add an initial white border of approximately `floor(min(width,height) × size / 100) / 2` on each edge, then pad to the requested ratio.

### Palette

`POST /api/palette` is synchronous and includes `image: File`, `num_colors` from 1 to 32, and optional `clientImageId`. It returns a completed serialized job and authoritative swatches:

```json
{"palette":[{"hex":"#AABBCC","frequency":0.42}]}
```

Frequency is a fraction of sampled visible pixels. Displayed percentages multiply it by 100. Swatches and the horizontal tile PNG are derived from the same deterministic extraction (thumbnail up to 256px per side, visible pixels only, ten K-means initializations, dominance order). The legacy path-returning palette helper and `POST /palette` remain for compatibility.

### QR

`POST /api/qr-code` remains synchronous. It returns `image_data_url`, `mime_type`, `filename`, dimensions, selected `foreground`/`background`, reference `palette`, `color_source`, `notice`, `contrast_ratio`, `warning`, and transparency state. The browser previews and downloads that returned asset directly. The initial request omits manual colors so the backend applies its 7:1 automatic contrast rule. Reference images are optional, limited to 10 MB and 25 megapixels. Applying edited colors submits both explicit colors without re-uploading the reference. Changing URL, reference, format, or transparency marks the prior result stale. JPEG clears transparency; transparent export requires PNG.

## Job response and saved results

Metadata and border submission return HTTP 202 with a `ProcessingJob` whose identifier is `id` (some older docs call it `job_id`). A fast job may already be terminal in that first response. Keep the returned `status_url` and poll every 1.5 seconds while queued/running; one shared polling promise is kept per job ID. Poll failures keep the ID and expose a Retry status action rather than resubmitting image processing. Terminal failure is not retried automatically.

The frontend reads `preview_urls`, `image_urls`, `download_filenames`, `results_page_url`, and `status_url`; output filesystem paths are never browser URLs. Each output may include `client_image_id`. Individual attachments are served by `/download/<job_id>/<filename>` and a job's ZIP by `/download-all/<job_id>`; ZIPs must stay scoped to one job.

Metadata outputs additionally persist `metadata_options` with the four normalized design settings from the submitted snapshot. Generated and saved-result style labels use this output metadata, rather than current drafts. Historical outputs may omit it and display Original. Saved results still do not restore browser-owned files or editable drafts.

`/results/<job_id>` fetches directly from `/api/jobs/<job_id>`, polls unfinished jobs, and works after refresh without restoring upload drafts or original comparison. It shows missing/failed status, navigates outputs, supports individual and ZIP downloads, and can show the retained 3D print view of a returned output.

The job store writes through a lock-protected atomic replacement and guards the queued-to-running transition so a polling refresh cannot overwrite a terminal state. Failures expose readable messages while full tracebacks stay in logs. Upload paths use unique per-job names even when original filenames collide; original filenames remain display metadata.

## Processing safeguards and deployment

Request parsers reject malformed JSON roots, null batch entries, count mismatches, duplicate correlation IDs, non-integer/out-of-range border sizes, invalid ratios, partial coordinates, non-finite coordinates, and latitude/longitude outside their valid ranges before creating metadata or border jobs. Metadata extraction tolerates missing/partial EXIF, reads nested GPS IFD fields, handles zero coordinates, and omits absent annotations. Custom print padding is calculated directly for the requested ratio and contains the full composition. Generated preview files are explicit JPEGs with `.jpg` names. Font fallback initializes regular and bold fonts independently.

The production image is multi-stage: Node 22 builds the React bundle; the Python runtime contains no Node and runs Gunicorn with one worker and four threads. One worker and one app replica are required because the current queue is in-process and startup recovery marks unfinished jobs interrupted. Production Compose mounts job records and uploads as separate named volumes so these mounts do not hide `static/ui`. Its health check uses Python's standard-library HTTP client. Development Compose serves Flask on host port 55000; Vite runs separately on the host.

## Focused checks

Run the Python regression suite after installing requirements. The API tests create temporary job and upload roots before Flask import, so startup recovery cannot inspect the repository job store:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The API test modules set `TOOLKIT_JOB_STORE` and `TOOLKIT_UPLOAD_ROOT` to temporary directories before importing the app. The browser harness does the same when it starts Flask itself; set `TOOLKIT_BASE_URL` only when pointing it at a disposable server. It covers the empty workspace, dark mode, QR exports, per-image metadata styles and appearance, reset defaults, pending-job snapshots, mixed-style batches, stale downloads, saved/historical results, and narrow viewports. Set `PYTHON` to the intended interpreter and optionally `TOOLKIT_SCREENSHOT_PATH` to save a metadata workspace screenshot. Importing `app` still runs restart recovery for its configured store, so checks against an existing service must always use disposable job and upload directories.
