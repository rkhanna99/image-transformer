document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('resultContainer');
    if (!container) return;

    // Read images and filenames from data attributes (JSON strings)
    let images = [];
    let filenames = [];
    try {
        images = JSON.parse(container.dataset.images || '[]');
    } catch (e) {
        console.error('Failed to parse images data:', e);
        images = [];
    }
    try {
        filenames = JSON.parse(container.dataset.filenames || '[]');
    } catch (e) {
        console.error('Failed to parse filenames data:', e);
        filenames = [];
    }

    // Normalize to arrays
    if (!Array.isArray(images)) images = [images];
    if (!Array.isArray(filenames)) filenames = [filenames];

    const imgEl = document.getElementById('transformedImage');
    const prevBtn = document.getElementById('prevResult');
    const nextBtn = document.getElementById('nextResult');
    const indexEl = document.getElementById('resultIndex');
    const downloadBtn = document.getElementById('downloadBtn');

    if (!imgEl) return;

    let current = 0;
    const total = images.length || 1;

    function updateUI() {
        const src = images[current] || images[0] || '';
        imgEl.src = src;
        indexEl.textContent = `${current + 1} / ${total}`;

        // Disable/enable buttons based on total
        if (prevBtn) prevBtn.disabled = total <= 1;
        if (nextBtn) nextBtn.disabled = total <= 1;

        // Hide the Download All button if only one image
        const downloadAllBtn = document.getElementById('downloadAllBtn');
        if (downloadAllBtn) {
            if (total <= 1) {
                downloadAllBtn.style.display = 'none';
            } else {
                downloadAllBtn.style.display = 'inline-block';
                // Set href to the server-side ZIP endpoint (uses session data)
                // The backend expects the processed filenames in session, so no query string is required.
                downloadAllBtn.href = `/download-all`;
            }
        }

        // Update download link if filename provided
        const filename = (filenames && filenames[current]) || null;
        if (filename) {
            // build URL using current origin + download route if needed
            // assume backend provides direct download URL via /download/<filename>
            downloadBtn.href = `/download/${encodeURIComponent(filename)}`;
            downloadBtn.setAttribute('download', filename);
        } else if (src) {
            downloadBtn.href = src;
            downloadBtn.removeAttribute('download');
        } else {
            downloadBtn.href = '#';
        }
    }

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); current = (current - 1 + total) % total; updateUI(); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); current = (current + 1) % total; updateUI(); });

    // keyboard support
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { current = (current - 1 + total) % total; updateUI(); }
        if (e.key === 'ArrowRight') { current = (current + 1) % total; updateUI(); }
    });

    // Initial UI
    updateUI();
});