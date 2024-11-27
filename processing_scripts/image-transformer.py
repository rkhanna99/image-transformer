import json, string, os, piexif, helpers as helpers
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
"""
Override the display function of the Palette class to allow more flexibility 
in how palettes are rendered and saved (e.g., float-based width and height).
"""
Palette.display = local_display

# Scripting Process
# --------------------------------------------------------------------

# Open the desired image for transformation
"""
Open an image from the specified path for processing and ensure the orientation is corrected based on EXIF data.

- Input: 
  - `image_path` (str): Path to the image file.
- Output:
  - `img` (PIL.Image): Opened and corrected image instance.
  - `img_dimensions` (dict): Dictionary with width and height of the image.
"""
# image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF1021-Enhanced-NR.jpg'  # Update this path to your image
image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Lightroom Enhanced JPGs/DSCF0555.jpg'
# image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF0352.jpg'
img = Image.open(image_path)
# Fix the image orientation
img = ImageOps.exif_transpose(img)
img_dimensions = get_dimensions(img)
print(get_dimensions(img))

# Get the metadata of the image and generate an image from it
"""
Extract metadata (e.g., camera details, GPS location, etc.) from the image and create a separate image to overlay this metadata.

- Inputs:
  - `image_path` (str): Path to the image.
  - Latitude/Longitude: Optional GPS coordinates for the image.
- Outputs:
  - `metadata` (dict): Extracted metadata.
  - `metadata_image` (PIL.Image): Image displaying metadata details.
"""
# metadata = get_image_metadata(image_path)
metadata = get_image_metadata(image_path, 46.4975, 7.7149)
print(metadata)
metadata_image = generate_metadata_image(metadata, img_dimensions["img_width"], img_dimensions["img_height"], "Lake Oeschinensee")
# metadata_image.show()

# Use Pylette to extract the colors
"""
Use the Pylette library to extract a color palette from the image, save it as a separate image, and prepare it for merging.

- Inputs:
  - `image_path` (str): Path to the image.
  - `palette_size` (int): Number of colors to extract.
- Outputs:
  - `palette` (Pylette Palette): Extracted palette object.
  - `palette_dimensions` (dict): Width and height for the palette rendering.
  - Saved `color_palette.jpg` file.
"""
palette = extract_colors(image=image_path, palette_size=7)
palette_dimensions = get_palette_dimensions(img, 7)
print(palette_dimensions)
palette.display(w=palette_dimensions["palette_width"], h=palette_dimensions["palette_width"],filename='color_palette', extension='jpg', save_to_file=True)
palette_image = Image.open('./color_palette.jpg')

# Merge the pictures and set a white space
"""
Combine the metadata image, the original image, and the color palette into a single stacked image.

- Inputs:
  - `metadata_image` (PIL.Image)
  - `img` (PIL.Image)
  - `palette_image` (PIL.Image)
  - `white_space` (int): Space between images in the stack.
- Output:
  - `new_image` (PIL.Image): Combined stacked image.
"""
white_space = get_proportions(img.width, img.height, 300)
new_image = Image.new('RGB', (img_dimensions["img_width"], int(img_dimensions["img_height"]) + int(palette_dimensions["palette_width"]) + metadata_image.height + white_space), (255, 255, 255))
new_image.paste(metadata_image, (0, 0))
new_image.paste(img, (0, metadata_image.height))
new_image.paste(palette_image, (0, metadata_image.height + img_dimensions["img_height"] + white_space))
print(new_image.size)
print(f"Additional Height Padding (400 for 40MP uncropped): {get_proportions(img.width, img.height, 400)}")
# new_image.show()

# Determine whether the generated image will be used for a print (Hardcode this for now)
"""
Determine the horizontal and vertical padding based on the intended use (e.g., print vs. display).

- Input:
  - `used_for_print` (bool): Whether the image is intended for printing.
  - Optional `desired_aspect_ratio` (tuple[int, int]): Target print aspect ratio.
- Output:
  - `horizontal_padding` (int): Padding on the horizontal sides.
  - `vertical_padding` (int): Padding on the vertical sides.
"""
used_for_print = True
if used_for_print == True:
    # Set the horizonal and vertical padding according to common print apsect ratios
    horizontal_padding, vertical_padding = setup_print_padding(img, new_image, 400, (2,3))
else:
    # Use a constant border value
    target_border = 600
    # Get the value of our border using the helper method (A 40 MP image should have a border value of 600)
    horizontal_padding = vertical_padding = get_proportions(img.width, img.height, target_border)
    print(f"Horizontal padding: {horizontal_padding} and Vertical padding: {vertical_padding}")


# Define border size and color
"""
Add a white border to the combined image and save it to the appropriate folder based on usage.

- Inputs:
  - `new_image` (PIL.Image): Stacked image without border.
  - `horizontal_padding` (int), `vertical_padding` (int): Border dimensions.
  - `border_color` (tuple[int, int, int]): Border color (default: white).
  - `destination_folder` (str): Target folder for saving the image.
- Output:
  - Final image is saved as a high-quality JPG file.
"""
border_size = (horizontal_padding, vertical_padding, horizontal_padding, vertical_padding)
border_color = (255, 255, 255)

# Add border to the image
img_with_border = ImageOps.expand(new_image, border=border_size, fill=border_color)
print(f"Final Image Dimensions: {img_with_border.width} * {img_with_border.height}")

# Save the new image
destination_folder = "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/" if used_for_print != True else "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/Prints/"
save_image(img_with_border, image_path, destination_folder)

# Display the image with border
"""
Display the final image with border for verification.
"""
img_with_border.show()
