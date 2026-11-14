"""Composition, formatting, and compatibility checks independent of geocoding."""
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image, ImageChops, ImageOps
from Pylette import Color, Palette

from processing_scripts import image_transformer
from processing_scripts.helpers import (
    generate_metadata_image, get_palette_dimensions, get_proportions,
    local_display, setup_print_padding, to_dms,
)
from processing_scripts.metadata_renderers import (
    MetadataRenderContext, MetadataRenderOptions, RENDERERS,
    fit_text, format_display_metadata, load_font, pad_to_ratio,
)


def sample_metadata():
    return {
        'Make': 'FUJIFILM', 'Model': 'FUJIFILM X-T5',
        'LensModel': 'XF 16-55mm f/2.8 R LM WR', 'FocalLength': 35,
        'FNumber': 8.0, 'ShutterSpeedValue': '1/320', 'ISOSpeedRatings': 160,
        'DateTimeOriginal': '2025:09:18 10:30:00',
        'GPSLatitude': to_dms(46.4975, 'lat')[0], 'GPSLatitudeRef': 'N',
        'GPSLongitude': to_dms(7.7149, 'lon')[0], 'GPSLongitudeRef': 'E',
    }


def sample_palette(count=7):
    return Palette([Color((index * 30, 100, 180), 1 / count) for index in range(count)])


def patterned_photo(size):
    photo = Image.new('RGB', size, '#74a3b7')
    # Distinct corner pixels prove the photo rectangle was neither cropped nor resized.
    for position, color in zip([(0, 0), (size[0]-1, 0), (0, size[1]-1), (size[0]-1, size[1]-1)], ['red', 'lime', 'blue', 'yellow']):
        photo.putpixel(position, Image.new('RGB', (1, 1), color).getpixel((0, 0)))
    return photo


class MetadataRendererTests(unittest.TestCase):
    def setUp(self):
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()

    def tearDown(self):
        self.quiet.__exit__(None, None, None)

    def context(self, size=(1200, 800), **changes):
        values = dict(photo=patterned_photo(size), metadata=sample_metadata(), title='DSCF3269', location='Oeschinensee, Switzerland', palette=sample_palette())
        return MetadataRenderContext(**(values | changes))

    def test_original_default_matches_legacy_composition_and_print_padding(self):
        # This is the original algorithm captured before introducing renderer dispatch.
        for size, ratio in [((300, 200), None), ((600, 900), None), ((1200, 800), (4, 5))]:
            with self.subTest(size=size, ratio=ratio), tempfile.TemporaryDirectory() as folder:
                context = self.context(size)
                photo, metadata, palette = context.photo, context.metadata, context.palette
                header = generate_metadata_image(metadata, *size, context.title)
                tile = get_palette_dimensions(photo, 7)['palette_width']
                strip = local_display(palette, w=tile, h=tile)
                gap = get_proportions(*size, 300)
                stacked = Image.new('RGB', (size[0], size[1] + int(tile) + header.height + gap), 'white')
                stacked.paste(header, (0, 0))
                stacked.paste(photo, (0, header.height))
                stacked.paste(strip, (0, header.height + size[1] + gap))
                horizontal, vertical = setup_print_padding(photo, stacked, 400, ratio)
                expected = ImageOps.expand(stacked, border=(horizontal, vertical, horizontal, vertical), fill='white')
                source = Path(folder) / 'photo.png'
                photo.save(source)
                with patch.object(image_transformer, 'get_image_metadata', return_value=metadata), patch.object(image_transformer, 'extract_colors', return_value=palette):
                    actual = image_transformer.process_image(str(source), photo_title=context.title, print_aspect_ratio=ratio)
                self.assertEqual(actual.size, expected.size)
                self.assertIsNone(ImageChops.difference(actual, expected).getbbox())

    def test_new_styles_preserve_native_photo_and_reference_geometry(self):
        for size in [(1200, 800), (800, 1200), (1200, 1200), (2400, 150)]:
            for style in ('card', 'overlay', 'film'):
                with self.subTest(size=size, style=style):
                    context = self.context(size)
                    scale = size[0] / 1200
                    result = RENDERERS[style](context, MetadataRenderOptions(style=style))
                    if style == 'overlay':
                        self.assertEqual(result.size, size)
                        self.assertEqual(result.getpixel((0, 0)), context.photo.getpixel((0, 0)))
                    else:
                        x = max(1, round((48 if style == 'card' else 64) * scale))
                        y = max(1, round((48 if style == 'card' else 56) * scale))
                        footer = max(1, round((188 if style == 'card' else 130) * scale))
                        self.assertEqual(result.size, (size[0] + 2*x, size[1] + y + footer))
                        rectangle = result.crop((x, y, x+size[0], y+size[1]))
                        self.assertIsNone(ImageChops.difference(rectangle, context.photo).getbbox())

    def test_themes_and_visibility_apply_to_every_style(self):
        for style, renderer in RENDERERS.items():
            for dark in (False, True):
                for gps in (False, True):
                    for colors in (False, True):
                        with self.subTest(style=style, dark=dark, gps=gps, colors=colors):
                            options = MetadataRenderOptions(style, 'slate-dark' if dark else 'linen-light', gps, colors)
                            result = renderer(self.context(), options)
                            self.assertEqual(result.mode, 'RGB')
                            if style != 'overlay':
                                expected = Image.new('RGB', (1, 1), options.background).getpixel((0, 0))
                                self.assertEqual(result.getpixel((0, 0)), expected)
                            shown = format_display_metadata(self.context(), options)
                            self.assertEqual(bool(shown['gps']), gps)
                            self.assertEqual(shown['location'], 'Oeschinensee, Switzerland')
        original = self.context()
        full = RENDERERS['original'](original, MetadataRenderOptions())
        hidden = RENDERERS['original'](original, MetadataRenderOptions(show_color_strip=False))
        self.assertEqual(full.height - hidden.height, 1200//7 + get_proportions(1200, 800, 300))

    def test_padding_contains_complete_composition_and_centers_on_theme_background(self):
        for style in ('card', 'overlay', 'film'):
            options = MetadataRenderOptions(style=style, theme='slate-dark')
            natural = RENDERERS[style](self.context(), options)
            for ratio in [(1, 1), (2, 3), (16, 9), (21, 9)]:
                result = pad_to_ratio(natural, ratio, options.background)
                self.assertGreaterEqual(result.width, natural.width)
                self.assertGreaterEqual(result.height, natural.height)
                self.assertLessEqual(abs(result.width*ratio[1] - result.height*ratio[0]), max(ratio))
                x, y = (result.width-natural.width)//2, (result.height-natural.height)//2
                self.assertIsNone(ImageChops.difference(result.crop((x, y, x+natural.width, y+natural.height)), natural).getbbox())
                self.assertEqual(result.getpixel((0, 0)), (13, 13, 16) if style != 'film' else (9, 9, 11))

    def test_display_formatting_sparse_exif_and_signed_zero_coordinates(self):
        shown = format_display_metadata(self.context(), MetadataRenderOptions())
        self.assertEqual(shown['camera'], 'FUJIFILM X-T5')
        self.assertEqual(shown['date'], '2025.09.18')
        self.assertIn('35mm', shown['exposure'])
        self.assertIn('f/8.0', shown['exposure'])
        self.assertIn('46°29\'51.0"N', shown['gps'])
        meta = sample_metadata() | {'GPSLatitude': (0, 0, 0), 'GPSLongitudeRef': 'W'}
        shown = format_display_metadata(self.context(metadata=meta), MetadataRenderOptions())
        self.assertTrue(shown['gps'].startswith('0°00\'00.0"N'))
        self.assertIn('"W', shown['gps'])
        sparse = format_display_metadata(self.context(metadata={}, title=None, filename_title='real-name', location=''), MetadataRenderOptions())
        self.assertEqual(sparse['title'], 'real-name')
        for field in ('camera', 'lens', 'exposure', 'date', 'gps', 'decimal', 'location'):
            self.assertEqual(sparse[field], '')
        adjusted = format_display_metadata(self.context(metadata={'DateTimeOriginal': '09/18/2025 10:30:00'}), MetadataRenderOptions())
        self.assertEqual(adjusted['date'], '2025.09.18')

    def test_text_fitting_uses_bundled_fonts_and_stays_inside_bounds(self):
        for family in ('sans', 'mono'):
            font = load_font(family, 'SemiBold', 24)
            self.assertTrue(Path(font.path).is_file())
            for width in (0, 2, 50, 500):
                text, fitted = fit_text('Very long location and camera metadata ' * 10, width, 24, family, 'SemiBold')
                self.assertLessEqual(fitted.getlength(text), width)
                self.assertGreaterEqual(fitted.size, 17)
            for style in ('card', 'overlay', 'film'):
                RENDERERS[style](self.context(title='long ' * 200, location='location ' * 200), MetadataRenderOptions(style=style))

    def test_orientation_palette_skip_and_new_default_sizing_through_entrypoint(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'rotated.jpg'
            exif = Image.Exif()
            exif[274] = 6
            Image.new('RGB', (120, 80), 'orange').save(path, exif=exif)
            for style in RENDERERS:
                with self.subTest(style=style), patch.object(image_transformer, 'extract_colors') as old, patch.object(image_transformer, 'extract_dominant_palette') as new:
                    options = MetadataRenderOptions(style=style, show_color_strip=False)
                    image = image_transformer.process_image(str(path), render_options=options)
                    old.assert_not_called()
                    new.assert_not_called()
                    if style == 'overlay':
                        self.assertEqual(image.size, (80, 120))
                    elif style == 'card':
                        self.assertEqual(image.size, (86, 136))
                    elif style == 'film':
                        self.assertEqual(image.size, (88, 133))
            for style in RENDERERS:
                tiny = Path(folder) / 'tiny.png'
                Image.new('RGB', (1, 1), 'red').save(tiny)
                image = image_transformer.process_image(str(tiny), render_options=MetadataRenderOptions(style=style))
                self.assertGreaterEqual(min(image.size), 1)

    def test_overlay_blends_panel_and_gradient_without_affecting_top_photo(self):
        context = self.context(metadata={}, title='', location='', palette=None)
        light = RENDERERS['overlay'](context, MetadataRenderOptions(style='overlay'))
        dark = RENDERERS['overlay'](context, MetadataRenderOptions(style='overlay', theme='slate-dark'))
        self.assertEqual(light.getpixel((600, 100)), context.photo.getpixel((600, 100)))
        self.assertGreater(sum(light.getpixel((600, 700))), sum(context.photo.getpixel((600, 700))))
        self.assertLess(sum(dark.getpixel((600, 700))), sum(context.photo.getpixel((600, 700))))
        self.assertLess(sum(light.getpixel((0, 799))), sum(context.photo.getpixel((0, 799))))


if __name__ == '__main__':
    unittest.main()
