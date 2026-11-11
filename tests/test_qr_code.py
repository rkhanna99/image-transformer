import base64
from io import BytesIO
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

from app import app
from services.qr_code_service import MAX_REFERENCE_BYTES

try:
    import cv2
except ImportError:  # pragma: no cover - decoder is optional outside the dev environment
    cv2 = None


class FakeColor:
    def __init__(self, rgb, frequency):
        self.rgb = np.array(rgb, dtype=np.uint8)
        self.freq = frequency


class FakePalette:
    def __init__(self, colors):
        self.colors = [FakeColor(rgb, frequency) for rgb, frequency in colors]


class TestQrCode(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def png_upload(self, colors=None, filename='reference.png'):
        image = Image.new('RGB', (32, 32), 'white')
        if colors:
            image.paste(colors[0], (0, 0, 16, 32))
        buffer = BytesIO()
        image.save(buffer, format='PNG')
        buffer.seek(0)
        return (BytesIO(buffer.getvalue()), filename)

    def post_qr(self, data):
        return self.client.post('/api/qr-code', data=data, content_type='multipart/form-data')

    def image_from_response(self, payload):
        image_data = base64.b64decode(payload['image_data_url'].split(',', 1)[1])
        return Image.open(BytesIO(image_data)), image_data

    def assert_decodes(self, image_data, expected_url):
        if cv2 is None:
            return
        encoded = np.frombuffer(image_data, dtype=np.uint8)
        image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
        self.assertEqual(decoded, expected_url)

    def test_url_only_uses_default_png_and_decodes_exact_url(self):
        destination = 'https://Example.com/pokemon?form=1#details'
        with patch('services.qr_code_service.extract_dominant_palette') as extractor:
            response = self.post_qr({'url': destination})
        self.assertEqual(response.status_code, 200)
        extractor.assert_not_called()
        payload = response.get_json()
        image, image_data = self.image_from_response(payload)
        self.assertEqual(payload['url'], destination)
        self.assertEqual(payload['color_source'], 'default')
        self.assertEqual((payload['foreground'], payload['background']), ('#000000', '#FFFFFF'))
        self.assertEqual((image.format, image.mode), ('PNG', 'RGB'))
        self.assertEqual((image.width, image.height), (payload['width'], payload['height']))
        self.assertEqual(payload['filename'], 'qr-code.png')
        self.assertIsNone(payload['notice'])
        self.assertIsNone(payload['warning'])
        self.assertEqual(payload['contrast_ratio'], 21.0)
        self.assertFalse(payload['transparent_background'])
        self.assert_decodes(image_data, destination)

    def test_palette_pair_is_selected_and_decodes(self):
        destination = 'https://example.com/painting?id=7#info'
        palette = FakePalette([((0, 0, 0), 0.7), ((255, 255, 255), 0.2), ((160, 30, 20), 0.1)])
        with patch('services.qr_code_service.extract_dominant_palette', return_value=palette):
            response = self.post_qr({
                'url': destination,
                'reference_image': self.png_upload(),
            })
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload['color_source'], 'palette')
        self.assertEqual((payload['foreground'], payload['background']), ('#000000', '#FFFFFF'))
        self.assertEqual(payload['palette'], ['#000000', '#FFFFFF', '#A01E14'])
        self.assert_decodes(self.image_from_response(payload)[1], destination)

    def test_low_contrast_palette_falls_back_with_notice(self):
        palette = FakePalette([((90, 90, 90), 1.0)])
        with patch('services.qr_code_service.extract_dominant_palette', return_value=palette):
            response = self.post_qr({
                'url': 'https://example.com',
                'reference_image': self.png_upload(),
            })
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload['color_source'], 'fallback')
        self.assertEqual((payload['foreground'], payload['background']), ('#000000', '#FFFFFF'))
        self.assertIn('black and white', payload['notice'])

    def test_fully_transparent_reference_falls_back_without_counting_hidden_rgb(self):
        transparent = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
        buffer = BytesIO()
        transparent.save(buffer, format='PNG')
        buffer.seek(0)
        response = self.post_qr({
            'url': 'https://example.com',
            'reference_image': (buffer, 'transparent.png'),
        })
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload['color_source'], 'fallback')
        self.assertIn('black and white', payload['notice'])

    def test_manual_pair_is_preserved_and_jpeg_decodes(self):
        destination = 'https://example.com/poster?q=1#part'
        response = self.post_qr({
            'url': destination,
            'foreground': '#112233',
            'background': '#F0F0F0',
            'format': 'jpeg',
        })
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        image, image_data = self.image_from_response(payload)
        self.assertEqual(payload['color_source'], 'manual')
        self.assertEqual((payload['foreground'], payload['background']), ('#112233', '#F0F0F0'))
        self.assertEqual((payload['mime_type'], payload['filename']), ('image/jpeg', 'qr-code.jpeg'))
        self.assertEqual(image.format, 'JPEG')
        self.assert_decodes(image_data, destination)

    def test_one_manual_color_uses_palette_partner(self):
        palette = FakePalette([((0, 0, 0), 0.5), ((255, 255, 255), 0.5)])
        with patch('services.qr_code_service.extract_dominant_palette', return_value=palette):
            response = self.post_qr({
                'url': 'https://example.com',
                'reference_image': self.png_upload(),
                'foreground': '#000000',
            })
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload['color_source'], 'manual')
        self.assertEqual((payload['foreground'], payload['background']), ('#000000', '#FFFFFF'))

    def test_one_manual_color_uses_default_and_warns_for_low_contrast(self):
        response = self.post_qr({'url': 'https://example.com', 'background': '#FFFFFF'})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual((payload['foreground'], payload['background']), ('#000000', '#FFFFFF'))

        low_contrast = self.post_qr({'url': 'https://example.com', 'foreground': '#FFFFFF'})
        self.assertEqual(low_contrast.status_code, 200)
        self.assertEqual(low_contrast.get_json()['foreground'], '#FFFFFF')
        self.assertEqual(low_contrast.get_json()['background'], '#FFFFFF')
        self.assertIn('Low contrast', low_contrast.get_json()['warning'])

    def test_reference_image_byte_limit_is_enforced(self):
        oversized = BytesIO(b'x' * (MAX_REFERENCE_BYTES + 1))
        response = self.post_qr({
            'url': 'https://example.com',
            'reference_image': (oversized, 'large.png'),
        })
        self.assertEqual(response.status_code, 400)
        self.assertIn('10 MB', response.get_json()['error'])

    def test_low_contrast_and_reversed_manual_pairs_are_preserved_with_warnings(self):
        for foreground, background in [('#777777', '#FFFFFF'), ('#FFFFFF', '#000000'), ('#123456', '#123456')]:
            with self.subTest(foreground=foreground, background=background):
                response = self.post_qr({
                    'url': 'https://example.com',
                    'foreground': foreground,
                    'background': background,
                })
                self.assertEqual(response.status_code, 200)
                payload = response.get_json()
                self.assertEqual((payload['foreground'], payload['background']), (foreground, background))
                self.assertTrue(payload['warning'])
                image, _ = self.image_from_response(payload)
                self.assertEqual(image.getpixel((0, 0)), tuple(bytes.fromhex(background[1:])))
                self.assertEqual(image.getpixel((64, 64)), tuple(bytes.fromhex(foreground[1:])))

    def test_transparent_png_has_clear_background_opaque_modules_and_decodes_on_white(self):
        destination = 'https://example.com/Pokemon?form=2#details'
        response = self.post_qr({
            'url': destination,
            'foreground': '#123456',
            'background': '#123456',
            'transparent_background': 'true',
        })
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        image, _ = self.image_from_response(payload)
        self.assertEqual((image.format, image.mode), ('PNG', 'RGBA'))
        self.assertTrue(payload['transparent_background'])
        self.assertEqual((image.width, image.height), (payload['width'], payload['height']))
        self.assertEqual(image.getpixel((0, 0))[3], 0)
        self.assertEqual(image.getpixel((64, 64)), (18, 52, 86, 255))
        self.assertEqual(set(np.asarray(image)[:, :, 3].flat), {0, 255})
        self.assertIsNone(payload['contrast_ratio'])
        self.assertIn('surface behind', payload['warning'])
        composite = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
        composite_buffer = BytesIO()
        composite.save(composite_buffer, format='PNG')
        self.assert_decodes(composite_buffer.getvalue(), destination)

    def test_transparency_requires_png_and_valid_boolean(self):
        jpeg = self.post_qr({
            'url': 'https://example.com', 'format': 'jpeg', 'transparent_background': 'true',
        })
        self.assertEqual(jpeg.status_code, 400)
        self.assertIn('require PNG', jpeg.get_json()['error'])
        invalid = self.post_qr({
            'url': 'https://example.com', 'transparent_background': 'maybe',
        })
        self.assertEqual(invalid.status_code, 400)

        opaque = self.post_qr({
            'url': 'https://example.com', 'format': 'jpeg', 'transparent_background': 'false',
        })
        self.assertEqual(opaque.status_code, 200)
        self.assertEqual(self.image_from_response(opaque.get_json())[0].mode, 'RGB')
        self.assertFalse(opaque.get_json()['transparent_background'])

    def test_invalid_url_format_corrupt_and_over_capacity_inputs_are_rejected(self):
        invalid_scheme = self.post_qr({'url': 'javascript:alert(1)'})
        self.assertEqual(invalid_scheme.status_code, 400)

        embedded_credentials = self.post_qr({'url': 'https://user:secret@example.com'})
        self.assertEqual(embedded_credentials.status_code, 400)

        invalid_format = self.post_qr({'url': 'https://example.com', 'format': 'svg'})
        self.assertEqual(invalid_format.status_code, 400)

        corrupt = self.post_qr({
            'url': 'https://example.com',
            'reference_image': (BytesIO(b'not an image'), 'reference.png'),
        })
        self.assertEqual(corrupt.status_code, 400)
        self.assertIn('valid, supported image', corrupt.get_json()['error'])

        too_long = self.post_qr({'url': 'https://example.com/' + ('x' * 5000)})
        self.assertEqual(too_long.status_code, 400)
        self.assertIn('too long', too_long.get_json()['error'])

    def test_invalid_hex_color_is_still_rejected(self):
        response = self.post_qr({'url': 'https://example.com', 'foreground': 'red'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('hex color', response.get_json()['error'])


if __name__ == '__main__':
    unittest.main()
