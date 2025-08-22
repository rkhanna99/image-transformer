from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, session, send_from_directory
from werkzeug.utils import secure_filename
from processing_scripts.image_transformer import process_image
from processing_scripts.helpers import get_coordinates_from_address
from processing_scripts.helpers import cleanup_directory
from processing_scripts.helpers import create_simple_border
import os, atexit
from PIL import Image

app = Flask(__name__, static_folder='static', template_folder='templates')
app.secret_key = "your_secret_key"  # Needed for session management

# Configure the upload folder
UPLOAD_FOLDER = 'static/uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Clear the uploads folder on startup
cleanup_directory(UPLOAD_FOLDER)

# Default route
@app.route('/')
def upload_form():
    """
    Renders the upload form for users to upload images and input metadata.
    """
    return render_template('upload.html')

@app.route('/border')
def border_form():
    return render_template('border.html')

# White border route
@app.route('/white-border', methods=['POST'])
def white_border_endpoint():
    # Store referrer for error redirection
    session['last_referrer'] = request.referrer or url_for('border_form')

    if 'image' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files['image']
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    border_size = int(request.form.get('borderSize', 0))
    aspect_ratio = request.form.get('aspectRatio', 'Default')

    # Get the aspect ratio as a tuple
    parsed_aspect_ratio = aspect_ratio.split(':')
    if len(parsed_aspect_ratio) == 2:
        try:
            width, height = map(int, parsed_aspect_ratio)
            aspect_ratio_tuple = (width, height)
        except ValueError:
            return redirect(session.get('last_referrer', url_for('border_form')))

    try:
        # Do your border processing here...
        processed_image = create_simple_border(Image.open(filepath), aspect_ratio_tuple, border_size)

        processed_image_filename = f"border_{filename}"
        processed_image_path = os.path.join(app.config['UPLOAD_FOLDER'], processed_image_filename)
        processed_image.save(processed_image_path, quality=100, optimize=True, progressive=True)

        print(f"Processed image saved at: {processed_image_path}")

        # Store the processed image path in session for use in the results page
        session['processed_image_url'] = url_for('static', filename=f"uploads/{processed_image_filename}")
        session['processed_image_filename'] = processed_image_filename

        # Redirect to the results page
        return redirect(url_for('results_page'))
    except Exception as e:
        print(f"Error processing image: {str(e)}")
        # Redirect back to the form they came from on error
        return redirect(session.get('last_referrer', url_for('border_form')))

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

    # Save the uploaded file
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

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
    print_aspect_ratio = None
    if aspect_ratio == "Custom":
        custom_aspect = request.form.get('customAspectRatio')
        if custom_aspect:
            try:
                width, height = map(int, custom_aspect.split(":"))
                print_aspect_ratio = (width, height)
            except ValueError:
                return jsonify({"error": "Invalid custom aspect ratio"}), 400

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
        session['processed_image_url'] = url_for('static', filename=f"uploads/{processed_image_filename}")
        session['processed_image_filename'] = processed_image_filename

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
    processed_image_url = session['processed_image_url']
    processed_image_filename = session['processed_image_filename']

    if not processed_image_url:
        # Redirect to the upload page if no image was processed
        # Redirect to the appropriate form based on referrer or default to upload
        referrer = request.referrer or ''
        if 'border' in referrer:
            return redirect(url_for('border_form'))
        else:
            return redirect(url_for('upload_form'))

    print(f"Processed image URL: {processed_image_url}")

    return render_template('results.html', image_url=processed_image_url, download_filename=processed_image_filename)

# Route to download the file from the results page
@app.route('/download/<filename>')
def download_file(filename):
    """
    Allows users to download the processed image file.
    """
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename, as_attachment=True)


# Cleanup the upload directory on exit
atexit.register(cleanup_directory, UPLOAD_FOLDER)

if __name__ == '__main__':
    app.run(debug=True)

