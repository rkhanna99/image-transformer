import io
import json
import os
import tempfile
import time
import unittest
import zipfile

from PIL import Image

# App import runs interrupted-job recovery. Keep this module's app data isolated.
_test_storage = tempfile.TemporaryDirectory(prefix="image-toolkit-api-tests-")
os.environ["TOOLKIT_JOB_STORE"] = os.path.join(_test_storage.name, "jobs")
os.environ["TOOLKIT_UPLOAD_ROOT"] = os.path.join(_test_storage.name, "uploads", "jobs")

from app import app


def png_bytes(color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (96, 64), color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class ProcessingApiTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def await_job(self, job_id: str):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            response = self.client.get(f"/api/jobs/{job_id}")
            self.assertEqual(response.status_code, 200)
            job = response.get_json()
            if job["status"] in {"succeeded", "failed"}:
                return job
            time.sleep(0.02)
        self.fail(f"Job {job_id} did not finish in time")

    def test_metadata_batch_duplicate_filenames_keep_images_and_ids_distinct(self):
        payload = {
            "images": [
                {"clientImageId": "source-red", "latitude": "0", "longitude": "0", "photoName": "Red", "aspectRatio": "Default"},
                {"clientImageId": "source-blue", "latitude": "0", "longitude": "0", "photoName": "Blue", "aspectRatio": "Default"},
            ]
        }
        response = self.client.post("/process-images", data={
            "images": [
                (io.BytesIO(png_bytes((240, 20, 20))), "same-name.png"),
                (io.BytesIO(png_bytes((20, 20, 240))), "same-name.png"),
            ],
            "payload": json.dumps(payload),
        }, content_type="multipart/form-data")

        self.assertEqual(response.status_code, 202, response.get_json())
        job = self.await_job(response.get_json()["id"])
        self.assertEqual(job["status"], "succeeded", job["error"])
        self.assertEqual([output["client_image_id"] for output in job["outputs"]], ["source-red", "source-blue"])
        self.assertEqual(len({output["output_filename"] for output in job["outputs"]}), 2)

        output_pixels = []
        for output, preview_url in zip(job["outputs"], job["preview_urls"]):
            with Image.open(output["output_path"]) as result:
                output_pixels.append(result.convert("RGB").getpixel((result.width // 2, result.height // 2)))
            preview = self.client.get(preview_url)
            try:
                self.assertEqual(preview.status_code, 200)
                self.assertEqual(preview.mimetype, "image/jpeg")
            finally:
                preview.close()
        self.assertGreater(output_pixels[0][0], output_pixels[0][2])
        self.assertGreater(output_pixels[1][2], output_pixels[1][0])

        individual = self.client.get(f"/download/{job['id']}/{job['outputs'][0]['output_filename']}")
        try:
            self.assertEqual(individual.status_code, 200)
            individual.get_data()
        finally:
            individual.close()
        archive = self.client.get(f"/download-all/{job['id']}")
        try:
            self.assertEqual(archive.status_code, 200)
            with zipfile.ZipFile(io.BytesIO(archive.data)) as bundle:
                self.assertEqual(set(bundle.namelist()), {output["output_filename"] for output in job["outputs"]})
        finally:
            archive.close()

    def test_border_batch_correlates_duplicate_filename_outputs(self):
        response = self.client.post("/white-border", data={
            "images": [
                (io.BytesIO(png_bytes((240, 20, 20))), "duplicate.png"),
                (io.BytesIO(png_bytes((20, 20, 240))), "duplicate.png"),
            ],
            "payload": json.dumps({"clientImageIds": ["left", "right"], "borderSize": 10, "aspectRatio": "4:5"}),
        }, content_type="multipart/form-data")

        self.assertEqual(response.status_code, 202, response.get_json())
        job = self.await_job(response.get_json()["id"])
        self.assertEqual(job["status"], "succeeded", job["error"])
        self.assertEqual([output["client_image_id"] for output in job["outputs"]], ["left", "right"])
        self.assertNotEqual(job["outputs"][0]["output_path"], job["outputs"][1]["output_path"])

    def test_palette_api_returns_swatches_from_the_saved_palette_artifact(self):
        response = self.client.post("/api/palette", data={
            "image": (io.BytesIO(png_bytes((230, 30, 30))), "sample.png"),
            "num_colors": "1",
            "clientImageId": "palette-source",
        }, content_type="multipart/form-data")

        self.assertEqual(response.status_code, 200, response.get_json())
        job = response.get_json()
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(job["outputs"][0]["client_image_id"], "palette-source")
        self.assertEqual(len(job["palette"]), 1)
        self.assertEqual(job["palette"][0]["hex"], "#E61E1E")
        self.assertAlmostEqual(job["palette"][0]["frequency"], 1.0)
        preview = self.client.get(job["preview_urls"][0])
        try:
            self.assertEqual(preview.status_code, 200)
            preview.get_data()
        finally:
            preview.close()

    def test_health_route_and_unknown_api_remain_explicit(self):
        self.assertEqual(self.client.get("/healthz").status_code, 200)
        response = self.client.get("/api/unknown")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn(b"<div id=\"root\">", response.data)


if __name__ == "__main__":
    unittest.main()
