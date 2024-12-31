from flask import Flask, render_template, request, redirect, url_for, jsonify, send_file
from werkzeug.utils import secure_filename
from processing_scripts.image_transformer import process_image
import os
from PIL import Image

app = Flask(__name__)

# Configure the upload folder
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/')
def upload_form():
    """
    Renders the upload form for users to upload images and input metadata.
    """
    return render_template('upload.html')

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
        processed_image_path = os.path.join(app.config['UPLOAD_FOLDER'], f"processed_{filename}")
        processed_image.save(processed_image_path)

        # Return the processed image file
        return send_file(processed_image_path, as_attachment=True)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
