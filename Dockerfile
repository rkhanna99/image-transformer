# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0

# Set work directory
WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip \
	&& pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . /app/

# Ensure upload and font folders exist
RUN mkdir -p static/uploads fonts

# Install Gunicorn for production WSGI serving
RUN pip install --no-cache-dir gunicorn

# Expose the port the app will run on
EXPOSE 5000

# Create a non-root user and set permissions
RUN groupadd -r appuser && useradd -r -g appuser appuser \
	&& chown -R appuser:appuser /app
USER appuser

# Default to running with Gunicorn. For development you can override the command
# (for example: `docker compose run --service-ports image-transformer python app.py`).
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "4"]
