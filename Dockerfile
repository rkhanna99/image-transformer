FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.3 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN pnpm --dir frontend install --frozen-lockfile
COPY frontend/ ./frontend/
RUN pnpm --dir frontend build

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 FLASK_APP=app.py DEV=0
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt gunicorn
COPY . ./
COPY --from=frontend-build /app/static/ui ./static/ui
RUN mkdir -p data/jobs static/uploads/jobs fonts /home/appuser \
    && groupadd -r appuser && useradd -r -g appuser appuser \
    && chown -R appuser:appuser /app /home/appuser
USER appuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/', timeout=3)"]
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4"]
