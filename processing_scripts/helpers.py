import json, string, os, piexif, shutil, numpy as np, pytz
from geopy.geocoders import Nominatim
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
    """
    Extracts and returns cleaned metadata from an image file, with optional embedding of GPS coordinates 
    into the image's EXIF data if latitude and longitude are provided. Adjusts for GPS data, shutter speed, 
    and original timestamp formatting if necessary.

    Parameters:
        image_path (str): Path to the image file.
        latitude (float, optional): Latitude coordinate to embed in the GPS metadata. Defaults to None.
        longitude (float, optional): Longitude coordinate to embed in the GPS metadata. Defaults to None.

    Returns:
        dict: A dictionary containing the cleaned and formatted image metadata, including 'GPSInfo' 
        if GPS coordinates are provided. Fields include shutter speed, date and time adjustments based 
        on timezone, and sanitized EXIF data.
    """
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





# Helper function that will get the shutter speed in the correct format given the 'ShutterSpeedValue' from the metadata
def format_shutter_speed(ExposureTime: float) -> str:
    """
    Formats the exposure time to the closest standard shutter speed value, returning it as a string.

    Parameters:
        ExposureTime (float): The exposure time from the metadata, in seconds.

    Returns:
        str: The formatted shutter speed as a string, either as a whole number for values above 1 
             second or as a fraction (e.g., "1/60") for values below 1 second.
    """
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


# Helper function to update the DateTimeOriginal based on the coordinates of the picture
def change_timezone(coordinates: tuple[float, float],  metadata: dict[str, Any]) -> str:
    """
    Adjusts the 'DateTimeOriginal' field in metadata based on the local timezone of the provided coordinates.

    Parameters:
        coordinates (tuple): A tuple of latitude and longitude (float) representing the picture's location.
        metadata (dict): A dictionary of metadata that includes 'DateTimeOriginal', formatted as "%Y:%m:%d %H:%M:%S".

    Returns:
        str: The adjusted date and time as a string in the format "%m/%d/%Y %H:%M:%S" based on the local timezone.
             If the timezone cannot be determined, returns the original 'DateTimeOriginal' value.
    """
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

# Helper function to dynamically determine the font size given an image
def calculate_font_size(image, scale_factor):
    font_size = int(min(image.size) * scale_factor)
    print(font_size)
    return font_size

# Helper function that will make adjustments to the font size if we detect any overlapping text (Compare by line)
def adjust_line_font(left_text: str, right_text: str, font_path: str, initial_font_size: int, image_width: int):
    # Set a default gap of 10 pixels and minimum font size
    gap = 10
    min_font_size = 10

    # Initilaize an ImageDraw object
    image = Image.new('RGB', (image_width, 100), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)

    # Load the font
    try:
        font = ImageFont.truetype(font_path, initial_font_size)
        print("Successfully loaded desired font for adjustment")
    except IOError:
        print("Failed to load desired font, using default font")
        font = ImageFont.load_default()
    
    while True:
        left_end_x = draw.textbbox((0, 0), left_text, font=font)[2]
        right_width = draw.textbbox((0, 0), right_text, font=font)[2]
        right_start_x = image_width - right_width

        if left_end_x + gap < right_start_x:
            # No overlap, return the current font size
            print(f"No overlap detected with font size: {initial_font_size}")
            new_font_size = font.size
            break

        if font.size > min_font_size:
            # Reduce the font size and try again
            new_font_size = font.size - 1
            font = ImageFont.truetype(font_path, new_font_size)
        else:
            # If we reach the minimum font size, break the loop
            print(f"Reached minimum font size: {min_font_size}")
            break

    scale_factor = new_font_size / initial_font_size
    return new_font_size, scale_factor


# Helper function to create an image with metadata details and dimensions of orginal image (Optional Image name too)
def generate_metadata_image(metadata: dict[str, Any], img_width: int, img_height: int, img_name: str=None) -> Image:
    """
    Creates an image overlay with metadata details, formatted according to the dimensions of the 
    original image. Optionally includes the image name and GPS metadata if provided.

    Parameters:
        metadata (dict): A dictionary of metadata values, including camera and lens details, 
                         GPS coordinates, and settings like ISO, shutter speed, and f-number.
        img_width (int): Width of the original image in pixels.
        img_height (int): Height of the original image in pixels.
        img_name (str, optional): Name of the image to display in the overlay, if provided.

    Returns:
        Image: A new PIL Image instance containing the metadata overlay, with text positioned 
               and formatted based on image orientation and size.
    """
    # Create a new blank image
    width, height = img_width, img_height

    # Set our font and image sizes depending on whether we have a landscape or portrait picture this will be the initial size
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

    # Check if we need to adjust the font size based on the text length of the first line
    adjusted_font_size, scale_factor = adjust_line_font(first_line_left, first_line_right, "fonts/timesbd.ttf", larger_font_size, img_width)
    if adjusted_font_size != larger_font_size:
        print(f"Adjusted font size from {larger_font_size} to {adjusted_font_size} with scale factor {scale_factor}")
        # Recalculate the font sizes based on the new adjusted font size
        larger_font_size = adjusted_font_size
        smaller_font_size = int(smaller_font_size * scale_factor)
        font_bold = ImageFont.truetype("fonts/timesbd.ttf", larger_font_size)
        font_regular = ImageFont.truetype("fonts/times.ttf", smaller_font_size)

    # Calculate the starting positions for the text lines based on the image dimensions
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
    """
    Calculates and returns the simplified aspect ratio of an image.

    Parameters:
        img (Image): A PIL Image instance.

    Returns:
        tuple[int, int]: The aspect ratio as a simplified fraction (width, height).
    """
    width, height = img.size

    # Calculate the GCD to simplify the ratio
    ratio_gcd = gcd(width, height)

    # Divide width and height to get the simplified ratio
    aspect_ratio = (width // ratio_gcd, height // ratio_gcd)

    print(f"Aspect ratio: {aspect_ratio}")
    return aspect_ratio

# Helper method to calculate the padding(border), assume that the target padding is for the longer side
def calculate_padding_for_aspect_ratio(img: Image, aspect_ratio: tuple[int, int], target_padding: int):
    """
    Calculates the horizontal and vertical padding needed to achieve the target padding 
    on the longer side while maintaining the specified aspect ratio.

    Parameters:
        img (Image): A PIL Image instance.
        aspect_ratio (tuple[int, int]): The desired aspect ratio as a simplified fraction (width, height).
        target_padding (int): The desired padding size for the longer side of the image.

    Returns:
        tuple[int, int]: The calculated horizontal and vertical padding values.
    """
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
    """
    Dynamically calculates a proportional value (e.g., border size or spacing) 
    based on the dimensions of an image relative to a reference image.

    Parameters:
        image_width (int): The width of the image in pixels.
        image_height (int): The height of the image in pixels.
        reference_value (int): A reference value (e.g., border size) for a predefined image size.

    Returns:
        int: The calculated proportional value for the given image dimensions.
    """
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
    """
    Determines whether to save the color palette image based on the existence of a file.

    Returns:
        bool: `True` if the color palette file does not exist and should be saved; 
              `False` if the file already exists.
    """
    if os.path.isfile("./color_palette.jpg"):
        print("The file exists don't need to save")
        return False
    else:
        print("The file doesn't exist so we can save")
        return True
    
# Helper function get image dimensions
def get_dimensions(img):
    """
    Retrieves the dimensions of an image.

    Parameters:
        img: A PIL Image instance.

    Returns:
        dict: A dictionary containing the image's width (`img_width`) and height (`img_height`) in pixels.
    """
    return {"img_width": img.width, "img_height": img.height}

# Helper function to define dimensions for our palette from our base image
def get_palette_dimensions(img, num_colors):
    """
    Calculates the dimensions for a color palette based on the dimensions of the base image.

    Parameters:
        img: A PIL Image instance representing the base image.
        num_colors (int): The number of colors to include in the palette.

    Returns:
        dict: A dictionary containing the calculated palette width (`palette_width`) and 
              height (`palette_height`) in pixels.
    """
    img_dimensions = get_dimensions(img)
    palette_width = img_dimensions["img_width"] / num_colors
    palette_height = (10 / 100) * img_dimensions["img_height"]
    return {"palette_width": palette_width, "palette_height": palette_height}

# Helper function that will override the Pylette display function
def local_display(self, w: float = 50.0, h: float = 50.0, save_to_file: bool = False, filename: str = "color_palette", extension: str = "jpg",) -> None:
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
    """
    Saves an image in the highest quality possible with options for handling 
    existing files in the destination folder.

    Parameters:
        image_to_save (Image): A PIL Image instance to be saved.
        original_image_path (str): The file path of the original image.
        destination_folder (str): The folder where the new image should be saved.

    Behavior:
        - If the file already exists, the user is prompted to choose one of three options:
          save a new version, replace the existing file, or skip saving.
        - Saves the image with quality 100, optimized and progressive settings.
    """
    base_name = os.path.basename(original_image_path).split(".")[0] + "_IT"
    new_file_name = base_name + ".jpg"
    print(new_file_name)

    new_path = os.path.join(destination_folder, new_file_name)

    print(new_path)

    # Check if the file exists already, if it does then we give the user the option to save it again
    if os.path.exists(new_path):
        user_input = input(f"{new_file_name} already exists. Chosose an option - Save a new version(y), Replace(r), Don't save(n): ").strip().lower()

        # Save a new version
        if user_input == "y":
            counter = 1
            while os.path.exists(new_path):
                new_file_name = f"{base_name}_{counter}.jpg"
                new_path = os.path.join(destination_folder, new_file_name)
                counter += 1
            # Save the image utilizing the counter
            print(f"Saving the image as {new_file_name}")
            image_to_save.save(new_path, quality=100, optimize=True, progressive=True)
        # Replace the current version
        elif user_input == "r":
            print(f"Replacing the existing image at {new_file_name}")
            image_to_save.save(new_path, quality=100, optimize=True, progressive=True)
        # Don't save the file
        else:
            print("Not saving the image as it already exists")
    else:
        print("Saving the image since it doesn't exist")
        image_to_save.save(new_path, quality=100, optimize=True, progressive=True)


# Helper function to determine which Aspect ratio is the best to use given an image (Used for prints)
# We would later use this to determine how much of a border we should add
def best_aspect_ratios_for_padding(image_width, image_height):
    """
    Determines the best aspect ratios for padding an image to fit standard print dimensions.

    Parameters:
        image_width (int): The width of the image in pixels.
        image_height (int): The height of the image in pixels.

    Returns:
        list[dict]: A list of dictionaries sorted by minimal total padding, where each dictionary includes:
            - `aspect_ratio` (str): The target aspect ratio as a string (e.g., "4:5").
            - `width_padding` (int): The additional width padding required in pixels.
            - `height_padding` (int): The additional height padding required in pixels.
            - `total_padding` (int): The total padding (width + height) required in pixels.
    """
    # Determine the orientation of the image
    is_portrait = image_height > image_width
    
    # Set aspect ratios based on orientation
    if is_portrait:
        aspect_ratios = [(4, 5), (2, 3), (3, 4), (9, 16), (8, 10), (11, 14)]  # Portrait-friendly ratios
    else:
        aspect_ratios = [(5, 4), (3, 2), (4, 3), (16, 9), (10, 8), (14, 11)]  # Landscape-friendly ratios

    padding_options = []
    
    # Iterate through each aspect ratio and calculate required padding
    for (w_ratio, h_ratio) in aspect_ratios:
        target_ratio = w_ratio / h_ratio
        
        # Calculate the target dimensions based on the current image's orientation
        if image_width / image_height < target_ratio:
            # Image is too tall; add padding to width
            target_width = int(image_height * target_ratio)
            width_padding = target_width - image_width
            height_padding = 0
        else:
            # Image is too wide; add padding to height
            target_height = int(image_width / target_ratio)
            width_padding = 0
            height_padding = target_height - image_height

        # Total padding to achieve this aspect ratio
        total_padding = width_padding + height_padding
        padding_options.append({
            'aspect_ratio': f"{w_ratio}:{h_ratio}",
            'width_padding': width_padding,
            'height_padding': height_padding,
            'total_padding': total_padding
        })
    
    # Sort by the least total padding required
    padding_options.sort(key=lambda x: x['total_padding'])
    
    # Return the best options (with minimal padding) for resizing
    return padding_options

# Helper function that will be used to setup the padding for an image we want to create for a print
def setup_print_padding(original_image: Image, stacked_image: Image, base_pad_value: int=400, desired_aspect_ratio: tuple[int, int]=None) -> tuple[int, int]:
    """
    Sets up the padding values for an image to match a desired aspect ratio 
    for print purposes, considering automatic vertical padding and aspect ratio adjustments.

    Parameters:
        original_image (Image): The original PIL Image instance used as the base for calculations.
        stacked_image (Image): The PIL Image instance representing the final stacked image.
        base_pad_value (int, optional): The base padding value for calculating vertical padding. Default is 400.
        desired_aspect_ratio (tuple[int, int], optional): The desired aspect ratio (width, height). 
            If not provided, defaults to 5:4 for landscape or 2:3 for portrait images.

    Returns:
        tuple[int, int]: A tuple containing:
            - `horizontal_padding` (int): Padding to be added horizontally to fit the aspect ratio.
            - `vertical_padding` (int): Automatically calculated vertical padding.

    Behavior:
        - Adjusts vertical padding dynamically to ensure the stacked image's height and width align with the original image's proportions.
        - If a `desired_aspect_ratio` is provided, it finds the best matching adjustment from the calculated aspect ratios.
        - Defaults to common aspect ratios (5:4 for landscape, 2:3 for portrait) if no `desired_aspect_ratio` is given.
        - Ensures all padding values are balanced and optimized for print.

    """
    # Get the value for the automatic vertical pad we will have in our new image
    auto_vertical_pad = get_proportions(original_image.width, original_image.height, base_pad_value)
    if original_image.width > original_image.height:
        while (auto_vertical_pad * 2) + stacked_image.height > stacked_image.width:
            base_pad_value -= 50
            auto_vertical_pad = get_proportions(original_image.width, original_image.height, base_pad_value)
    else:
        while (auto_vertical_pad * 2) + stacked_image.height < stacked_image.width:
            base_pad_value -= 50
            auto_vertical_pad = get_proportions(original_image.width, original_image.height, base_pad_value)
    print(f"auto_vertical_pad: {auto_vertical_pad}")

    # Calculate the adjustments needed for all transformations to all common print aspect ratios
    aspect_ratio_adjustment_list = best_aspect_ratios_for_padding(stacked_image.width, stacked_image.height + (2 * auto_vertical_pad))
    print(aspect_ratio_adjustment_list)

    # Format the target aspect ratio if present:
    if desired_aspect_ratio is not None:
        aspect_ratio_str = f"{desired_aspect_ratio[0]}:{desired_aspect_ratio[1]}"
        aspect_ratio_adjustment_obj = next((option for option in aspect_ratio_adjustment_list if option['aspect_ratio'] == aspect_ratio_str), None)
    else:
        # Set a default processing if no desired aspect ratio (5:4 for Landscape and 2:3 for Portrait)
        aspect_ratio = (5, 4) if original_image.width > original_image.height else (2, 3)
        aspect_ratio_str = f"{aspect_ratio[0]}:{aspect_ratio[1]}"
        aspect_ratio_adjustment_obj = next((option for option in aspect_ratio_adjustment_list if option['aspect_ratio'] == aspect_ratio_str), None)

    # Set the padding values
    horizontal_padding = aspect_ratio_adjustment_obj["width_padding"] // 2
    vertical_padding = auto_vertical_pad

    print(f"Horizontal padding: {horizontal_padding} and Vertical padding: {vertical_padding}")

    return (horizontal_padding, vertical_padding)


# ------------------------------------------------------ Location Helper Functions ------------------------------------------------------

# Helper function to get the coordinates from an address input by the user
def get_coordinates_from_address(address: str) -> tuple[float, float]:
    # Initialize the user agent for Geopy
    loc = Nominatim(user_agent="image_transformer", timeout=10)

    # Geocode the input address
    location = loc.geocode(address)

    # Check if we got a valid location
    if location:
        print(f"Coordinates for {address}: {location.latitude}, {location.longitude}")
        return (location.latitude, location.longitude)
    else:
        print(f"Could not find coordinates for address: {address}")
        return (None, None)
    

# Helper function to format GPS metadata to a string
def format_gps_decimal(metadata):
    """
    Formats GPS metadata into a human-readable string with latitude and longitude in decimal degrees.

    Parameters:
        metadata (dict): A dictionary containing GPS metadata, specifically 'GPSLatitude', 
                         'GPSLatitudeRef', 'GPSLongitude', and 'GPSLongitudeRef'.

    Returns:
        str: A formatted string with latitude and longitude in decimal degrees (e.g., "37.7749° N, 122.4194° W"). 
             Returns "Insufficient GPS metadata" if required metadata is missing.
    """
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
    
# Helper function to convert decimal coordinates into degrees, minutes, seconds tuple format
def to_dms(value, loc):
    """
    Converts a decimal coordinate value to a tuple in degrees, minutes, and seconds (DMS) format, 
    suitable for EXIF GPS metadata.

    Parameters:
        value (float): The decimal coordinate to convert (e.g., latitude or longitude).
        loc (str): A string indicating the type of coordinate ('lat' or 'lon').

    Returns:
        tuple: A tuple containing the DMS representation as a list of (value, scale) pairs for 
               degrees, minutes, and seconds, and the location identifier (e.g., 'lat' or 'lon').
    """
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = round((value - degrees - minutes / 60) * 3600, 5)
    return [(degrees, 1), (minutes, 1), (int(seconds * 100), 100)], loc

# Helper function to convert degree, minutes, seconds tuple into decimal format
def dms_to_decimal(dms, ref):
    """
    Converts a degrees, minutes, and seconds (DMS) tuple into a decimal coordinate, 
    taking into account the directional reference.

    Parameters:
        dms (list): A list of tuples representing degrees, minutes, and seconds, 
                    where each tuple is (value, scale).
        ref (str): A reference direction ('N', 'S', 'E', or 'W') to determine 
                   the sign of the decimal coordinate.

    Returns:
        float: The decimal representation of the coordinate. Negative if the 
               reference is 'S' or 'W'.
    """
    degrees = dms[0][0] / dms[0][1]
    minutes = dms[1][0] / dms[1][1]
    seconds = dms[2][0] / dms[2][1]

    decimal = degrees + (minutes / 60.0) + (seconds / 3600)

    if ref in ['S', 'W']:
        decimal = -decimal
    return decimal



# ---------------------------------------------------------- Cleanup Helper Functions ----------------------------------------------------------

# Helper function that will cleanup a directory by removing all files and subdirectories (Will be used on application startup and exit)
def cleanup_directory(directory: str):
    # Check if the specified directory exists
    if os.path.exists(directory):
        for filename in os.listdir(directory):
            file_path = os.path.join(directory, filename)
            try:
                # Check if it's a file or directory and remove accordingly
                if os.path.isfile(file_path):
                    os.remove(file_path)
                    print(f"Removed file: {file_path}")
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
                    print(f"Removed directory: {file_path}")
            except Exception as e:
                print(f"Error removing {file_path}: {e}")