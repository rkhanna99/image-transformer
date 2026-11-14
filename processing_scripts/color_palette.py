"""Deterministic palette extraction shared by processing services and renderers."""

import numpy as np
from PIL import ImageOps
from Pylette import Color, Palette
from sklearn.cluster import KMeans


def extract_dominant_palette(image, num_colors=7):
    """Group similar RGB shades and order them by sampled pixel frequency."""
    image = ImageOps.exif_transpose(image).convert('RGBA')
    image.thumbnail((256, 256))
    pixels = np.asarray(image)
    # Hidden RGB values in transparent backgrounds must not count as colors.
    visible_pixels = pixels[pixels[:, :, 3] > 0, :3]

    if len(visible_pixels) == 0:
        raise ValueError('The image has no visible pixels.')

    palette_size = min(num_colors, len(np.unique(visible_pixels, axis=0)))
    # Pylette uses a single K-means initialization, which can merge a distinct
    # accent color into another group while splitting similar shades instead.
    # Keep the best fit across multiple deterministic initializations.
    model = KMeans(n_clusters=palette_size, n_init=10, random_state=2024)
    labels = model.fit_predict(visible_pixels)
    counts = np.bincount(labels, minlength=palette_size)
    centers = np.rint(model.cluster_centers_).astype(int)
    colors = [
        Color(tuple(int(channel) for channel in rgb), float(count / len(visible_pixels)))
        for rgb, count in zip(centers, counts)
        if count > 0
    ]
    return Palette(
        sorted(colors, key=lambda color: color.freq, reverse=True)
    )


def palette_color_samples(palette):
    """Return RGB/frequency pairs from a Pylette palette."""
    samples = []
    for color in palette.colors:
        rgb = tuple(int(channel) for channel in color.rgb)
        samples.append((rgb, float(getattr(color, 'freq', 0.0))))
    return samples


