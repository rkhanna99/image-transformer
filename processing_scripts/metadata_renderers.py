"""Pure Pillow metadata compositions, measured in the Figma design's 1200px units."""

from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
import math
from pathlib import Path
from typing import Any, Mapping

from PIL import Image, ImageDraw, ImageFont
from Pylette import Palette

from processing_scripts.helpers import (
    dms_to_decimal, generate_metadata_image, get_palette_dimensions,
    get_proportions, local_display,
)


@dataclass(frozen=True)
class MetadataRenderOptions:
    style: str = "original"
    theme: str = "linen-light"
    show_gps: bool = True
    show_color_strip: bool = True

    def __post_init__(self):
        if not isinstance(self.style, str) or self.style not in {"original", "card", "overlay", "film"}:
            raise ValueError("overlayStyle must be original, card, overlay, or film")
        if not isinstance(self.theme, str) or self.theme not in {"linen-light", "slate-dark"}:
            raise ValueError("themeTone must be linen-light or slate-dark")
        if type(self.show_gps) is not bool or type(self.show_color_strip) is not bool:
            raise ValueError("Metadata visibility options must be booleans")

    @classmethod
    def from_mapping(cls, values: Mapping):
        return cls(
            style=values.get("overlayStyle", "original"),
            theme=values.get("themeTone", "linen-light"),
            show_gps=values.get("showGpsCoordinates", True),
            show_color_strip=values.get("showColorStrip", True),
        )

    def as_payload(self):
        return {
            "overlayStyle": self.style, "themeTone": self.theme,
            "showGpsCoordinates": self.show_gps, "showColorStrip": self.show_color_strip,
        }

    @property
    def dark(self):
        return self.theme == "slate-dark"

    @property
    def background(self):
        if self.style == "film":
            return "#09090B" if self.dark else "#FAFAFA"
        return "#0D0D10" if self.dark else "#FFFFFF"


@dataclass
class MetadataRenderContext:
    photo: Image.Image
    metadata: dict[str, Any]
    title: str | None = None
    location: str = ""
    palette: Palette | None = None
    filename_title: str = ""
    ratio_label: str = "DEFAULT"


def _number(value, pattern="g"):
    try:
        number = float(value)
        return format(number, pattern) if math.isfinite(number) else ""
    except (TypeError, ValueError, ZeroDivisionError, OverflowError):
        return ""


def _named_parts(make, model):
    make, model = str(make or "").strip(), str(model or "").strip()
    return model if model.casefold().startswith(make.casefold()) else " ".join(filter(None, (make, model)))


def _coordinates(metadata):
    try:
        lat_ref, lon_ref = metadata["GPSLatitudeRef"], metadata["GPSLongitudeRef"]
        if lat_ref not in {"N", "S"} or lon_ref not in {"E", "W"}:
            return None
        lat = dms_to_decimal(metadata["GPSLatitude"], lat_ref)
        lon = dms_to_decimal(metadata["GPSLongitude"], lon_ref)
        if math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180:
            return lat, lon
    except (KeyError, TypeError, ValueError, IndexError, ZeroDivisionError, OverflowError):
        pass
    return None


def format_display_metadata(context, options):
    """Format only real values; keep the legacy renderer's strings independent."""
    meta = context.metadata
    capture_date = ""
    for pattern in ("%Y:%m:%d %H:%M:%S", "%m/%d/%Y %H:%M:%S"):
        try:
            capture_date = datetime.strptime(meta.get("DateTimeOriginal", ""), pattern).strftime("%Y.%m.%d")
            break
        except (TypeError, ValueError):
            continue
    focal = _number(meta.get("FocalLength"))
    aperture = _number(meta.get("FNumber"), ".1f")
    iso = _number(meta.get("ISOSpeedRatings"))
    exposure_parts = list(filter(None, (
        f"{focal}mm" if focal else "", f"f/{aperture}" if aperture else "",
        f"{meta['ShutterSpeedValue']}s" if meta.get("ShutterSpeedValue") else "",
        f"ISO {iso}" if iso else "",
    )))
    lens = _named_parts(meta.get("LensMake"), meta.get("LensModel"))
    gps, decimal = "", ""
    coordinates = _coordinates(meta) if options.show_gps else None
    if coordinates is not None:
        parts = []
        for value, positive, negative in zip(coordinates, ("N", "E"), ("S", "W")):
            # Round before splitting, so 59.96 seconds carries into the next minute.
            tenths = round(abs(value) * 36000)
            degrees, remainder = divmod(tenths, 36000)
            minutes, seconds = divmod(remainder, 600)
            parts.append(f'{degrees}°{minutes:02d}\'{seconds / 10:04.1f}"{positive if value >= 0 else negative}')
        gps = "  ".join(parts)
        decimal = f"{coordinates[0]:.4f}, {coordinates[1]:.4f}"
    return {
        "title": context.title or context.filename_title,
        "location": context.location,
        "camera": _named_parts(meta.get("Make"), meta.get("Model")),
        "lens": lens, "exposure": "  ".join(exposure_parts),
        "card_specs": "  ·  ".join(filter(None, (lens, *exposure_parts))),
        "date": capture_date, "gps": gps, "decimal": decimal,
    }


_FONT_ROOT = Path(__file__).resolve().parents[1] / "fonts"


@lru_cache(maxsize=256)
def load_font(family, weight, size):
    directory, name = ("jetbrains-mono", "JetBrainsMono") if family == "mono" else ("plus-jakarta-sans", "PlusJakartaSans")
    return ImageFont.truetype(str(_FONT_ROOT / directory / f"{name}-{weight}.ttf"), max(1, size))


def fit_text(text, width, size, family="sans", weight="Regular"):
    """Shrink to 70%, then ellipsize within a measured horizontal bound."""
    text = " ".join(str(text or "").split())
    size = max(1, round(size))
    minimum = max(1, math.ceil(size * .7))
    font = load_font(family, weight, size)
    if not text or width <= 0:
        return "", font
    while font.getlength(text) > width and size > minimum:
        size -= 1
        font = load_font(family, weight, size)
    if font.getlength(text) <= width:
        return text, font
    if font.getlength("…") > width:
        return "", font
    low, high = 0, len(text)
    while low < high:
        middle = (low + high + 1) // 2
        if font.getlength(text[:middle] + "…") <= width:
            low = middle
        else:
            high = middle - 1
    return text[:low] + "…", font


def _text(draw, text, x, baseline, width, size, color, scale, family="sans", weight="Regular", right=False):
    text, font = fit_text(str(text or ""), width, size * scale, family, weight)
    if text:
        if right:
            x -= font.getlength(text)
        draw.text((round(x), round(baseline)), text, font=font, fill=color, anchor="ls")


def _colors(options):
    return (
        "#FAFAFA" if options.dark else "#09090B",
        "#A1A1AA" if options.dark else "#52525B",
        "#71717A", "#27272A" if options.dark else "#E4E4E7",
    )


def _photo_rgb(photo, background):
    if "A" in photo.getbands() or "transparency" in photo.info:
        rgba = photo.convert("RGBA")
        result = Image.new("RGB", photo.size, background)
        result.paste(rgba, mask=rgba.getchannel("A"))
        return result
    return photo.convert("RGB")


def _swatches(draw, context, options, right, y, sw, sh, gap, radius, scale, outline=None):
    colors = context.palette.colors[:6] if options.show_color_strip and context.palette is not None else []
    width = (len(colors) * sw + max(0, len(colors) - 1) * gap) * scale
    for index, color in enumerate(colors):
        x = round(right - width + index * (sw + gap) * scale)
        w, h = max(1, round(sw * scale)), max(1, round(sh * scale))
        draw.rounded_rectangle(
            (x, round(y), x + w - 1, round(y) + h - 1), radius=max(0, round(radius * scale)),
            fill=tuple(int(c) for c in color.rgb), outline=outline,
            width=max(1, round(scale)),
        )
    return width


def render_original(context, options):
    photo, metadata = context.photo, context.metadata
    header = generate_metadata_image(
        metadata, photo.width, photo.height, context.title,
        background=options.background, foreground="#FAFAFA" if options.dark else (0, 0, 0),
        show_gps=options.show_gps,
    )
    palette_image = None
    gap = 0
    if options.show_color_strip and context.palette is not None:
        dimensions = get_palette_dimensions(photo, 7)
        tile_width = dimensions["palette_width"] if photo.width >= 7 else photo.width / context.palette.number_of_colors
        palette_image = local_display(context.palette, w=tile_width, h=max(1, dimensions["palette_width"]))
        gap = get_proportions(photo.width, photo.height, 300)
    height = photo.height + header.height + (palette_image.height + gap if palette_image is not None else 0)
    result = Image.new("RGB", (photo.width, height), options.background)
    result.paste(header, (0, 0))
    # Preserve the legacy RGB composition exactly for the default appearance.
    result.paste(photo, (0, header.height))
    if palette_image is not None:
        result.paste(palette_image, (0, header.height + photo.height + gap))
    return result


def render_card(context, options):
    photo = context.photo
    scale = photo.width / 1200
    pad, footer = max(1, round(48 * scale)), max(1, round(188 * scale))
    result = Image.new("RGB", (photo.width + 2 * pad, photo.height + pad + footer), options.background)
    primary, secondary, muted, border = _colors(options)
    draw = ImageDraw.Draw(result)
    # The keyline sits outside the photo, preserving its complete rectangle.
    draw.rectangle((pad - 1, pad - 1, pad + photo.width, pad + photo.height), outline=border, width=max(1, round(scale)))
    result.paste(_photo_rgb(photo, options.background), (pad, pad))
    meta = format_display_metadata(context, options)
    top = pad + photo.height + 34 * scale
    left, right = pad, result.width - pad
    left_width = (photo.width - 24 * scale) * .45
    right_width = (photo.width - 24 * scale) * .55
    _text(draw, meta["title"], left, top + 20 * scale, left_width, 28, primary, scale, weight="Bold")
    _text(draw, meta["location"], left, top + 54 * scale, left_width, 19, secondary, scale, weight="Medium")
    gps = f"GPS · {meta['gps']} ({meta['decimal']})" if meta["gps"] else ""
    _text(draw, gps, left, top + 84 * scale, left_width, 15, muted, scale, "mono", "Medium")
    _text(draw, meta["camera"], right, top + 18 * scale, right_width, 21, primary, scale, weight="SemiBold", right=True)
    _text(draw, meta["card_specs"], right, top + 48 * scale, right_width, 16, secondary, scale, "mono", "Medium", True)
    date = f"CAPTURED {meta['date']}" if meta["date"] else ""
    _text(draw, date, right, top + 74 * scale, right_width, 14, muted, scale, "mono", right=True)
    _swatches(draw, context, options, right, top + 92 * scale, 36, 16, 6, 3, scale, border)
    return result


def render_overlay(context, options):
    photo = context.photo
    # Keep the complete HUD and vignette inside shallow/panoramic photographs.
    scale = min(photo.width / 1200, photo.height / 260)
    result = _photo_rgb(photo, options.background)
    gradient_height = min(photo.height, max(1, round(260 * scale)))
    gradient = Image.new("L", (1, gradient_height))
    gradient.putdata([round(255 * .82 * y / max(1, gradient_height - 1)) for y in range(gradient_height)])
    result.paste((15, 20, 26), (0, photo.height - gradient_height, photo.width, photo.height), gradient.resize((photo.width, gradient_height)))
    margin = max(0, round(36 * scale))
    height = min(photo.height - margin, max(1, round(132 * scale)))
    y = photo.height - height - margin
    panel_width = max(1, photo.width - margin * 2)
    panel = Image.new("RGBA", (panel_width, height))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle(
        (0, 0, panel_width - 1, height - 1),
        radius=max(0, round(14 * scale)),
        fill=(20, 25, 32, 199) if options.dark else (248, 245, 238, 219),
        outline=(255, 255, 255, 36) if options.dark else (30, 37, 45, 38),
        width=max(1, round(1.5 * scale)),
    )
    result.paste(panel, (margin, y), panel.getchannel("A"))
    draw = ImageDraw.Draw(result)
    primary, secondary, muted, _ = _colors(options)
    meta = format_display_metadata(context, options)
    left, right = margin + 28 * scale, photo.width - margin - 28 * scale
    available = max(0, right - left - 24 * scale)
    left_width, right_width = available * .45, available * .55
    _text(draw, meta["title"], left, y + 42 * scale, left_width, 24, primary, scale, weight="Bold")
    _text(draw, meta["location"], left, y + 72 * scale, left_width, 17, secondary, scale, weight="Medium")
    gps_date = "  ·  ".join(filter(None, (meta["gps"], meta["date"])))
    _text(draw, gps_date, left, y + 102 * scale, left_width, 14, muted, scale, "mono", "Medium")
    _text(draw, meta["camera"], right, y + 42 * scale, right_width, 19, primary, scale, weight="SemiBold", right=True)
    _text(draw, meta["exposure"], right, y + 70 * scale, right_width, 15, secondary, scale, "mono", "Medium", True)
    _swatches(draw, context, options, right, y + 88 * scale, 28, 14, 6, 4, scale)
    return result


def render_film(context, options):
    photo = context.photo
    scale = photo.width / 1200
    side, top, bottom = (max(1, round(value * scale)) for value in (64, 56, 130))
    result = Image.new("RGB", (photo.width + 2 * side, photo.height + top + bottom), options.background)
    result.paste(_photo_rgb(photo, options.background), (side, top))
    draw = ImageDraw.Draw(result)
    primary, secondary, muted, _ = _colors(options)
    meta = format_display_metadata(context, options)
    right = result.width - side
    date_font = load_font("mono", "SemiBold", max(1, round(14 * scale)))
    date_width = date_font.getlength(meta["date"])
    _text(draw, f"FRAME {meta['title']}  ·  {context.ratio_label}", side, 36 * scale, max(0, photo.width - date_width - 24 * scale), 14, muted, scale, "mono", "SemiBold")
    _text(draw, meta["date"], right, 36 * scale, photo.width * .3, 14, muted, scale, "mono", "SemiBold", True)
    baseline = top + photo.height + 44 * scale
    swatch_width = _swatches(draw, context, options, right, baseline - 18 * scale, 32, 32, 8, 0, scale)
    title = " — ".join(filter(None, (meta["title"], meta["location"])))
    title_width = photo.width - (swatch_width + 24 * scale if swatch_width else 0)
    _text(draw, title, side, baseline, title_width, 22, primary, scale, "mono", "SemiBold")
    specs = "   //   ".join(filter(None, (meta["gps"], meta["camera"], meta["exposure"])))
    _text(draw, specs, side, baseline + 34 * scale, photo.width, 15, secondary, scale, "mono")
    return result


RENDERERS = {"original": render_original, "card": render_card, "overlay": render_overlay, "film": render_film}


def pad_to_ratio(image, ratio, background):
    """Center a complete composition in the smallest containing ratio canvas."""
    width, height = ratio
    if width <= 0 or height <= 0:
        raise ValueError("Aspect ratio dimensions must be positive")
    if image.width * height < image.height * width:
        size = (math.ceil(image.height * width / height), image.height)
    else:
        size = (image.width, math.ceil(image.width * height / width))
    result = Image.new("RGB", size, background)
    result.paste(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return result
