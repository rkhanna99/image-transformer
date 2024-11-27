from flask import Flask, render_template, request, redirect, url_for, jsonify
import os

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

@app.route('/upload', methods=['POST'])
def upload_file():
    """
    Handles file upload and metadata submission.
    """
    if 'image' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['image']
    latitude = request.form.get('latitude')
    longitude = request.form.get('longitude')
    photo_name = request.form.get('photo_name')
    aspect_ratio = request.form.get('aspect_ratio')

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Save the file to the upload folder
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    file.save(file_path)

    # Process the metadata (this could send data to AWS Lambda later)
    metadata = {
        "file_path": file_path,
        "latitude": latitude,
        "longitude": longitude,
        "photo_name": photo_name,
        "aspect_ratio": aspect_ratio,
    }

    # For now, just return the metadata for debugging
    return jsonify(metadata)

if __name__ == '__main__':
    app.run(debug=True)
