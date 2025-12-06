from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, session, send_from_directory
from werkzeug.utils import secure_filename
from processing_scripts.image_transformer import process_image
from processing_scripts.helpers import get_coordinates_from_address
from processing_scripts.helpers import cleanup_directory
from processing_scripts.helpers import create_simple_border
from livereload import Server
import os, atexit, math, uuid, zlib
from PIL import Image, ImageOps

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = "your_secret_key"  # Needed for session management

# Cache static files for 1 hour
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 3600

# Configure the upload folder
UPLOAD_FOLDER = 'static/uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Clear the uploads folder on startup
cleanup_directory(UPLOAD_FOLDER)

# Default route to the home page
@app.route('/')
def home():
    return render_template("home.html")

# Route for the metadata overlay form
@app.route('/metadata')
def upload_form():
    return render_template('upload.html')

# Route for the white border form
@app.route('/border')
def border_form():
    return render_template('border.html')

# White border route
@app.route('/white-border', methods=['POST'])
def white_border_endpoint():
    # Store referrer for error redirection
    session['last_referrer'] = request.referrer or url_for('border_form')

    # Expect multiple files under the 'images' field
    if 'images' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    # Grab the border size and aspect ratio from the request body
    border_size = int(request.form.get('borderSize', 0))
    aspect_ratio = request.form.get('aspectRatio', 'Default')

    processed_urls = []
    processed_filenames = []

    # Iterate through uploaded images and process each of them separately
    for image in request.files.getlist('images'):
        if not image or image.filename == '':
            continue

        print(f"Uploaded image: {image.filename}")
        original_filename = secure_filename(image.filename)
        unique_prefix = uuid.uuid4().hex[:8]
        filename = f"{unique_prefix}_{original_filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        image.save(filepath)

        # Determine aspect ratio tuple for THIS image
        if aspect_ratio == 'Default':
            with Image.open(filepath) as img:
                img = ImageOps.exif_transpose(img)
                width, height = img.size
                aspect_ratio_tuple = (width, height)
        else:
            parsed_aspect_ratio = aspect_ratio.split(':')
            if len(parsed_aspect_ratio) == 2:
                try:
                    w, h = map(int, parsed_aspect_ratio)
                    aspect_ratio_tuple = (w, h)
                except ValueError:
                    # Skip this image if aspect ratio parsing failed
                    print(f"Invalid aspect ratio provided: {aspect_ratio}")
                    continue
            else:
                # Invalid aspect ratio format
                print(f"Invalid aspect ratio format: {aspect_ratio}")
                continue

        print(f"Processing {filename} with aspect {aspect_ratio_tuple} and border {border_size}")

        try:
            with Image.open(filepath) as img:
                img = ImageOps.exif_transpose(img)
                processed_image = create_simple_border(img, aspect_ratio_tuple, border_size)

            processed_image_filename = f"border_{filename}"
            processed_image_path = os.path.join(app.config['UPLOAD_FOLDER'], processed_image_filename)
            processed_image.save(processed_image_path, quality=100, optimize=True, progressive=True)

            print(f"Processed image saved at: {processed_image_path}")

            # Append URLs and filenames for the results page
            processed_urls.append(url_for('static', filename=f"uploads/{processed_image_filename}"))
            processed_filenames.append(processed_image_filename)

        except Exception as e:
            print(f"Error processing image {filename}: {str(e)}")
            # skip on error and continue with next image
            continue

    if len(processed_urls) == 0:
        # No successful processed images
        return redirect(session.get('last_referrer', url_for('border_form')))

    # Store the list of processed images in session for the results page
    session['processed_image_urls'] = processed_urls
    session['processed_image_filenames'] = processed_filenames

    return redirect(url_for('results_page'))

# Processing image endpoint
@app.route('/process-image', methods=['POST'])
def process_image_endpoint():
    # Store referrer for error redirection
    session['last_referrer'] = request.referrer or url_for('upload_form')

    # Check if a file is uploaded
    if 'image' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['image']

    # Check if a file is selected
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    print(f"Uploaded image: {file.filename}")
    
    # Save the uploaded file
    original_filename = secure_filename(file.filename)
    unique_prefix = uuid.uuid4().hex[:8]
    filename = f"{unique_prefix}_{original_filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    
    # filename = secure_filename(file.filename)
    # filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    # file.save(filepath)

    # Retrieve optional parameters from the request
    address = request.form.get('address')
    latitude = request.form.get('latitude', type=float)
    longitude = request.form.get('longitude', type=float)
    photo_title = request.form.get('photoName')
    aspect_ratio = request.form.get('aspectRatio', 'Default')
    print(f"Address: {address}, Latitude: {latitude}, Longitude: {longitude}, Photo Title: {photo_title}, Aspect Ratio: {aspect_ratio}")

    # Check if we have received latitude and longitude
    if latitude is None and longitude is None:
        print("No latitude and longitude provided.")
        # If address is provided, get coordinates from address
        if address:
            coordinates = get_coordinates_from_address(address)
            print(f"Coordinates from address: {coordinates}")
            if coordinates:
                latitude, longitude = coordinates
            else:
                return jsonify({"error": "Invalid address"}), 400
        else:
            return jsonify({"error": "Address or Latitude and Longitude must be provided"}), 400

    # Convert aspect ratio if custom
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

    # Log the final aspect ratio being used
    print(f"Aspect Ratio for Print: {print_aspect_ratio}")        

    # Process the image using the process_image function
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
        processed_image_path = os.path.join(app.config['UPLOAD_FOLDER'], processed_image_filename)
        processed_image.save(processed_image_path, quality=100, optimize=True, progressive=True)

        print(f"Processed image saved at: {processed_image_path}")

        # Store the processed image path in session for use in the results page
        session['processed_image_urls'] = url_for('static', filename=f"uploads/{processed_image_filename}")
        session['processed_image_filenames'] = processed_image_filename

        # Redirect to the results page
        return redirect(url_for('results_page'))

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Results page
@app.route('/results')
def results_page():
    """
    Renders the results page to display the processed image.
    """
    # Support multiple processed images (saved in session as lists)
    processed_urls = session.get('processed_image_urls')
    processed_filenames = session.get('processed_image_filenames')

    # Backwards compatibility: single image keys
    if not processed_urls:
        single_url = session.get('processed_image_url')
        single_filename = session.get('processed_image_filename')
        if single_url:
            processed_urls = [single_url]
            processed_filenames = [single_filename] if single_filename else [None]

    if not processed_urls:
        # Redirect to the upload page if no image was processed
        referrer = request.referrer or ''
        if 'border' in referrer:
            return redirect(url_for('border_form'))
        else:
            return redirect(url_for('upload_form'))

    print(f"Processed image URLs: {processed_urls}")

    return render_template('results.html', image_urls=processed_urls, download_filenames=processed_filenames)

# Route to download a single file from the results page
@app.route('/download/<filename>')
def download_file(filename):
    """
    Allows users to download the processed image file.
    """
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)

# Route to download all processed files as a zip
@app.route('/download-all')
def download_all_files():
    """
    Allows users to download all processed image files as a zip archive.
    """
    from io import BytesIO
    import zipfile

    processed_filenames = session.get('processed_image_filenames', [])
    if not processed_filenames:
        return redirect(url_for('results_page'))

    # Create a zip in memory
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', compression=zipfile.ZIP_DEFLATED) as zip_file:
        for filename in processed_filenames:
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            zip_file.write(file_path, arcname=filename)

    zip_buffer.seek(0)

    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name='processed_images.zip'
    )

# Cleanup the upload directory on exit
atexit.register(cleanup_directory, UPLOAD_FOLDER)

if __name__ == '__main__':
    # Ensure template reloading is enabled
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

    server = Server(app)

    # Watch your templates and static files
    server.watch('templates/*.html')
    server.watch('templates/**/*.html')
    server.watch('static/css/*.css')
    server.watch('static/js/*.js')
    server.watch('static/**/*.css')
    server.watch('static/**/*.js')

    # Run livereload
    server.serve(debug=True, port=5000)



