document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('resultContainer');
  if (!container) return;

  let images = [];
  let filenames = [];
  try { images = JSON.parse(container.dataset.images || '[]'); } catch { images = []; }
  try { filenames = JSON.parse(container.dataset.filenames || '[]'); } catch { filenames = []; }

  if (!Array.isArray(images)) images = [images];
  if (!Array.isArray(filenames)) filenames = [filenames];

  const imgEl = document.getElementById('transformedImage');
  const prevBtn = document.getElementById('prevResult');
  const nextBtn = document.getElementById('nextResult');
  const indexEl = document.getElementById('resultIndex');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadAllBtn = document.getElementById('downloadAllBtn');

  if (!imgEl) return;

  let current = 0;
  const total = images.length || 1;

  // ---- Blob URL cache: originalSrc -> blobUrl ----
  const blobUrlCache = new Map();
  const inflight = new Map(); // originalSrc -> Promise<blobUrl>

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
    })()
      .finally(() => inflight.delete(src));

    inflight.set(src, p);
    return p;
  }

  async function decodeIntoImg(srcOrBlobUrl) {
    if (!srcOrBlobUrl) return;
    // Decode in background when supported (reduces jank)
    const tmp = new Image();
    tmp.src = srcOrBlobUrl;
    try {
      if (typeof tmp.decode === "function") await tmp.decode();
    } catch (_) {}
  }

  function setDownloads() {
    // Download-all
    if (downloadAllBtn) {
      downloadAllBtn.style.display = total <= 1 ? 'none' : 'inline-block';
      if (total > 1) downloadAllBtn.href = `/download-all`;
    }

    // Per-image download
    const filename = (filenames && filenames[current]) || null;
    const src = images[current] || images[0] || '';
    if (!downloadBtn) return;

    if (filename) {
      downloadBtn.href = `/download/${encodeURIComponent(filename)}`;
      downloadBtn.setAttribute('download', filename);
    } else if (src) {
      downloadBtn.href = src;
      downloadBtn.removeAttribute('download');
    } else {
      downloadBtn.href = '#';
    }
  }

  function setIndex() {
    if (indexEl) indexEl.textContent = `${current + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
  }

  function neighborIndexes(idx) {
    if (total <= 1) return [];
    const prev = (idx - 1 + total) % total;
    const next = (idx + 1) % total;
    const next2 = (idx + 2) % total;
    return [prev, next, next2];
  }

  let navToken = 0;

  async function updateUI() {
    const token = ++navToken;

    setIndex();
    setDownloads();

    const src = images[current] || images[0] || '';
    if (!src) return;

    // Get cached blob URL (fetches once)
    let blobUrl = "";
    try {
      blobUrl = await getBlobUrl(src);
    } catch (e) {
      console.error(e);
      // fallback: show normal src if blob fetch fails
      blobUrl = src;
    }
    if (token !== navToken) return;

    // decode off-thread before swapping (best effort)
    await decodeIntoImg(blobUrl);
    if (token !== navToken) return;

    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.src = blobUrl;

    // Preload neighbors in background
    neighborIndexes(current).forEach(async (i) => {
      const nSrc = images[i];
      if (!nSrc) return;
      try {
        const nBlob = await getBlobUrl(nSrc);
        decodeIntoImg(nBlob);
      } catch (_) {}
    });
  }

  function go(delta) {
    if (total <= 1) return;
    current = (current + delta + total) % total;
    updateUI();
  }

  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(-1); });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); go(1); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  });

  // Initial paint
  updateUI();

  // Cleanup blob URLs when leaving page (avoid memory leaks)
  window.addEventListener("beforeunload", () => {
    for (const blobUrl of blobUrlCache.values()) {
      try { URL.revokeObjectURL(blobUrl); } catch (_) {}
    }
  });
});