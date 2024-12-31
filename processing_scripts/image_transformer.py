import json, string, os, piexif
from PIL import Image, ImageOps, ExifTags, ImageDraw, ImageFont
from processing_scripts.helpers import *
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

# Image processing
# --------------------------------------------------------------------

def process_image(image_path: string, latitude: float=None, longitude: float=None, used_for_print=True, print_aspect_ratio: tuple[int, int]=None, photo_title: string=None) -> Image:
    """
    Processes an image by extracting metadata, generating a color palette, 
    and combining these elements into a final image with optional print-friendly borders.

    This function opens an image, corrects its orientation, extracts metadata, 
    generates a color palette, and stacks the metadata, image, and palette into a 
    composite image. If `used_for_print` is True, it adjusts the image to fit a 
    specified aspect ratio for printing.

    Args:
        image_path (str): 
            Path to the input image file.
        latitude (float, optional): 
            Latitude for geotagging the image. Default is None.
        longitude (float, optional): 
            Longitude for geotagging the image. Default is None.
        used_for_print (bool, optional): 
            Indicates whether the image should be formatted for print. 
            Default is True.
        print_aspect_ratio (tuple[int, int], optional): 
            Target aspect ratio for the print layout. If None, a default 
            aspect ratio is used. Default is None.
        photo_title (str, optional): 
            Title for the photo to be included in the metadata section. 
            Default is None.

    Returns:
        Image: 
            The final processed image with metadata, palette, and optional borders.

    Raises:
        FileNotFoundError: 
            If the specified `image_path` does not exist.
        ValueError: 
            If the image cannot be opened or processed due to invalid data.
        Exception: 
            For any other processing errors.

    Workflow:
        1. Opens the image and fixes its orientation based on EXIF data.
        2. Extracts metadata and generates a metadata image.
        3. Extracts a color palette from the image and generates a palette image.
        4. Stacks the metadata image, original image, and palette image vertically.
        5. Adds a border to the final image:
            - For print: Adjusts padding to fit the specified `print_aspect_ratio`.
            - Otherwise: Adds a constant border.
        6. Saves the final image to a destination folder.
        7. Displays the processed image.

    Example:
        >>> process_image(
        ...     image_path="image.jpg",
        ...     latitude=46.4975,
        ...     longitude=7.7149,
        ...     used_for_print=True,
        ...     print_aspect_ratio=(2, 3),
        ...     photo_title="My Photo"
        ... )
    """
    # Open an image from the specified path for processing and ensure the orientation is corrected based on EXIF data.
    
    img = Image.open(image_path)
    # Fix the image orientation
    img = ImageOps.exif_transpose(img)
    img_dimensions = get_dimensions(img)
    print(get_dimensions(img))

    # Get the image metadata and use that to generate a separate image
    # Here we can use the optional latitude, longitude, and photo title

    metadata = get_image_metadata(image_path, latitude, longitude)
    print(metadata)
    metadata_image = generate_metadata_image(metadata, img_dimensions["img_width"], img_dimensions["img_height"], photo_title)
    # metadata_image.show()

    # Setup the palette image and show a preview of it

    palette = extract_colors(image=image_path, palette_size=7)
    palette_dimensions = get_palette_dimensions(img, 7)
    print(palette_dimensions)
    palette.display(w=palette_dimensions["palette_width"], h=palette_dimensions["palette_width"],filename='color_palette', extension='jpg', save_to_file=True)
    palette_image = Image.open('./color_palette.jpg')

    # Stack the 3 images together (Metadata image -> main image -> palette image)

    white_space = get_proportions(img.width, img.height, 300)
    new_image = Image.new('RGB', (img_dimensions["img_width"], int(img_dimensions["img_height"]) + int(palette_dimensions["palette_width"]) + metadata_image.height + white_space), (255, 255, 255))
    new_image.paste(metadata_image, (0, 0))
    new_image.paste(img, (0, metadata_image.height))
    new_image.paste(palette_image, (0, metadata_image.height + img_dimensions["img_height"] + white_space))
    print(new_image.size)
    print(f"Additional Height Padding (400 for 40MP uncropped): {get_proportions(img.width, img.height, 400)}")
    # new_image.show()

    # Adjust the borders of the image to fit a certain aspect ratio if used for a print

    if used_for_print == True:
        # Set the horizonal and vertical padding according to common print apsect ratios
        horizontal_padding, vertical_padding = setup_print_padding(img, new_image, 400, print_aspect_ratio)
    else:
        # Use a constant border value
        target_border = 600
        # Get the value of our border using the helper method (A 40 MP image should have a border value of 600)
        horizontal_padding = vertical_padding = get_proportions(img.width, img.height, target_border)
        print(f"Horizontal padding: {horizontal_padding} and Vertical padding: {vertical_padding}")

    # Define the border

    border_size = (horizontal_padding, vertical_padding, horizontal_padding, vertical_padding)
    border_color = (255, 255, 255)

    # Add border to the image

    img_with_border = ImageOps.expand(new_image, border=border_size, fill=border_color)
    print(f"Final Image Dimensions: {img_with_border.width} * {img_with_border.height}")

    # Save the new image

    destination_folder = "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/" if used_for_print != True else "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Image Transformer JPGs/Prints/"
    save_image(img_with_border, image_path, destination_folder)

    # Display the image with border

    # img_with_border.show()

    # Return the image 

    return img_with_border

# Main method for standalone execution
if __name__ == "__main__":
    image_path = "C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/Lightroom Enhanced JPGs/DSCF0297.jpg"
    latitude, longitude = 45.9845, 7.7654
    used_for_print = True
    photo_title = "Rotenboden"
    img_with_border = process_image(image_path, latitude, longitude, used_for_print=True, print_aspect_ratio=(2,3), photo_title="Rotenboden")
    img_with_border.show()
