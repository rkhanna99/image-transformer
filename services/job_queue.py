from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import threading
import traceback
from typing import Any
from uuid import uuid4

from services.image_upload_service import process_metadata_overlay_path
from processing_scripts.helpers import create_simple_border
from PIL import Image, ImageOps

logger = logging.getLogger("image_transformer.jobs")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_preview_image(source_path: str, preview_path: str, max_dimension: int = 1800) -> None:
    with Image.open(source_path) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((max_dimension, max_dimension))
        img.save(preview_path, quality=82, optimize=True, progressive=True)


def process_border_images(job_id: str, upload_folder: str, items: list[dict[str, Any]], border_size: int, aspect_ratio: str) -> dict[str, Any]:
    outputs = []

    for item in items:
        input_path = item["input_path"]
        original_filename = item["original_filename"]
        filename = os.path.basename(input_path)

        if aspect_ratio == "Default":
            with Image.open(input_path) as img:
                img = ImageOps.exif_transpose(img)
                aspect_ratio_tuple = img.size
        else:
            parts = aspect_ratio.split(":")
            if len(parts) != 2:
                raise ValueError(f"Invalid aspect ratio format: {aspect_ratio}")
            aspect_ratio_tuple = tuple(map(int, parts))

        with Image.open(input_path) as img:
            img = ImageOps.exif_transpose(img)
            processed_image = create_simple_border(img, aspect_ratio_tuple, border_size)

        processed_filename = f"border_{filename}"
        processed_path = os.path.join(upload_folder, processed_filename)
        processed_image.save(processed_path, quality=100, optimize=True, progressive=True)
        preview_filename = f"preview_{processed_filename}"
        preview_path = os.path.join(upload_folder, preview_filename)
        generate_preview_image(processed_path, preview_path)

        outputs.append(
            {
                "input_filename": original_filename,
                "output_filename": processed_filename,
                "output_path": processed_path,
                "preview_filename": preview_filename,
                "preview_path": preview_path,
            }
        )

    return {"job_id": job_id, "outputs": outputs}


def process_metadata_images(job_id: str, upload_folder: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    outputs = []

    for item in items:
        processed_path = process_metadata_overlay_path(
            image_path=item["input_path"],
            original_filename=item["original_filename"],
            form=item["form"],
            upload_folder=upload_folder,
        )
        preview_filename = f"preview_{os.path.basename(processed_path)}"
        preview_path = os.path.join(upload_folder, preview_filename)
        generate_preview_image(processed_path, preview_path)
        outputs.append(
            {
                "input_filename": item["original_filename"],
                "output_filename": os.path.basename(processed_path),
                "output_path": processed_path,
                "preview_filename": preview_filename,
                "preview_path": preview_path,
            }
        )

    return {"job_id": job_id, "outputs": outputs}


class JobStore:
    def __init__(self, root: str):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def job_path(self, job_id: str) -> Path:
        return self.root / f"{job_id}.json"

    def create_job(self, job_type: str, source: str, total_items: int) -> dict[str, Any]:
        job_id = uuid4().hex
        job = {
            "id": job_id,
            "type": job_type,
            "source": source,
            "status": "queued",
            "total_items": total_items,
            "created_at": utc_now_iso(),
            "updated_at": utc_now_iso(),
            "outputs": [],
            "error": None,
        }
        self.save_job(job)
        logger.info("Created job_id=%s type=%s source=%s total_items=%s", job_id, job_type, source, total_items)
        return job

    def save_job(self, job: dict[str, Any]) -> None:
        path = self.job_path(job["id"])
        payload = dict(job)
        payload["updated_at"] = utc_now_iso()

        with self._lock:
            tmp_path = path.with_suffix(".json.tmp")
            tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            tmp_path.replace(path)

    def load_job(self, job_id: str) -> dict[str, Any] | None:
        path = self.job_path(job_id)
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def update_job(self, job_id: str, **changes: Any) -> dict[str, Any] | None:
        job = self.load_job(job_id)
        if job is None:
            return None
        job.update(changes)
        self.save_job(job)
        return job

    def mark_incomplete_jobs_failed(self) -> None:
        for path in self.root.glob("*.json"):
            job = json.loads(path.read_text(encoding="utf-8"))
            if job.get("status") in {"queued", "running"}:
                job["status"] = "failed"
                job["error"] = "Job interrupted by application restart"
                self.save_job(job)


class JobQueue:
    def __init__(self, store: JobStore, max_workers: int | None = None):
        self.store = store
        self.executor = ThreadPoolExecutor(max_workers=max_workers or max(2, (os.cpu_count() or 2) // 2))
        self._futures: dict[str, Future] = {}
        self._lock = threading.Lock()

    def submit_metadata_job(self, job_id: str, upload_folder: str, items: list[dict[str, Any]]) -> None:
        future = self.executor.submit(process_metadata_images, job_id, upload_folder, items)
        self._track_future(job_id, future)

    def submit_border_job(self, job_id: str, upload_folder: str, items: list[dict[str, Any]], border_size: int, aspect_ratio: str) -> None:
        future = self.executor.submit(process_border_images, job_id, upload_folder, items, border_size, aspect_ratio)
        self._track_future(job_id, future)

    def refresh_job(self, job_id: str) -> dict[str, Any] | None:
        job = self.store.load_job(job_id)
        if job is None:
            return None

        with self._lock:
            future = self._futures.get(job_id)

        if future and future.running() and job["status"] == "queued":
            logger.info("Running job_id=%s", job_id)
            job = self.store.update_job(job_id, status="running") or job

        return job

    def _track_future(self, job_id: str, future: Future) -> None:
        self.store.update_job(job_id, status="queued")
        logger.info("Queued job_id=%s", job_id)
        with self._lock:
            self._futures[job_id] = future
        future.add_done_callback(lambda done_future: self._finalize_job(job_id, done_future))

    def _finalize_job(self, job_id: str, future: Future) -> None:
        try:
            result = future.result()
            self.store.update_job(job_id, status="succeeded", outputs=result["outputs"], error=None)
            logger.info("Succeeded job_id=%s outputs=%s", job_id, len(result["outputs"]))
        except Exception as exc:
            self.store.update_job(
                job_id,
                status="failed",
                error=f"{exc}\n{traceback.format_exc()}",
            )
            logger.exception("Failed job_id=%s", job_id)
        finally:
            with self._lock:
                self._futures.pop(job_id, None)
