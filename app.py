from flask import Flask, jsonify, redirect, render_template, request, send_file, send_from_directory, url_for
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from livereload import Server
import os
from io import BytesIO
import logging
from pathlib import Path
import zipfile
from PIL import Image, UnidentifiedImageError

from services.image_upload_service import process_color_palette, process_color_palette_result
from services.job_queue import JobQueue, JobStore
from services.qr_code_service import MAX_REFERENCE_BYTES, generate_qr_code
from services.request_payloads import parse_batch_metadata_payload, parse_border_payload, parse_single_metadata_payload


app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.getenv("SECRET_KEY", "your_secret_key")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("image_transformer.app")

app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 3600

PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_UPLOAD_ROOT = Path(os.getenv("TOOLKIT_UPLOAD_ROOT", str(PROJECT_ROOT / "static" / "uploads" / "jobs"))).resolve()
JOB_STORE_ROOT = Path(os.getenv("TOOLKIT_JOB_STORE", str(PROJECT_ROOT / "data" / "jobs"))).resolve()

STATIC_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
JOB_STORE_ROOT.mkdir(parents=True, exist_ok=True)

job_store = JobStore(str(JOB_STORE_ROOT))
job_store.mark_incomplete_jobs_failed()
job_queue = JobQueue(job_store)


def build_job_file_urls(job_id: str, outputs: list[dict]) -> tuple[list[str], list[str], list[str]]:
    preview_urls = []
    image_urls = []
    filenames = []
    for output in outputs:
        filename = output["output_filename"]
        preview_filename = output.get("preview_filename", filename)
        preview_urls.append(url_for("job_asset", job_id=job_id, filename=preview_filename))
        image_urls.append(url_for("job_asset", job_id=job_id, filename=filename))
        filenames.append(filename)
    return preview_urls, image_urls, filenames


def serialize_job(job: dict) -> dict:
    payload = dict(job)
    outputs = payload.get("outputs", [])
    preview_urls, image_urls, filenames = build_job_file_urls(job["id"], outputs)
    payload["preview_urls"] = preview_urls
    payload["image_urls"] = image_urls
    payload["download_filenames"] = filenames
    payload["results_page_url"] = url_for("results_page", job_id=job["id"])
    payload["status_url"] = url_for("job_status", job_id=job["id"])
    return payload


def create_job_folder(job_id: str) -> Path:
    job_folder = STATIC_UPLOAD_ROOT / job_id
    job_folder.mkdir(parents=True, exist_ok=True)
    return job_folder


def save_uploaded_files(files, job_folder: Path, client_ids: list[str] | None = None) -> list[dict]:
    saved_items = []
    for index, file in enumerate(files):
        if not file or file.filename == "":
            continue
        original_filename = secure_filename(file.filename)
        if not original_filename or original_filename in {".", ".."}:
            original_filename = f"image_{index + 1}"
        input_filename = secure_filename(f"input_{index + 1}_{os.urandom(8).hex()}_{original_filename}")
        input_path = job_folder / input_filename
        file.save(input_path)
        saved_item = {
            "original_filename": original_filename,
            "input_filename": input_filename,
            "input_path": str(input_path),
        }
        if client_ids is not None:
            saved_item["client_image_id"] = client_ids[index]
        saved_items.append(saved_item)
    return saved_items


@app.route("/")
def home():
    return frontend_shell()


@app.get("/healthz")
def healthcheck():
    return jsonify({"status": "ok"})


@app.get("/static/uploads/jobs/<job_id>/<path:filename>")
def job_asset(job_id: str, filename: str):
    return send_from_directory(str(STATIC_UPLOAD_ROOT / job_id), filename)


def frontend_shell():
    index_path = PROJECT_ROOT / "static" / "ui" / "index.html"
    if not index_path.is_file():
        return "The frontend build is missing. Build the React application and try again.", 503
    response = send_from_directory(index_path.parent, index_path.name)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/metadata")
def upload_form():
    return frontend_shell()


@app.route("/border")
def border_form():
    return frontend_shell()


@app.route('/palette', methods=['GET', 'POST'])
def palette_form():
    if request.method == 'GET':
        return frontend_shell()

    num_colors = request.form.get('num_colors', '')

    def form_error(message):
        return render_template('palette.html', error=message, num_colors=num_colors), 400

    try:
        num_colors = int(num_colors)
    except ValueError:
        return form_error('Choose a whole number of colors between 1 and 32.')
    if not 1 <= num_colors <= 32:
        return form_error('Choose a whole number of colors between 1 and 32.')

    image = request.files.get('image')
    if not image or not image.filename:
        return form_error('Please select an image.')

    job = job_store.create_job(job_type="palette", source="palette", total_items=1)
    job_folder = create_job_folder(job["id"])
    try:
        output_path = process_color_palette(image, num_colors, str(job_folder))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        job_store.update_job(job["id"], status="failed", error=str(exc))
        return form_error('Unable to read this image. Please upload a valid, supported image file.')

    filename = os.path.basename(output_path)
    job_store.update_job(
        job["id"], status="succeeded", outputs=[{
            "input_filename": secure_filename(image.filename),
            "output_filename": filename,
            "output_path": output_path,
            "preview_filename": filename,
            "preview_path": output_path,
        }],
    )
    return redirect(url_for('results_page', job_id=job["id"]))


@app.post("/api/palette")
def palette_api():
    image = request.files.get("image")
    if not image or not image.filename:
        return jsonify({"error": "Please select an image."}), 400
    try:
        raw_count = request.form.get("num_colors", "7")
        count = int(raw_count)
        if str(raw_count).strip() != str(count) or not 1 <= count <= 32:
            raise ValueError("Choose a whole number of colors between 1 and 32.")
        client_id = request.form.get("clientImageId") or None
        if client_id is not None and len(client_id) > 128:
            raise ValueError("clientImageId must be 128 characters or fewer")
    except (TypeError, ValueError) as exc:
        message = str(exc) or "Choose a whole number of colors between 1 and 32."
        return jsonify({"error": message}), 400

    job = job_store.create_job(job_type="palette", source="palette", total_items=1)
    job_folder = create_job_folder(job["id"])
    try:
        result = process_color_palette_result(image, count, str(job_folder))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        job_store.update_job(job["id"], status="failed", error=str(exc))
        return jsonify({"error": "Unable to read this image. Please upload a valid, supported image file."}), 400

    filename = os.path.basename(result["output_path"])
    output = {
        "input_filename": secure_filename(image.filename),
        "output_filename": filename,
        "output_path": result["output_path"],
        "preview_filename": filename,
        "preview_path": result["output_path"],
        "client_image_id": client_id,
    }
    job = job_store.update_job(
        job["id"], status="succeeded", outputs=[output],
        palette=result["palette"], error=None,
    )
    return jsonify(serialize_job(job)), 200


@app.get('/qr-code')
def qr_code_form():
    return frontend_shell()


@app.post('/api/qr-code')
def qr_code_endpoint():
    try:
        request.max_content_length = MAX_REFERENCE_BYTES + 128 * 1024
    except AttributeError:
        # Older Werkzeug versions cannot set a per-request body limit.
        pass
    # Check the multipart envelope before Werkzeug parses the uploaded body.
    if request.content_length is not None and request.content_length > MAX_REFERENCE_BYTES + 128 * 1024:
        return jsonify({"error": "Reference images must be 10 MB or smaller."}), 413

    try:
        reference_image = request.files.get('reference_image')
        form = request.form
    except RequestEntityTooLarge:
        return jsonify({"error": "Reference images must be 10 MB or smaller."}), 413

    if reference_image and not reference_image.filename:
        reference_image = None

    try:
        result = generate_qr_code(
            destination_url=form.get('url'),
            reference_image=reference_image,
            foreground=form.get('foreground'),
            background=form.get('background'),
            export_format=form.get('format'),
            transparent_background=form.get('transparent_background'),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify(result)


@app.post("/process-image")
def process_image_endpoint():
    if "image" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["image"]
    if not file.filename:
        return jsonify({"error": "No selected file"}), 400

    try:
        payload = parse_single_metadata_payload(request.form)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    job = job_store.create_job(job_type="metadata", source="metadata", total_items=1)
    job_folder = create_job_folder(job["id"])
    saved_items = save_uploaded_files([file], job_folder)
    if not saved_items:
        return jsonify({"error": "No valid file uploaded"}), 400

    items = [
        {
            **saved_items[0],
            "form": payload.as_form(),
            "client_image_id": payload.clientImageId,
        }
    ]

    logger.info("Submitting metadata job_id=%s items=%s source=single", job["id"], len(items))
    job_queue.submit_metadata_job(job["id"], str(job_folder), items)
    created_job = job_queue.refresh_job(job["id"]) or job
    return jsonify(serialize_job(created_job)), 202


@app.post("/process-images")
def process_images_endpoint():
    if "images" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    files = request.files.getlist("images")
    if not files or any(not file.filename for file in files):
        return jsonify({"error": "Select a valid file for every image"}), 400
    try:
        payload = parse_batch_metadata_payload(request.form, len(files))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    job = job_store.create_job(job_type="metadata", source="metadata", total_items=len(files))
    job_folder = create_job_folder(job["id"])
    client_ids = [image.clientImageId for image in payload.images] if any(image.clientImageId for image in payload.images) else None
    saved_items = save_uploaded_files(files, job_folder, client_ids)
    if not saved_items:
        return jsonify({"error": "No valid files uploaded"}), 400
    if len(payload.images) != len(saved_items):
        return jsonify({"error": "Payload image count must match uploaded image count"}), 400

    items = []
    for index, saved_item in enumerate(saved_items):
        image_payload = payload.images[index]
        items.append(
            {
                **saved_item,
                "form": image_payload.as_form(),
                "client_image_id": image_payload.clientImageId,
            }
        )

    logger.info("Submitting metadata job_id=%s items=%s source=batch", job["id"], len(items))
    job_queue.submit_metadata_job(job["id"], str(job_folder), items)
    created_job = job_queue.refresh_job(job["id"]) or job
    return jsonify(serialize_job(created_job)), 202


@app.post("/white-border")
def white_border_endpoint():
    if "images" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "No file uploaded"}), 400
    if any(not file.filename for file in files):
        return jsonify({"error": "Select a valid file for every image"}), 400

    try:
        payload = parse_border_payload(request.form, len(files))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    job = job_store.create_job(job_type="border", source="border", total_items=len(files))
    job_folder = create_job_folder(job["id"])
    saved_items = save_uploaded_files(files, job_folder, payload.clientImageIds)
    if not saved_items:
        return jsonify({"error": "No valid files uploaded"}), 400

    logger.info(
        "Submitting border job_id=%s items=%s border_size=%s aspect_ratio=%s",
        job["id"],
        len(saved_items),
        payload.borderSize,
        payload.aspectRatio,
    )
    job_queue.submit_border_job(job["id"], str(job_folder), saved_items, payload.borderSize, payload.aspectRatio)
    created_job = job_queue.refresh_job(job["id"]) or job
    return jsonify(serialize_job(created_job)), 202


@app.get("/api/jobs/<job_id>")
def job_status(job_id: str):
    job = job_queue.refresh_job(job_id)
    if job is None:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(serialize_job(job))


@app.get("/results")
def legacy_results_page():
    return redirect(url_for("home"))


@app.get("/results/<job_id>")
def results_page(job_id: str):
    return frontend_shell()


@app.get("/download/<job_id>/<filename>")
def download_file(job_id: str, filename: str):
    job = job_store.load_job(job_id)
    if job is None:
        return redirect(url_for("home"))
    return send_from_directory(str(STATIC_UPLOAD_ROOT / job_id), filename, as_attachment=True)


@app.get("/download-all/<job_id>")
def download_all_files(job_id: str):
    job = job_store.load_job(job_id)
    if job is None:
        return redirect(url_for("home"))

    outputs = job.get("outputs", [])
    if not outputs:
        return redirect(url_for("results_page", job_id=job_id))

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        for output in outputs:
            filename = output["output_filename"]
            file_path = STATIC_UPLOAD_ROOT / job_id / filename
            if file_path.exists():
                zip_file.write(file_path, arcname=filename)

    zip_buffer.seek(0)
    return send_file(
        zip_buffer,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"processed_images_{job_id}.zip",
    )


if __name__ == "__main__":
    # Development vs production behavior is controlled by the DEV env var.
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    DEV_MODE = os.getenv("DEV", os.getenv("FLASK_ENV", "")).lower() in ("1", "true", "dev", "development")
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 5000))

    if DEV_MODE:
        logger.info("Starting development server with live reload enabled")
        server = Server(app.wsgi_app)
        server.watch("templates/*.html")
        server.watch("templates/**/*.html")
        server.watch("static/css/*.css")
        server.watch("static/js/*.js")
        server.watch("static/**/*.css")
        server.watch("static/**/*.js")
        server.serve(host=HOST, debug=os.getenv("FLASK_DEBUG", "true").lower() in ("1", "true"), port=PORT)
    else:
        # In production we expect a WSGI server (gunicorn/uWSGI) to run the app.
        # Provide a minimal fallback if someone runs `python app.py` in prod.
        logger.info("Starting Flask server with live reload disabled; set DEV=1 to enable live reload")
        app.run(host=HOST, port=PORT)
