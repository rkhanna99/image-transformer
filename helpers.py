import json, string, os, piexif, numpy as np, pytz
from PIL import Image, ImageOps, ExifTags, ImageDraw, ImageFont
from PIL.ExifTags import TAGS, GPSTAGS
from Pylette import extract_colors
from Pylette import Palette
from datetime import datetime
from timezonefinder import TimezoneFinder
from typing import Any
from math import gcd
from fractions import Fraction

# Helper Functions
# --------------------------------------------------------------------

# Helper function to get image metadata and optionally add a location to the GPS metadata
def get_image_metadata(image_path, latitude: float=None, longitude: float=None):
    with Image.open(image_path) as img:
        # Get Image metadata and GPS metadata if available
        img_metadata = {ExifTags.TAGS[k]: v for k, v in img._getexif().items() if k in ExifTags.TAGS}
        gps_metadata = {ExifTags.GPSTAGS[k]: v for k, v in img._getexif().items() if k in ExifTags.GPSTAGS}
        
        # Add the GPS matadata if we are passing in a latitude and logitude
        if latitude and longitude and gps_metadata == {}:
            # Define GPS tags
            exif_dict = piexif.load(img.info.get("exif", b""))
            gps_ifd = {
                piexif.GPSIFD.GPSLatitudeRef: 'N' if latitude >= 0 else 'S',
                piexif.GPSIFD.GPSLatitude: to_dms(abs(latitude), 'lat')[0],
                piexif.GPSIFD.GPSLongitudeRef: 'E' if longitude >= 0 else 'W',
                piexif.GPSIFD.GPSLongitude: to_dms(abs(longitude), 'lon')[0],
            }
            
            # Add GPS data to EXIF
            exif_dict["GPS"] = gps_ifd
            exif_bytes = piexif.dump(exif_dict)
            
            gps_metadata = {ExifTags.GPSTAGS.get(k): v for k, v in gps_ifd.items()}

        # Join the 2 metadata dictionaries
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

        # Tweak the DateTimeOriginal if we have a latitude and longitude
        if latitude and longitude and gps_metadata:
            metadata['DateTimeOriginal'] = change_timezone((latitude, longitude), metadata)

        return metadata

# Helper function to convert decimal coordinates into degrees, minutes, seconds tuple format
def to_dms(value, loc):
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round((value - degrees - minutes / 60) * 3600, 5)
    return [(degrees, 1), (minutes, 1), (int(seconds * 100), 100)], loc

# Helper function to convert degree, minutes, seconds tuple into decimal format
def dms_to_decimal(dms, ref):
    degrees = dms[0][0] / dms[0][1]
    minutes = dms[1][0] / dms[1][1]
    seconds = dms[2][0] / dms[2][1]

    decimal = degrees + (minutes / 60.0) + (seconds / 3600)

    if ref in ['S', 'W']:
        decimal = -decimal
    return decimal

# Helper function to format GPS metadata to a string
def format_gps_decimal(metadata):
    if metadata['GPSLatitude'] and metadata['GPSLatitudeRef'] and metadata['GPSLongitudeRef'] and metadata['GPSLongitude']:
        latitude_dms = metadata['GPSLatitude']
        latitude_ref = metadata['GPSLatitudeRef']
        longitude_dms = metadata['GPSLongitude']
        longitude_ref = metadata['GPSLongitudeRef']

        latitude = dms_to_decimal(latitude_dms, latitude_ref)
        longitude = dms_to_decimal(longitude_dms, longitude_ref)

        # Return the string
        return f"{abs(latitude):.4f}° {latitude_ref}, {abs(longitude):.4f}° {longitude_ref}"
    else:
        return "Insufficient GPS metadata"

# Helper function to dynamically determine the font size given an image
def calculate_font_size(image, scale_factor):
    font_size = int(min(image.size) * scale_factor)
    print(font_size)
    return font_size

# Helper function that will get the shutter speed in the correct format given the 'ShutterSpeedValue' from the metadata
def format_shutter_speed(ExposureTime: float) -> str:
    # Prevent any devaition from standard shutter speed values
    standard_shutter_speeds = [
        1/8000, 1/6400, 1/5000, 1/4000, 1/3200, 1/2500, 1/2000, 1/1600,
        1/1250, 1/1000, 1/800, 1/640, 1/500, 1/400, 1/320, 1/250,
        1/200, 1/160, 1/125, 1/100, 1/80, 1/60, 1/50, 1/40,
        1/30, 1/25, 1/20, 1/15, 1/13, 1/10, 1/8, 1/6, 1/5,
        1/4, 1/3, 1/2.5, 1/2, 1/1.6, 1/1.3, 1, 1.3, 1.6, 2,
        2.5, 3, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30
    ]

    closest_shutter_speed = min(standard_shutter_speeds, key=lambda x: abs(x - ExposureTime))

    # Format as a fraction if possible
    if closest_shutter_speed >= 1:
        rounded_speed = f"{int(closest_shutter_speed)}"
    else:
        rounded_speed = f"1/{int(1 / closest_shutter_speed)}"
    
    return rounded_speed

    # fraction = Fraction(ExposureTime).limit_denominator(100000)

    # # Handle the case where it doesn't result in a clean shutter speed value like 1/...
    # if fraction.numerator % 10 != 1:
    #     fraction = Fraction(fraction.numerator, fraction.denominator)

    # result = f"{fraction.numerator}/{fraction.denominator}"
    # print(result)
    # return result

# Helper function to update the DateTimeOriginal based on the coordinates of the picture
def change_timezone(coordinates: tuple[float, float],  metadata: dict[str, Any]) -> str:
    # Get the DateTimeOriginal field from the metadata
    original_datetime = datetime.strptime(metadata['DateTimeOriginal'], "%Y:%m:%d %H:%M:%S")

    # Set the EST timezone
    est = pytz.timezone("America/New_York")
    original_datetime_est = est.localize(original_datetime)

    # Find the timezone of the given coordinates
    tf = TimezoneFinder()
    timezone_str = tf.timezone_at(lat=coordinates[0], lng=coordinates[1])
    if not timezone_str:
        print("Could not determine the timezone for the given coordinates")
        return metadata['DateTimeOriginal']
    
    # Adjust the timezone
    local_timezone = pytz.timezone(timezone_str)
    local_datetime = original_datetime_est.astimezone(local_timezone)
    formatted_local_datetime = local_datetime.strftime("%m/%d/%Y %H:%M:%S")
    print(f"Adjusted DateTime: {formatted_local_datetime}")

    return formatted_local_datetime

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
    if img_name and all([metadata['GPSLatitude'], metadata['GPSLatitudeRef'], metadata['GPSLongitude'], metadata['GPSLongitudeRef']]):
        # Get the GPS metadata in the correct format
        location_str = format_gps_decimal(metadata)
        first_line_left = f"{img_name} ({location_str})"
    else:
        first_line_left = f"{metadata['Make']} {metadata['Model']}"
    first_line_right = f"f/{metadata['FNumber']} {metadata['ShutterSpeedValue']}s ISO{metadata['ISOSpeedRatings']}"

    # Set the text on the 2nd line
    if img_name:
        second_line_left = f"{metadata['Make']} {metadata['Model']} w/{metadata['LensModel']}"
    else:
        second_line_left = f"{metadata['LensModel']}"
    second_line_right = f"{metadata['DateTimeOriginal']}"

    print("first_line_left: ", first_line_left)
    print("first_line_right: ", first_line_right)
    print("second_line_left: ", second_line_left)
    print("second_line_right: ", second_line_right)

    first_line_start = get_proportions(img_width, img_height, 50)
    second_line_start = get_proportions(img_width, img_height, 250)

    # First line left side (Bold)
    draw.text((0, first_line_start), first_line_left, font=font_bold, fill=(0, 0, 0))
    #draw.text((51, 50), first_line_left, font=font, fill=(0, 0, 0))

    # First line right side (Bold)
    bbox = draw.textbbox((0, 0), first_line_right, font=font_bold)
    text_width = bbox[2] - bbox[0]  # Width is right - left
    draw.text((image.width - text_width, first_line_start), first_line_right, font=font_bold, fill=(0, 0, 0))
    #draw.text((image.width - text_width - 49, 50), first_line_right, font=font, fill=(0, 0, 0))


    # Second line left side
    draw.text((0, second_line_start), second_line_left, font=font_regular, fill=(0, 0, 0))

    # Second line right side
    bbox = draw.textbbox((0, 0), second_line_right, font=font_regular)
    text_width = bbox[2] - bbox[0]  # Width is right - left
    draw.text((image.width - text_width, second_line_start), second_line_right, font=font_regular, fill=(0, 0, 0))    

    return image

# Helper method to get the aspect ratio of an image
def get_aspect_ratio(img: Image) -> tuple[int, int]:
    width, height = img.size

    # Calculate the GCD to simplify the ratio
    ratio_gcd = gcd(width, height)

    # Divide width and height to get the simplified ratio
    aspect_ratio = (width // ratio_gcd, height // ratio_gcd)

    print(f"Aspect ratio: {aspect_ratio}")
    return aspect_ratio

# Helper method to calculate the padding(border), assume that the target padding is for the longer side
def calculate_padding_for_aspect_ratio(img: Image, aspect_ratio: tuple[int, int], target_padding: int):
    img_width, img_height = img.size
    img_ratio = img_width / img_height

    # Set the larger side to our desired padding
    if img_width > img_height:
        vertical_padding = target_padding
    else:
        horizontal_padding = target_padding

    # Calculate the padding for the other direction
    if not horizontal_padding:
        # Multiply by 2 as we add the padding to 2 sides
        new_height = img_height + (2 * target_padding)
        horizontal_padding = ((new_height * aspect_ratio[0]) // aspect_ratio[1]) // 2
    else:
        # Multiply by 2 as we add the padding to 2 sides
        new_width = img_width + (2 * target_padding)
        vertical_padding = ((new_width * aspect_ratio[0]) // aspect_ratio[1]) // 2

    return int(horizontal_padding), int(vertical_padding)

# Helper function to dynamically get the border size, whitespace between image and palette, and other proportions (40 MP image with a 3:2 aspect ratio should have border of 750)
def get_proportions(image_width: int, image_height: int, reference_value: int) -> int:
    # Set our values for a reference border size
    reference_width = 7728
    reference_height = 5152
    reference_border_size = reference_value

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
    # if save_palette() == True:
    #     print("Showing palette since it is newly generated")
    #     img.show()

    if save_to_file:
        img.save(f"{filename}.{extension}")

# Helper function to save the new image in the highest quality possible
def save_image(image_to_save: Image, original_image_path: str, destination_folder: str):
    base_name = os.path.basename(original_image_path).split(".")[0] + "_IT"
    new_file_name = base_name + ".jpg"
    print(new_file_name)

    new_path = os.path.join(destination_folder, new_file_name)

    print(new_path)

    # Check if the file exists already, if it does then we give the user the option to save it again
    if os.path.exists(new_path):
        user_input = input(f"{new_file_name} already exists. Do you want to save a new version? (y/n): ").strip().lower()

        # Action determined by user input
        if user_input == "y":
            counter = 1
            while os.path.exists(new_path):
                new_file_name = f"{base_name}_{counter}.jpg"
                new_path = os.path.join(destination_folder, new_file_name)
                counter += 1
            # Save the image utilizing the counter
            print(f"Saving the image as {new_file_name}")
            image_to_save.save(new_path, quality=100, optimize=True, progressive=True)
        else:
            print("Not saving the image as it already exists")
    else:
        print("Saving the image since it doesn't exist")
        image_to_save.save(new_path, quality=100, optimize=True, progressive=True)