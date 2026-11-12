import unittest
from io import BytesIO
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image
from werkzeug.datastructures import FileStorage

from services.image_upload_service import (
    extract_dominant_palette,
    palette_color_samples,
    process_color_palette,
)


class TestColorPalette(unittest.TestCase):
    def competing_shades_image(self):
        # Two gray shades should share a cluster, leaving room for 5% blue.
        colors = np.array([
            [251, 235, 16],
            [162, 141, 240],
            [100, 83, 65],
            [135, 125, 127],
            [238, 233, 212],
            [39, 177, 248],
        ], dtype=np.uint8)
        pixels = np.repeat(colors, [3200, 2300, 1800, 1500, 700, 500], axis=0)
        np.random.default_rng(1).shuffle(pixels)
        return Image.fromarray(pixels.reshape(100, 100, 3))

    def generate_colors(self, image, count):
        data = BytesIO()
        image.save(data, format='PNG')
        data.seek(0)
        with TemporaryDirectory() as folder:
            upload = FileStorage(stream=data, filename='test.png')
            output = process_color_palette(upload, count, folder)
            with Image.open(output) as palette:
                self.assertEqual(palette.format, 'PNG')
                self.assertEqual(palette.height, 200)
                return [
                    palette.getpixel((x + 100, 100))
                    for x in range(0, palette.width, 200)
                ]

    def test_transparent_background_is_ignored(self):
        # 90% invisible black; visible pixels are 80% orange and 20% blue.
        image = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
        image.paste((255, 180, 0, 255), (0, 0, 8, 100))
        image.paste((0, 180, 240, 255), (8, 0, 10, 100))
        for source in (image, image.quantize()):
            with self.subTest(mode=source.mode):
                self.assertEqual(
                    self.generate_colors(source, 2),
                    [(255, 180, 0), (0, 180, 240)],
                )

    def test_opaque_black_background_is_counted(self):
        image = Image.new('RGB', (100, 100), 'black')
        image.paste('red', (0, 0, 20, 100))
        self.assertEqual(self.generate_colors(image, 2), [(0, 0, 0), (255, 0, 0)])

    def test_visible_black_in_transparent_image_is_preserved(self):
        image = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
        image.paste((255, 0, 0, 255), (0, 0, 8, 100))
        image.paste((0, 0, 0, 255), (8, 0, 10, 100))
        self.assertEqual(self.generate_colors(image, 2), [(255, 0, 0), (0, 0, 0)])

    def test_colors_are_ordered_by_frequency(self):
        image = Image.new('RGB', (100, 100), 'red')
        image.paste('lime', (60, 0, 90, 100))
        image.paste('blue', (90, 0, 100, 100))
        self.assertEqual(
            self.generate_colors(image, 3),
            [(255, 0, 0), (0, 255, 0), (0, 0, 255)],
        )

    def test_distinct_blue_is_preserved_when_gray_shades_compete(self):
        colors = self.generate_colors(self.competing_shades_image(), 5)
        self.assertEqual(len(colors), 5)
        self.assertTrue(
            any(red < 100 and green > 120 and blue > 200
                for red, green, blue in colors),
            f'The palette lost the distinct blue color: {colors}',
        )

    def test_grouped_frequencies_are_normalized_ordered_and_repeatable(self):
        image = self.competing_shades_image()
        samples = palette_color_samples(extract_dominant_palette(image, 5))
        frequencies = [frequency for _, frequency in samples]
        # The two grays combine to 33%, ahead of the 32% yellow region.
        np.testing.assert_allclose(
            frequencies, [0.33, 0.32, 0.23, 0.07, 0.05], rtol=0, atol=1e-12,
        )
        self.assertAlmostEqual(sum(frequencies), 1.0)
        self.assertEqual(
            samples, palette_color_samples(extract_dominant_palette(image, 5)),
        )

    def test_tiny_image_produces_only_available_colors(self):
        image = Image.new('RGB', (1, 1), 'red')
        self.assertEqual(self.generate_colors(image, 32), [(255, 0, 0)])

    def test_fully_transparent_image_is_rejected(self):
        image = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, 'no visible pixels'):
            self.generate_colors(image, 7)


if __name__ == '__main__':
    unittest.main()
