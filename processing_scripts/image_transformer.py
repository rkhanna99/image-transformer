"""Prepare metadata once, dispatch a composition, then apply print sizing."""

from pathlib import Path

from PIL import Image, ImageOps
from Pylette import extract_colors

from processing_scripts.color_palette import extract_dominant_palette
from processing_scripts.helpers import get_image_metadata, get_proportions, save_image, setup_print_padding
from processing_scripts.metadata_renderers import (
    MetadataRenderContext, MetadataRenderOptions, RENDERERS, pad_to_ratio,
)


def process_image(
    image_path: str, latitude: float = None, longitude: float = None,
    used_for_print=True, print_aspect_ratio: tuple[int, int] = None,
    photo_title: str = None, local_save: bool = False,
    render_options: MetadataRenderOptions | None = None,
    location_label: str | None = None, original_filename: str | None = None,
) -> Image.Image:
    """Build a full-resolution, uncropped metadata composition.

    Existing callers default to Original and its historical print sizing.
    The new styles keep their natural dimensions unless a ratio is supplied.
    """
    options = render_options or MetadataRenderOptions()
    with Image.open(image_path) as source:
        photo = ImageOps.exif_transpose(source)
        photo.load()
    metadata = get_image_metadata(image_path, latitude, longitude)
    palette = None
    if options.show_color_strip:
        if options.style == "original":
            palette = extract_colors(image=image_path, palette_size=min(7, photo.width * photo.height))
        else:
            palette = extract_dominant_palette(photo, 6)
    context = MetadataRenderContext(
        photo=photo, metadata=metadata, title=photo_title,
        location=(location_label or "").strip(), palette=palette,
        filename_title=Path(original_filename or image_path).stem,
        ratio_label=f"{print_aspect_ratio[0]}:{print_aspect_ratio[1]}" if print_aspect_ratio else "DEFAULT",
    )
    composition = RENDERERS[options.style](context, options)
    if options.style == "original":
        if used_for_print:
            horizontal, vertical = setup_print_padding(photo, composition, 400, print_aspect_ratio)
        else:
            horizontal = vertical = get_proportions(photo.width, photo.height, 600)
        result = ImageOps.expand(composition, border=(horizontal, vertical, horizontal, vertical), fill=options.background)
    elif print_aspect_ratio is not None:
        result = pad_to_ratio(composition, print_aspect_ratio, options.background)
    else:
        result = composition
    if local_save:
        destination = "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/"
        save_image(result, image_path, destination + ("Prints/" if used_for_print else ""))
    return result
