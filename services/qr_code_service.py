from __future__ import annotations

import base64
from dataclasses import dataclass
from io import BytesIO
import re
import warnings
from urllib.parse import urlsplit

import qrcode
from PIL import Image, ImageOps, UnidentifiedImageError
from qrcode.exceptions import DataOverflowError

from services.image_upload_service import extract_dominant_palette, palette_color_samples


CONTRAST_THRESHOLD = 7.0
PALETTE_COLOR_COUNT = 7
MODULE_SIZE = 16
QUIET_ZONE_MODULES = 4
MAX_REFERENCE_BYTES = 10 * 1024 * 1024
MAX_REFERENCE_PIXELS = 25_000_000
QR_NOTICE = 'Used black and white because the image palette did not provide enough contrast.'
MANUAL_NOTICE = 'Used a black or white default because the image palette did not provide enough contrast.'
_HEX_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')


@dataclass(frozen=True)
class ColorSelection:
    foreground: str
    background: str
    color_source: str
    notice: str | None


def validate_destination_url(value: str | None) -> str:
    if not value or value != value.strip() or any(char.isspace() or ord(char) < 32 for char in value):
        raise ValueError('Enter an absolute HTTP(S) URL with a hostname.')

    try:
        parts = urlsplit(value)
        hostname = parts.hostname
        # Accessing port validates its syntax and range even though we never connect to it.
        parts.port
    except ValueError as exc:
        raise ValueError('Enter a valid absolute HTTP(S) URL with a hostname.') from exc

    if parts.scheme.lower() not in {'http', 'https'} or not parts.netloc or not hostname:
        raise ValueError('Enter an absolute HTTP(S) URL with a hostname.')
    if parts.username is not None or parts.password is not None:
        raise ValueError('URLs with embedded usernames or passwords are not supported.')
    return value


def normalize_hex_color(value: str | None, field_name: str) -> str | None:
    if value is None or value == '':
        return None
    if not _HEX_COLOR.fullmatch(value):
        raise ValueError(f'{field_name} must be a 6-digit hex color such as #1A2B3C.')
    return value.upper()


def relative_luminance(color: str) -> float:
    channels = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(color_a: str, color_b: str) -> float:
    light = max(relative_luminance(color_a), relative_luminance(color_b))
    dark = min(relative_luminance(color_a), relative_luminance(color_b))
    return (light + 0.05) / (dark + 0.05)


def _to_hex(rgb: tuple[int, int, int]) -> str:
    return '#{:02X}{:02X}{:02X}'.format(*rgb)


def _normalized_samples(samples: list[tuple[tuple[int, int, int], float]]) -> list[tuple[str, float]]:
    frequencies: dict[str, float] = {}
    for rgb, frequency in samples:
        color = _to_hex(tuple(max(0, min(255, int(channel))) for channel in rgb))
        frequencies[color] = frequencies.get(color, 0.0) + max(0.0, frequency)
    return list(frequencies.items())


def _eligible_pairs(samples: list[tuple[str, float]]) -> list[tuple[float, float, float, str, str]]:
    pairs = []
    for foreground, fg_frequency in samples:
        fg_luminance = relative_luminance(foreground)
        for background, bg_frequency in samples:
            if fg_luminance >= relative_luminance(background):
                continue
            ratio = contrast_ratio(foreground, background)
            if ratio >= CONTRAST_THRESHOLD:
                # Contrast is the primary ranking; palette frequency breaks ties.
                pairs.append((ratio, fg_frequency + bg_frequency, fg_frequency * bg_frequency, foreground, background))
    return sorted(pairs, key=lambda pair: (-pair[0], -pair[1], -pair[2], pair[3], pair[4]))


def _best_palette_partner(
    fixed_color: str,
    missing_role: str,
    samples: list[tuple[str, float]],
) -> str | None:
    candidates = []
    for candidate, frequency in samples:
        foreground, background = (fixed_color, candidate) if missing_role == 'background' else (candidate, fixed_color)
        if relative_luminance(foreground) >= relative_luminance(background):
            continue
        ratio = contrast_ratio(foreground, background)
        if ratio >= CONTRAST_THRESHOLD:
            candidates.append((ratio, frequency, candidate))
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: (-item[0], -item[1], item[2]))[0][2]


def choose_qr_colors(
    palette_samples: list[tuple[tuple[int, int, int], float]],
    foreground: str | None = None,
    background: str | None = None,
    has_reference: bool = False,
) -> ColorSelection:
    foreground = normalize_hex_color(foreground, 'Foreground')
    background = normalize_hex_color(background, 'Background')
    samples = _normalized_samples(palette_samples)
    has_manual = foreground is not None or background is not None

    if foreground is not None and background is not None:
        if relative_luminance(foreground) >= relative_luminance(background) or contrast_ratio(foreground, background) < CONTRAST_THRESHOLD:
            raise ValueError('Choose a darker foreground and a background with at least 7:1 contrast.')
        return ColorSelection(foreground, background, 'manual', None)

    if not has_manual and not has_reference:
        return ColorSelection('#000000', '#FFFFFF', 'default', None)

    if not has_manual:
        pairs = _eligible_pairs(samples)
        if pairs:
            _, _, _, selected_foreground, selected_background = pairs[0]
            return ColorSelection(selected_foreground, selected_background, 'palette', None)
        return ColorSelection('#000000', '#FFFFFF', 'fallback', QR_NOTICE)

    if foreground is not None:
        selected_background = _best_palette_partner(foreground, 'background', samples) if has_reference else None
        used_default = selected_background is None
        if selected_background is None:
            selected_background = '#FFFFFF'
        if relative_luminance(foreground) >= relative_luminance(selected_background) or contrast_ratio(foreground, selected_background) < CONTRAST_THRESHOLD:
            raise ValueError('The foreground color needs a lighter background with at least 7:1 contrast.')
        notice = MANUAL_NOTICE if has_reference and used_default else None
        return ColorSelection(foreground, selected_background, 'manual', notice)

    selected_foreground = _best_palette_partner(background, 'foreground', samples) if has_reference else None
    used_default = selected_foreground is None
    if selected_foreground is None:
        selected_foreground = '#000000'
    if relative_luminance(selected_foreground) >= relative_luminance(background) or contrast_ratio(selected_foreground, background) < CONTRAST_THRESHOLD:
        raise ValueError('The background color needs a darker foreground with at least 7:1 contrast.')
    notice = MANUAL_NOTICE if has_reference and used_default else None
    return ColorSelection(selected_foreground, background, 'manual', notice)


def _read_reference_palette(reference_image) -> list[tuple[tuple[int, int, int], float]]:
    if not reference_image:
        return []

    contents = reference_image.stream.read(MAX_REFERENCE_BYTES + 1)
    if len(contents) > MAX_REFERENCE_BYTES:
        raise ValueError('Reference images must be 10 MB or smaller.')
    if not contents:
        raise ValueError('The selected reference image is empty.')

    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(contents)) as image:
                width, height = image.size
                if width <= 0 or height <= 0 or width * height > MAX_REFERENCE_PIXELS:
                    raise ValueError('Reference images must contain 25 megapixels or fewer.')
                image.load()
                image = ImageOps.exif_transpose(image)
                palette = extract_dominant_palette(image, PALETTE_COLOR_COUNT)
                return palette_color_samples(palette)
    except ValueError as exc:
        if str(exc) == 'The image has no visible pixels.':
            return []
        raise ValueError('Unable to read this image. Please upload a valid, supported image file.') from exc
    except (OSError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Unable to read this image. Please upload a valid, supported image file.') from exc


def generate_qr_code(
    destination_url: str | None,
    reference_image=None,
    foreground: str | None = None,
    background: str | None = None,
    export_format: str | None = None,
) -> dict:
    destination_url = validate_destination_url(destination_url)
    foreground = normalize_hex_color(foreground, 'Foreground')
    background = normalize_hex_color(background, 'Background')
    export_format = (export_format or 'png').lower()
    if export_format not in {'png', 'jpeg'}:
        raise ValueError('Format must be PNG or JPEG.')

    palette_samples = _read_reference_palette(reference_image)
    selection = choose_qr_colors(palette_samples, foreground, background, bool(reference_image))

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=MODULE_SIZE,
        border=QUIET_ZONE_MODULES,
    )
    try:
        qr.add_data(destination_url)
        qr.make(fit=True)
    except DataOverflowError as exc:
        raise ValueError('This URL is too long to fit in a QR code. Shorten the destination URL and try again.') from exc
    except ValueError as exc:
        # Some qrcode releases surface an overflow as version 41 validation.
        if 'Invalid version' in str(exc) and '41' in str(exc):
            raise ValueError('This URL is too long to fit in a QR code. Shorten the destination URL and try again.') from exc
        raise

    image = qr.make_image(
        fill_color=selection.foreground,
        back_color=selection.background,
    ).get_image().convert('RGB')
    width, height = image.size
    image_buffer = BytesIO()
    if export_format == 'png':
        image.save(image_buffer, format='PNG')
        mime_type, filename = 'image/png', 'qr-code.png'
    else:
        image.save(image_buffer, format='JPEG', quality=95, subsampling=0)
        mime_type, filename = 'image/jpeg', 'qr-code.jpeg'

    image_bytes = image_buffer.getvalue()
    encoded = base64.b64encode(image_bytes).decode('ascii')
    return {
        'image_data_url': f'data:{mime_type};base64,{encoded}',
        'url': destination_url,
        'mime_type': mime_type,
        'filename': filename,
        'foreground': selection.foreground,
        'background': selection.background,
        'palette': [_to_hex(rgb) for rgb, _ in palette_samples],
        'color_source': selection.color_source,
        'notice': selection.notice,
        'width': width,
        'height': height,
    }
