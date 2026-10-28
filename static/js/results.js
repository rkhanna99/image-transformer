document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("resultContainer");
  if (!container) return;

  const jobId = container.dataset.jobId;
  const initialStatus = container.dataset.status || "queued";

  let images = [];
  let filenames = [];
  try { images = JSON.parse(container.dataset.images || "[]"); } catch { images = []; }
  try { filenames = JSON.parse(container.dataset.filenames || "[]"); } catch { filenames = []; }

  const imgEl = document.getElementById("transformedImage");
  const prevBtn = document.getElementById("prevResult");
  const nextBtn = document.getElementById("nextResult");
  const indexEl = document.getElementById("resultIndex");
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadAllBtn = document.getElementById("downloadAllBtn");
  const resultText = document.getElementById("resultText");
  const statusBanner = document.getElementById("jobStatusBanner");
  const errorBanner = document.getElementById("jobErrorBanner");
  const loadingEl = document.getElementById("jobLoading");

  let current = 0;
  let total = images.length || 0;
  let navToken = 0;
  let pollTimer = null;

  const blobUrlCache = new Map();
  const inflight = new Map();

  function setBanner(message, type = "secondary") {
    if (!statusBanner) return;
    statusBanner.className = `alert alert-${type}`;
    statusBanner.textContent = message;
  }

  function showError(message) {
    if (!errorBanner) return;
    errorBanner.textContent = message;
    errorBanner.classList.remove("d-none");
  }

  function hideError() {
    if (!errorBanner) return;
    errorBanner.classList.add("d-none");
    errorBanner.textContent = "";
  }

  function setLoading(visible) {
    if (!loadingEl) return;
    loadingEl.style.display = visible ? "block" : "none";
  }

  async function getBlobUrl(src) {
    if (!src) return "";
    if (blobUrlCache.has(src)) return blobUrlCache.get(src);
    if (inflight.has(src)) return inflight.get(src);

    const p = (async () => {
      const res = await fetch(src, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Failed to fetch: ${src}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(src, blobUrl);
      return blobUrl;
    })().finally(() => inflight.delete(src));

    inflight.set(src, p);
    return p;
  }

  async function decodeIntoImg(srcOrBlobUrl) {
    if (!srcOrBlobUrl) return;
    const tmp = new Image();
    tmp.src = srcOrBlobUrl;
    try {
      if (typeof tmp.decode === "function") await tmp.decode();
    } catch (_) {}
  }

  function setDownloads() {
    if (downloadAllBtn) {
      downloadAllBtn.style.display = total <= 1 ? "none" : "inline-block";
      if (total > 1) downloadAllBtn.href = `/download-all/${encodeURIComponent(jobId)}`;
    }

    if (!downloadBtn) return;

    const filename = filenames[current] || null;
    const src = images[current] || "";
    if (filename) {
      downloadBtn.href = `/download/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`;
      downloadBtn.setAttribute("download", filename);
      downloadBtn.style.display = "inline-block";
    } else if (src) {
      downloadBtn.href = src;
      downloadBtn.removeAttribute("download");
      downloadBtn.style.display = "inline-block";
    } else {
      downloadBtn.style.display = "none";
    }
  }

  function setIndex() {
    if (indexEl) indexEl.textContent = total > 0 ? `${current + 1} / ${total}` : "0 / 0";
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
  }

  function neighborIndexes(idx) {
    if (total <= 1) return [];
    return [(idx - 1 + total) % total, (idx + 1) % total, (idx + 2) % total];
  }

  async function updateImageUI() {
    if (!imgEl || total === 0) return;
    const token = ++navToken;
    setIndex();
    setDownloads();

    const src = images[current] || "";
    if (!src) return;

    let blobUrl = "";
    try {
      blobUrl = await getBlobUrl(src);
    } catch (error) {
      console.error(error);
      blobUrl = src;
    }
    if (token !== navToken) return;

    await decodeIntoImg(blobUrl);
    if (token !== navToken) return;

    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.src = blobUrl;

    neighborIndexes(current).forEach(async (index) => {
      const neighborSrc = images[index];
      if (!neighborSrc) return;
      try {
        const neighborBlob = await getBlobUrl(neighborSrc);
        decodeIntoImg(neighborBlob);
      } catch (_) {}
    });
  }

  function go(delta) {
    if (total <= 1) return;
    current = (current + delta + total) % total;
    updateImageUI();
  }

  function applyJobData(job) {
    if (Array.isArray(job.preview_urls)) {
      images = job.preview_urls;
    } else if (Array.isArray(job.image_urls)) {
      images = job.image_urls;
    } else {
      images = [];
    }
    filenames = Array.isArray(job.download_filenames) ? job.download_filenames : [];
    total = images.length;

    if (current >= total) current = Math.max(0, total - 1);

    if (job.status === "queued") {
      setBanner("Job queued. Waiting for a worker slot.", "secondary");
      setLoading(true);
      hideError();
      if (resultText) resultText.textContent = "Your files are uploaded. Processing will start shortly.";
      if (downloadBtn) downloadBtn.style.display = "none";
      if (downloadAllBtn) downloadAllBtn.style.display = "none";
      return;
    }

    if (job.status === "running") {
      setBanner("Job running. Processing images now.", "info");
      setLoading(true);
      hideError();
      if (resultText) resultText.textContent = "Processing is in progress. This page will update automatically.";
      if (downloadBtn) downloadBtn.style.display = "none";
      if (downloadAllBtn) downloadAllBtn.style.display = "none";
      return;
    }

    if (job.status === "failed") {
      setBanner("Job failed.", "danger");
      setLoading(false);
      showError(job.error || "Processing failed.");
      if (resultText) resultText.textContent = "The job did not complete successfully.";
      if (downloadBtn) downloadBtn.style.display = "none";
      if (downloadAllBtn) downloadAllBtn.style.display = "none";
      return;
    }

    setBanner("Job complete.", "success");
    setLoading(false);
    hideError();
    if (resultText) resultText.textContent = "Your image(s) have been processed successfully.";
    updateImageUI();
  }

  async function pollJobStatus() {
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load job status.");
      }
      const job = await response.json();
      applyJobData(job);

      if (job.status === "queued" || job.status === "running") {
        pollTimer = window.setTimeout(pollJobStatus, 1500);
      }
    } catch (error) {
      console.error(error);
      setBanner("Unable to refresh job status.", "warning");
      showError(error.message || "Status polling failed.");
      setLoading(false);
    }
  }

  if (prevBtn) prevBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); go(-1); });
  if (nextBtn) nextBtn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); go(1); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  });

  applyJobData({ status: initialStatus, image_urls: images, download_filenames: filenames });
  pollJobStatus();

  window.addEventListener("beforeunload", () => {
    if (pollTimer) window.clearTimeout(pollTimer);
    for (const blobUrl of blobUrlCache.values()) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    }
  });
});
