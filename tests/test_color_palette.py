import unittest
from io import BytesIO
from tempfile import TemporaryDirectory

from PIL import Image
from werkzeug.datastructures import FileStorage

from services.image_upload_service import process_color_palette


class TestColorPalette(unittest.TestCase):
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

    def test_tiny_image_produces_only_available_colors(self):
        image = Image.new('RGB', (1, 1), 'red')
        self.assertEqual(self.generate_colors(image, 32), [(255, 0, 0)])

    def test_fully_transparent_image_is_rejected(self):
        image = Image.new('RGBA', (100, 100), (0, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, 'no visible pixels'):
            self.generate_colors(image, 7)


if __name__ == '__main__':
    unittest.main()
