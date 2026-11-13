# Image Processing Toolkit UI

The React/Vite client is built into `../static/ui` and served by Flask in production.

Use Node 22 and pnpm 10.34.3. Run Vite with `pnpm dev`; it listens on port 5173 and proxies processing, API, static-upload, and download requests to `TOOLKIT_BACKEND_URL` (default `http://127.0.0.1:5000`). For the development Compose backend, set `TOOLKIT_BACKEND_URL=http://127.0.0.1:55000`.

Build with `pnpm install --frozen-lockfile && pnpm build`.
