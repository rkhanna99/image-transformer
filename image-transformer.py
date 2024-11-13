import json, string, os, piexif, helpers
from PIL import Image, ImageOps, ExifTags, ImageDraw, ImageFont
from helpers import *
from PIL.ExifTags import TAGS, GPSTAGS
from Pylette import extract_colors
from Pylette import Palette
from typing import Any
from fractions import Fraction
from math import gcd
import numpy as np

# Function overrides
# --------------------------------------------------------------------

# Override the display function to allow the use of floats
Palette.display = local_display

# Scripting Process
# --------------------------------------------------------------------

# Open the desired image for transformation
# image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF1021-Enhanced-NR.jpg'  # Update this path to your image
# image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Lightroom Enhanced JPGs/DSCF0875.jpg'
image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF0352.jpg'
img = Image.open(image_path)
# Fix the image orientation
img = ImageOps.exif_transpose(img)
img_dimensions = get_dimensions(img)
print(get_dimensions(img))

# Get the metadata of the image and generate an image from it
# metadata = get_image_metadata(image_path)
metadata = get_image_metadata(image_path, 46.65401, 8.05935)
print(metadata)
metadata_image = generate_metadata_image(metadata, img_dimensions["img_width"], img_dimensions["img_height"], "Grindelwald First")
metadata_image.show()

# Use Pylette to extract the colors
palette = extract_colors(image=image_path, palette_size=7)
palette_dimensions = get_palette_dimensions(img, 7)
print(palette_dimensions)
palette.display(w=palette_dimensions["palette_width"], h=palette_dimensions["palette_width"],filename='color_palette', extension='jpg', save_to_file=True)
palette_image = Image.open('./color_palette.jpg')

# Merge the pictures and set a white space
white_space = get_proportions(img.width, img.height, 300)
new_image = Image.new('RGB', (img_dimensions["img_width"], int(img_dimensions["img_height"]) + int(palette_dimensions["palette_width"]) + metadata_image.height + white_space), (255, 255, 255))
new_image.paste(metadata_image, (0, 0))
new_image.paste(img, (0, metadata_image.height))
new_image.paste(palette_image, (0, metadata_image.height + img_dimensions["img_height"] + white_space))
# new_image.show()

# Determine whether the generated image will be used for a print (Hardcode this for now)
used_for_print = False
desired_aspect_ratio = (5, 4)
if used_for_print == True:
    # Get the aspect ratio of our image so that we maintain it after adding the palette and metadata image
    aspect_ratio = get_aspect_ratio(img) if desired_aspect_ratio is None else desired_aspect_ratio

    horizontal_padding, vertical_padding = calculate_padding_for_aspect_ratio(new_image, aspect_ratio, 400)

    print(new_image.size)
    print(f"Horizontal padding: {horizontal_padding} and Vertical padding: {vertical_padding}")
else:
    # Use a constant border value
    target_border = 600
    # Get the value of our border using the helper method (A 40 MP image should have a border value of 600)
    horizontal_padding = vertical_padding = get_proportions(img.width, img.height, target_border)

# Define border size and color
# border_size = (810, 400, 810, 400)
border_size = (1026, 400, 1026, 400)
border_color = (255, 255, 255)

# Add border to the image
img_with_border = ImageOps.expand(new_image, border=border_size, fill=border_color)

# Save the new image
destination_folder = "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/"
save_image(img_with_border, image_path, destination_folder)

# Display the image with border
img_with_border.show()
