from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, session, send_from_directory
from werkzeug.utils import secure_filename
from processing_scripts.image_transformer import process_image
from processing_scripts.helpers import *
from livereload import Server
import os, atexit, math, uuid, zlib
from PIL import Image, ImageOps

'''
Metadata overlay method (API will call this function directly)

Core logic to handle the processing of a singluar image with a requested metadata overlay

Parameters:
- file: The uploaded image file object (werkzeug.datastructures.FileStorage)
- form: The form data containing overlay parameters (flask.request.form)
- upload_folder: The directory path where uploaded and processed images are stored (str)

Returns:
- processed_image_path: The file path of the processed image with metadata overlay (str)
'''
def process_metadata_overlay(file, form, upload_folder):
    # Save the uploaded file
    original_filename = secure_filename(file.filename)
    unique_prefix = uuid.uuid4().hex[:8]
    filename = f"{unique_prefix}_{original_filename}"
    filepath = os.path.join(upload_folder, filename)
    file.save(filepath)

    # Extract the form data
    address = form.get('address')
    latitude = to_float(form.get('latitude'))
    longitude = to_float(form.get('longitude'))
    photo_title = form.get('photoName')
    aspect_ratio = form.get('aspectRatio', 'Default')
    print(f"Address: {address}, Latitude: {latitude}, Longitude: {longitude}, Photo Title: {photo_title}, Aspect Ratio: {aspect_ratio}")

    # Get the coordinates from the address if provided otherwise just use lat/long
    if latitude is None or longitude is None:
        if address is None:
            raise ValueError("A location must be provided if latitude/longitude are not provided")
        else:
            # Call the Nominatim backed helper
            coordinates = get_coordinates_from_address(address=address)
            latitude, longitude = coordinates

    # Convert the aspect ratio into a valid format if a custom aspect ratio is requested
    print_aspect_ratio = aspect_ratio
    if aspect_ratio == "Custom":
        custom_aspect = request.form.get('customAspectRatio')
        if custom_aspect:
            try:
                width, height = map(int, custom_aspect.split(":"))
                print_aspect_ratio = (width, height)
            except ValueError:
                return jsonify({"error": "Invalid custom aspect ratio"}), 400
    elif aspect_ratio == "Default":
        # Open the image to determine its aspect ratio
        with Image.open(filepath) as img:
            # Ensure the image is in its correct orientation after opening it
            img = ImageOps.exif_transpose(img)
            width, height = img.size

            # Need to reduce width and height to their simplest form
            gcd = math.gcd(width, height)
            width //= gcd
            height //= gcd
            print_aspect_ratio = (width, height)

    # Now that we have all of the fields in the desired format we can start working on the metadata overlay
    try:
        processed_image = process_image(
            filepath,
            latitude=latitude,
            longitude=longitude,
            photo_title=photo_title,
            print_aspect_ratio=print_aspect_ratio,
            local_save=False # Not saving it locally within the function, will only save in the static/uploads folder
        )

        # Save the processed image to return
        processed_image_filename = f"processed_{filename}"
        processed_image_path = os.path.join(upload_folder, processed_image_filename)
        processed_image.save(processed_image_path, quality=100, optimize=True, progressive=True)

        return processed_image_path
    except Exception as e:
        print("Error during image processing:", e)
