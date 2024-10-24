import json, string, os
from PIL import Image, ImageOps, ExifTags, ImageDraw, ImageFont
from PIL.ExifTags import TAGS, GPSTAGS
from Pylette import extract_colors
from Pylette import Palette
from typing import Any
from fractions import Fraction
import numpy as np

# Helper Functions
# --------------------------------------------------------------------

# Helper function to get image metadata
def get_image_metadata(image_path):
    with Image.open(image_path) as img:
        # Get Image metadata and GPS metadata if available
        img_metadata = {ExifTags.TAGS[k]: v for k, v in img._getexif().items() if k in ExifTags.TAGS}
        gps_metadata = {ExifTags.GPSTAGS[k]: v for k, v in img._getexif().items() if k in ExifTags.GPSTAGS}
        metadata = img_metadata | gps_metadata

        # Clean the data of any possible unwanted binary chars
        printable_chars = set(string.printable)
        cleaned_metadata = {}

        # Iterate through the dictionary
        for k, v in metadata.items():
            if isinstance(v, str):
                cleaned_value = ''.join(filter(lambda x: x in printable_chars, v))
                cleaned_metadata[k] = cleaned_value
            else:
                cleaned_metadata[k] = v

        metadata = cleaned_metadata

        # Tweak the Shutter Speed formatting
        metadata['ShutterSpeedValue'] = format_shutter_speed(metadata['ExposureTime'])

        return metadata

# Helper function to dynamically determine the font size given an image
def calculate_font_size(image, scale_factor):
    font_size = int(min(image.size) * scale_factor)
    print(font_size)
    return font_size

# Helper function that will get the shutter speed in the correct format given the 'ShutterSpeedValue' from the metadata
def format_shutter_speed(ExposureTime: float) -> str:
    fraction = Fraction(ExposureTime).limit_denominator(100000)

    # Handle the case where it doesn't result in a clean shutter speed value like 1/...
    if fraction.numerator % 10 != 1:
        fraction = Fraction(fraction.numerator, fraction.denominator)

    result = f"{fraction.numerator}/{fraction.denominator}"
    print(result)
    return result 

# Helper function to create an image with metadata details and dimensions of orginal image (Optional Image name too)
def generate_metadata_image(metadata: dict[str, Any], img_width: int, img_height: int, img_name: str=None) -> Image:
    # Create a new blank image
    width, height = img_width, img_height

    # Set our font and image sizes depending on whether we have a landscape or portrait picture
    if img_width > img_height:
        image = Image.new('RGB', (width, height // 11), color=(255,255,255))
        larger_font_size = calculate_font_size(image, 0.30)
        smaller_font_size = calculate_font_size(image, 0.25)
    else:
        image = Image.new('RGB', (width, height // 13), color=(255,255,255))
        larger_font_size = calculate_font_size(image, 0.236)
        smaller_font_size = calculate_font_size(image, 0.197)

    draw = ImageDraw.Draw(image)


    # Load a font
    try:
        font_bold = ImageFont.truetype("fonts/timesbd.ttf", larger_font_size)
        font_regular = ImageFont.truetype("fonts/times.ttf", smaller_font_size)
        print("Successfully loaded desired font")
    except IOError:
        font = ImageFont.load_default(larger_font_size)
        print("Loaded default font")

    # Set the text that will be on the 1st line
    if img_name:
        first_line_left = img_name
    else:
        first_line_left = f"{metadata['Make']} {metadata['Model']}"
    first_line_right = f"f/{metadata['FNumber']} {metadata['ShutterSpeedValue']}s ISO{metadata['ISOSpeedRatings']}"

    # Set the text on the 2nd line
    if img_name:
        second_line_left = f"{metadata['Make']} {metadata['Model']} w/{metadata['LensModel']}"
    else:
        second_line_left = f"{metadata['LensModel']}"
    second_line_right = f"{metadata['DateTimeOriginal']}"


    # First line left side (Bold)
    draw.text((0, 50), first_line_left, font=font_bold, fill=(0, 0, 0))
    #draw.text((51, 50), first_line_left, font=font, fill=(0, 0, 0))

    # First line right side (Bold)
    bbox = draw.textbbox((0, 0), first_line_right, font=font_bold)
    text_width = bbox[2] - bbox[0]  # Width is right - left
    draw.text((image.width - text_width, 50), first_line_right, font=font_bold, fill=(0, 0, 0))
    #draw.text((image.width - text_width - 49, 50), first_line_right, font=font, fill=(0, 0, 0))


    # Second line left side
    draw.text((0, 250), second_line_left, font=font_regular, fill=(0, 0, 0))

    # Second line right side
    bbox = draw.textbbox((0, 0), second_line_right, font=font_regular)
    text_width = bbox[2] - bbox[0]  # Width is right - left
    draw.text((image.width - text_width, 250), second_line_right, font=font_regular, fill=(0, 0, 0))    

    return image

# Helper function to dynamically get the border size (40 MP image with a 3:2 aspect ratio should have border of 750)
def get_border_size(image_width: int, image_height: int) -> int:
    # Set our values for a reference border size
    reference_width = 7728
    reference_height = 5152
    reference_border_size = 750

    image_min, image_max = sorted([image_width, image_height])
    ref_min, ref_max = sorted([reference_width, reference_height])

    proportion = image_min / ref_min

    border_size = int(reference_border_size * proportion)

    print(border_size)
    return border_size


# Helper function to determine if we need to save the color palatte
def save_palette() -> bool:
    if os.path.isfile("./color_palette.jpg"):
        print("The file exists don't need to save")
        return False
    else:
        print("The file doesn't exist so we can save")
        return True
    
# Helper function get image dimensions
def get_dimensions(img):
    return {"img_width": img.width, "img_height": img.height}

# Helper function to define dimensions for our palette from our base image
def get_palette_dimensions(img, num_colors):
    img_dimensions = get_dimensions(img)
    palette_width = img_dimensions["img_width"] / num_colors
    palette_height = (10 / 100) * img_dimensions["img_height"]
    return {"palette_width": palette_width, "palette_height": palette_height}

# Helper function that will override the Pylette display function
def local_display(
    self,
    w: float = 50.0,
    h: float = 50.0,
    save_to_file: bool = False,
    filename: str = "color_palette",
    extension: str = "jpg",
) -> None:
    """
    Displays the color palette as an image, with an option for saving the image.

    Parameters:
        w (float): Width of each color component.
        h (float): Height of each color component.
        save_to_file (bool): Whether to save the file or not.
        filename (str): Filename.
        extension (str): File extension.
    """
    # Cast width and height to int for image creation
    img_width = int(w * self.number_of_colors)
    img_height = int(h)
    
    img = Image.new("RGB", size=(img_width, img_height))
    arr = np.asarray(img).copy()
    
    for i in range(self.number_of_colors):
        c = self.colors[i]
        # Use int casts for pixel operations
        arr[:, int(i * w) : int((i + 1) * w), :] = c.rgb
    
    img = Image.fromarray(arr, "RGB")

    # Display the Palette only if it doesn't exist
    if save_palette() == True:
        print("Showing palette since it is newly generated")
        img.show()

    if save_to_file:
        img.save(f"{filename}.{extension}")

# Function overrides
# --------------------------------------------------------------------

# Override the display function to allow the use of floats
Palette.display = local_display

# Scripting Process
# --------------------------------------------------------------------

# Open the desired image for transformation
image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF1021-Enhanced-NR.jpg'  # Update this path to your image
# image_path = 'C:/Users/rahul/OneDrive/Pictures/Switzerland 2024/DSCF0352.jpg'
img = Image.open(image_path)
img_dimensions = get_dimensions(img)
print(get_dimensions(img))

# Get the metadata of the image and generate an image from it
metadata = get_image_metadata(image_path)
print(metadata)
metadata_image = generate_metadata_image(metadata, img_dimensions["img_width"], img_dimensions["img_height"])
metadata_image.show()

# Use Pylette to extract the colors
palette = extract_colors(image=image_path, palette_size=7)
palette_dimensions = get_palette_dimensions(img, 7)
print(palette_dimensions)
palette.display(w=palette_dimensions["palette_width"], h=palette_dimensions["palette_width"],filename='color_palette', extension='jpg', save_to_file=save_palette())
palette_image = Image.open('./color_palette.jpg')

# Merge the pictures and set a white space
white_space = 375
new_image = Image.new('RGB', (img_dimensions["img_width"], int(img_dimensions["img_height"]) + int(palette_dimensions["palette_width"]) + metadata_image.height + white_space), (255, 255, 255))
new_image.paste(metadata_image, (0, 0))
new_image.paste(img, (0, metadata_image.height))
new_image.paste(palette_image, (0, metadata_image.height + img_dimensions["img_height"] + white_space))
# new_image.show()

# Get the value of our border using the helper method
border_value = get_border_size(img.width, img.height)

# Define border size and color
border_size = (border_value, border_value, border_value, border_value)
border_color = (255, 255, 255)

# Add border to the image
img_with_border = ImageOps.expand(new_image, border=border_size, fill=border_color)



# Save the new image
# img_with_border.save('image_with_border.jpg')

# Display the image with border
img_with_border.show()
