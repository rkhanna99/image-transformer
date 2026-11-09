(() => {
    const form = document.getElementById('qrForm');
    const colorForm = document.getElementById('qrColorForm');
    const destinationUrl = document.getElementById('destinationUrl');
    const foreground = document.getElementById('foreground');
    const background = document.getElementById('background');
    const colorControls = document.getElementById('qrColorControls');
    const generateButton = document.getElementById('generateButton');
    const applyColorsButton = document.getElementById('applyColorsButton');
    const resetColorsButton = document.getElementById('resetColorsButton');
    const errorBox = document.getElementById('qrError');
    const colorError = document.getElementById('qrColorError');
    const status = document.getElementById('qrStatus');
    const colorStatus = document.getElementById('qrColorStatus');
    const result = document.getElementById('qrResult');
    const preview = document.getElementById('qrPreview');
    const downloadLink = document.getElementById('downloadLink');
    const notice = document.getElementById('qrNotice');

    let revision = 0;
    let generatedRevision = -1;
    let requestId = 0;
    let activeOperation = null;
    let currentAsset = null;
    let initialColors = null;
    let generatedFormat = 'png';

    function matchesColors(colors) {
        return colors && foreground.value.toUpperCase() === colors.foreground.toUpperCase()
            && background.value.toUpperCase() === colors.background.toUpperCase();
    }

    function hasCurrentGeneration() {
        return currentAsset !== null && generatedRevision === revision;
    }

    function updateControls() {
        const busy = activeOperation !== null;
        const current = hasCurrentGeneration();
        const colorsChanged = currentAsset !== null && !matchesColors(currentAsset);
        generateButton.disabled = busy;
        generateButton.textContent = activeOperation === 'generate' ? 'Generating…' : 'Generate QR code';
        colorControls.disabled = busy || !current;
        applyColorsButton.disabled = busy || !current || !colorsChanged;
        applyColorsButton.textContent = activeOperation === 'colors' ? 'Applying…' : 'Apply colors';
        resetColorsButton.disabled = busy || !current || matchesColors(initialColors);

        const canDownload = current && !colorsChanged && !busy;
        downloadLink.classList.toggle('disabled', !canDownload);
        downloadLink.setAttribute('aria-disabled', String(!canDownload));
        if (canDownload) {
            downloadLink.href = currentAsset.image_data_url;
            downloadLink.download = currentAsset.filename;
            downloadLink.removeAttribute('tabindex');
        } else {
            downloadLink.removeAttribute('href');
            downloadLink.setAttribute('tabindex', '-1');
        }
    }

    function updateColorLabels() {
        document.getElementById('foregroundValue').textContent = foreground.value.toUpperCase();
        document.getElementById('backgroundValue').textContent = background.value.toUpperCase();
        for (const [role, input] of [['foreground', foreground], ['background', background]]) {
            document.querySelectorAll(`#${role}Palette button`).forEach((chip) => {
                chip.setAttribute('aria-pressed', String(chip.dataset.color === input.value.toUpperCase()));
            });
        }
    }

    function editColors() {
        if (!hasCurrentGeneration()) return;
        colorError.classList.add('d-none');
        updateColorLabels();
        colorStatus.textContent = matchesColors(currentAsset)
            ? '' : 'Colors changed. Apply colors to update the preview and enable download.';
        updateControls();
    }

    function invalidateGeneration() {
        revision += 1;
        errorBox.classList.add('d-none');
        colorError.classList.add('d-none');
        if (currentAsset || activeOperation) {
            status.textContent = 'Inputs changed. Generate again to refresh the preview and enable download.';
            colorStatus.textContent = 'Generate again before customizing this QR code.';
        }
        updateControls();
    }

    form.addEventListener('input', invalidateGeneration);
    form.addEventListener('change', invalidateGeneration);
    colorForm.addEventListener('input', editColors);
    colorForm.addEventListener('change', editColors);

    function renderPalette(colors) {
        const palette = [...new Set((colors || []).map((color) => color.toUpperCase()))];
        document.querySelectorAll('.qr-palette-options').forEach((element) => {
            element.classList.toggle('d-none', palette.length === 0);
        });
        for (const [role, input] of [['foreground', foreground], ['background', background]]) {
            const container = document.getElementById(`${role}Palette`);
            container.replaceChildren();
            palette.forEach((color) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'qr-palette-chip';
                chip.style.backgroundColor = color;
                chip.dataset.color = color;
                chip.title = `${color} for ${role}`;
                chip.setAttribute('aria-label', `Use ${color} for ${role}`);
                chip.setAttribute('aria-pressed', 'false');
                chip.addEventListener('click', () => {
                    input.value = color;
                    editColors();
                });
                container.appendChild(chip);
            });
        }
    }

    function renderAsset(payload) {
        currentAsset = payload;
        preview.src = payload.image_data_url;
        result.classList.remove('d-none');
        document.getElementById('qrDestination').textContent = payload.url;
        foreground.value = payload.foreground;
        background.value = payload.background;
        updateColorLabels();
        notice.textContent = payload.notice || '';
        notice.classList.toggle('d-none', !payload.notice);
        status.textContent = `${payload.width} × ${payload.height} pixels`;
    }

    async function generate(formData, operation) {
        if (activeOperation) return;
        const activeRequest = ++requestId;
        const requestRevision = revision;
        const operationError = operation === 'colors' ? colorError : errorBox;
        activeOperation = operation;
        errorBox.classList.add('d-none');
        colorError.classList.add('d-none');
        if (operation === 'colors') {
            colorStatus.textContent = 'Applying your colors…';
        } else {
            status.textContent = 'Generating your QR code…';
        }
        updateControls();

        try {
            const response = await fetch('/api/qr-code', { method: 'POST', body: formData });
            const payload = await response.json();
            if (activeRequest !== requestId || requestRevision !== revision) return;
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to generate the QR code. Please try again.');
            }

            if (operation === 'generate') {
                generatedRevision = requestRevision;
                generatedFormat = formData.get('format') || 'png';
                initialColors = { foreground: payload.foreground, background: payload.background };
                renderPalette(payload.palette);
            }
            renderAsset(payload);
            colorStatus.textContent = operation === 'colors' ? 'Colors applied. Your download matches this preview.' : '';
        } catch (error) {
            if (activeRequest === requestId && requestRevision === revision) {
                operationError.textContent = error.message;
                operationError.classList.remove('d-none');
                if (operation === 'colors') {
                    colorStatus.textContent = 'Adjust your colors and apply again.';
                } else {
                    status.textContent = '';
                }
            }
        } finally {
            if (activeRequest === requestId) {
                activeOperation = null;
                updateControls();
            }
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (activeOperation) return;
        errorBox.classList.add('d-none');
        if (!destinationUrl.value.trim()) {
            destinationUrl.focus();
            errorBox.textContent = 'Enter a destination URL.';
            errorBox.classList.remove('d-none');
            return;
        }
        generate(new FormData(form), 'generate');
    });

    colorForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!hasCurrentGeneration() || matchesColors(currentAsset) || activeOperation) return;
        // The extracted palette stays in the editor; explicit colors need no image upload.
        const formData = new FormData();
        formData.set('url', currentAsset.url);
        formData.set('format', generatedFormat);
        formData.set('foreground', foreground.value);
        formData.set('background', background.value);
        generate(formData, 'colors');
    });

    resetColorsButton.addEventListener('click', () => {
        if (!hasCurrentGeneration() || activeOperation) return;
        foreground.value = initialColors.foreground;
        background.value = initialColors.background;
        editColors();
    });

    updateControls();
})();
