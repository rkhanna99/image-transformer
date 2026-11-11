(() => {
    const form = document.getElementById('qrForm');
    const colorForm = document.getElementById('qrColorForm');
    const destinationUrl = document.getElementById('destinationUrl');
    const foreground = document.getElementById('foreground');
    const background = document.getElementById('background');
    const transparentBackground = document.getElementById('transparentBackground');
    const exportFormat = document.getElementById('exportFormat');
    const colorControls = document.getElementById('qrColorControls');
    const generateButton = document.getElementById('generateButton');
    const applyColorsButton = document.getElementById('applyColorsButton');
    const resetColorsButton = document.getElementById('resetColorsButton');
    const errorBox = document.getElementById('qrError');
    const colorError = document.getElementById('qrColorError');
    const colorWarning = document.getElementById('qrColorWarning');
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
    let transparentBackgroundSelected = false;

    function matchesColors(colors) {
        return colors && foreground.value.toUpperCase() === colors.foreground.toUpperCase()
            && transparentBackgroundSelected === Boolean(colors.transparent_background)
            && (transparentBackgroundSelected || background.value.toUpperCase() === colors.background.toUpperCase());
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
        background.disabled = busy || !current;
        document.querySelectorAll('#backgroundPalette button').forEach((chip) => {
            chip.disabled = busy || !current;
        });
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
        document.getElementById('backgroundValue').textContent = transparentBackgroundSelected ? 'Transparent' : background.value.toUpperCase();
        document.getElementById('qrTransparencyHint').classList.toggle('d-none', !transparentBackgroundSelected);
        transparentBackground.setAttribute('aria-pressed', String(transparentBackgroundSelected));
        for (const [role, input] of [['foreground', foreground], ['background', background]]) {
            document.querySelectorAll(`#${role}Palette button[data-color]`).forEach((chip) => {
                const selected = chip.dataset.color === input.value.toUpperCase()
                    && !(role === 'background' && transparentBackgroundSelected);
                chip.setAttribute('aria-pressed', String(selected));
            });
        }
    }

    function editColors(event) {
        if (!hasCurrentGeneration()) return;
        if (event && event.target === background) transparentBackgroundSelected = false;
        colorError.classList.add('d-none');
        updateColorLabels();
        showColorWarning(matchesColors(currentAsset) ? currentAsset.warning : null);
        colorStatus.textContent = matchesColors(currentAsset)
            ? '' : 'Colors changed. Apply colors to update the preview and enable download.';
        updateControls();
    }

    function invalidateGeneration() {
        revision += 1;
        errorBox.classList.add('d-none');
        colorError.classList.add('d-none');
        showColorWarning(null);
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
    transparentBackground.addEventListener('click', () => {
        if (!hasCurrentGeneration() || activeOperation) return;
        transparentBackgroundSelected = true;
        editColors();
    });

    function renderPalette(colors, backgroundColor) {
        const palette = [...new Set((colors || []).map((color) => color.toUpperCase()))];
        document.querySelectorAll('.qr-palette-options').forEach((element) => {
            element.classList.toggle('d-none', palette.length === 0);
        });
        for (const [role, input] of [['foreground', foreground], ['background', background]]) {
            const container = document.getElementById(`${role}Palette`);
            container.replaceChildren();
            const choices = role === 'background' ? [...new Set([backgroundColor.toUpperCase(), ...palette])] : palette;
            choices.forEach((color) => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'qr-palette-chip';
                chip.style.backgroundColor = color;
                chip.dataset.color = color;
                chip.title = `${color} for ${role}`;
                chip.setAttribute('aria-label', `Use ${color} for ${role}`);
                chip.setAttribute('aria-pressed', 'false');
                chip.addEventListener('click', () => {
                    if (role === 'background') transparentBackgroundSelected = false;
                    input.value = color;
                    editColors();
                });
                container.appendChild(chip);
            });
            if (role === 'background') container.appendChild(transparentBackground);
        }
    }

    function renderAsset(payload) {
        currentAsset = payload;
        preview.src = payload.image_data_url;
        result.classList.remove('d-none');
        document.getElementById('qrDestination').textContent = payload.url;
        foreground.value = payload.foreground;
        background.value = payload.background;
        transparentBackgroundSelected = Boolean(payload.transparent_background);
        preview.classList.toggle('qr-preview-transparent', transparentBackgroundSelected);
        updateColorLabels();
        showColorWarning(payload.warning);
        notice.textContent = payload.notice || '';
        notice.classList.toggle('d-none', !payload.notice);
        status.textContent = `${payload.width} × ${payload.height} pixels`;
    }

    function showColorWarning(message) {
        colorWarning.textContent = message || '';
        colorWarning.classList.toggle('d-none', !message);
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
                initialColors = {
                    foreground: payload.foreground,
                    background: payload.background,
                    transparent_background: Boolean(payload.transparent_background),
                };
                renderPalette(payload.palette, payload.background);
            } else {
                generatedFormat = payload.mime_type === 'image/jpeg' ? 'jpeg' : 'png';
                exportFormat.value = generatedFormat;
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
        formData.set('format', transparentBackgroundSelected ? 'png' : generatedFormat);
        formData.set('foreground', foreground.value);
        formData.set('background', background.value);
        formData.set('transparent_background', String(transparentBackgroundSelected));
        generate(formData, 'colors');
    });

    resetColorsButton.addEventListener('click', () => {
        if (!hasCurrentGeneration() || activeOperation) return;
        foreground.value = initialColors.foreground;
        background.value = initialColors.background;
        transparentBackgroundSelected = initialColors.transparent_background;
        editColors();
    });

    updateControls();
})();
