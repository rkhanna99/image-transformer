import tempfile
import unittest
from pathlib import Path

import piexif
from PIL import Image

from processing_scripts.helpers import adjust_line_font, generate_metadata_image, get_image_metadata


class TestMetadataHelpers(unittest.TestCase):
    def test_reads_nested_camera_capture_exif(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "camera.jpg"
            exif = {
                "0th": {piexif.ImageIFD.Make: b"Example", piexif.ImageIFD.Model: b"Body"},
                "Exif": {
                    piexif.ExifIFD.ExposureTime: (1, 125),
                    piexif.ExifIFD.FNumber: (28, 10),
                    piexif.ExifIFD.ISOSpeedRatings: 400,
                    piexif.ExifIFD.LensModel: b"Prime 50mm",
                    piexif.ExifIFD.DateTimeOriginal: b"2025:01:02 03:04:05",
                },
                "GPS": {},
                "1st": {},
                "thumbnail": None,
            }
            Image.new("RGB", (320, 240), "white").save(path, exif=piexif.dump(exif))

            metadata = get_image_metadata(str(path))

        self.assertEqual(metadata["Make"], "Example")
        self.assertEqual(metadata["Model"], "Body")
        self.assertEqual(float(metadata["ExposureTime"]), 1 / 125)
        self.assertEqual(metadata["FNumber"], 2.8)
        self.assertEqual(metadata["ISOSpeedRatings"], 400)
        self.assertEqual(metadata["LensModel"], "Prime 50mm")
        self.assertEqual(metadata["DateTimeOriginal"], "2025:01:02 03:04:05")
        self.assertEqual(metadata["ShutterSpeedValue"], "1/125")

    def test_long_text_on_small_images_and_minimum_font_do_not_crash(self):
        with tempfile.TemporaryDirectory() as folder:
            font = str(Path(__file__).resolve().parents[1] / "fonts" / "timesbd.ttf")
            size, scale = adjust_line_font("w" * 120, "w" * 80, font, 10, 300)
            self.assertEqual(size, 10)
            self.assertEqual(scale, 1.0)

            image = generate_metadata_image({}, 300, 200, "w" * 120)
            self.assertGreaterEqual(image.width, 300)
            self.assertGreaterEqual(image.height, 1)


if __name__ == "__main__":
    unittest.main()
