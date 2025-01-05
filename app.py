from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file, session
from werkzeug.utils import secure_filename
from processing_scripts.image_transformer import process_image
import os
from PIL import Image

app = Flask(__name__)
app.secret_key = "your_secret_key"  # Needed for session management

# Configure the upload folder
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Default route
@app.route('/')
def upload_form():
    """
    Renders the upload form for users to upload images and input metadata.
    """
    return render_template('upload.html')

# Processing image endpoint
@app.route('/process-image', methods=['POST'])
def process_image_endpoint():
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
    latitude = request.form.get('latitude', type=float)
    longitude = request.form.get('longitude', type=float)
    photo_title = request.form.get('photoName')
    aspect_ratio = request.form.get('aspectRatio', 'Default')

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
        )

        # Save the processed image to return
        processed_image_filename = f"processed_{filename}"
        processed_image_path = os.path.join(app.config['UPLOAD_FOLDER'], processed_image_filename)
        processed_image.save(processed_image_path)

        # Store the processed image path in session for use in the results page
        session['processed_image_url'] = f"/{processed_image_path}"

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
    processed_image_url = session.get('processed_image_url')

    if not processed_image_url:
        # Redirect to the upload page if no image was processed
        return redirect(url_for('upload_form'))

    return render_template('results.html', image_url=processed_image_url)

if __name__ == '__main__':
    app.run(debug=True)
