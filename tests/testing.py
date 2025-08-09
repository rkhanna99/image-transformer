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

# Adding a border but maintaining the aspect ratio
def add_border_to_achieve_aspect_ratio(image_path, output_path, target_aspect_ratio=(3, 2), border_color=(255, 255, 255)):
    # Open the image
    image = Image.open(image_path)
    width, height = image.size
    
    horizontal_border_size = 1200
    vertical_border_size = 800

    # Add the calculated border to the image
    image_with_border = ImageOps.expand(image, border=(horizontal_border_size, vertical_border_size, horizontal_border_size, vertical_border_size), fill=border_color)
    
    # Save the result
    image_with_border.show()

# Example usage
img_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF0352.jpg'
add_border_to_achieve_aspect_ratio(img_path, "output_image_3_2_aspect.jpg", target_aspect_ratio=(3, 2))