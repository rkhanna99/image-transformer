// React workspace smoke regression. Requires Node 22+, Chrome, and the built UI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
async function until(check, label) {
    const deadline = Date.now() + 30000;
    let lastValue = 'no response';
    while (Date.now() < deadline) {
        try { const value = await check(); lastValue = String(value); if (value) return value; } catch (error) { lastValue = error.message; }
        await delay(100);
    }
    throw new Error('Timed out: ' + label + ' (last check: ' + lastValue + ')');
}

(async () => {
    const browserPath = process.env.CHROME_BIN || [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(candidate => fs.existsSync(candidate));
    assert(browserPath, 'Set CHROME_BIN to your Chrome executable.');
    assert.equal(typeof WebSocket, 'function', 'This check requires Node 22 or newer.');
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-toolkit-react-browser-'));
    const children = [];
    let socket, rpc;
    let serverLog = '';
    try {
        const port = await freePort(), debugPort = await freePort();
        const origin = process.env.TOOLKIT_BASE_URL || `http://127.0.0.1:${port}`;
        if (!process.env.TOOLKIT_BASE_URL) {
            const server = spawn(process.env.PYTHON || 'python3', ['-c',
                "from unittest.mock import patch; from services.job_queue import JobStore; patch.object(JobStore, 'mark_incomplete_jobs_failed').start(); import runpy; runpy.run_path('app.py', run_name='__main__')",
            ], {
                cwd: projectRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, DEV: '0', HOST: '127.0.0.1', PORT: String(port), PYTHONDONTWRITEBYTECODE: '1', TOOLKIT_JOB_STORE: path.join(temporaryRoot, 'jobs'), TOOLKIT_UPLOAD_ROOT: path.join(temporaryRoot, 'uploads', 'jobs') },
            });
            server.stdout.on('data', data => { serverLog = (serverLog + data).slice(-6000); });
            server.stderr.on('data', data => { serverLog = (serverLog + data).slice(-6000); });
            children.push(server);
        }
        try {
            await until(async () => (await fetch(origin + '/healthz')).ok, 'Flask startup');
        } catch (error) {
            throw new Error(error.message + '\nFlask output:\n' + serverLog);
        }
        children.push(spawn(browserPath, [
            '--headless=new', '--no-first-run', '--no-default-browser-check',
            '--user-data-dir=' + path.join(temporaryRoot, 'profile'), '--remote-debugging-port=' + debugPort, 'about:blank',
        ], { windowsHide: true, stdio: 'ignore' }));
        let target;
        await until(async () => {
            target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page');
            return !!target;
        }, 'Chrome startup');
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
        let id = 0;
        const pending = new Map(), browserErrors = [];
        socket.onmessage = ({ data }) => {
            const message = JSON.parse(data);
            if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
            if (pending.has(message.id)) {
                const { resolve, reject } = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result);
            }
        };
        rpc = (method, params = {}) => new Promise((resolve, reject) => {
            const number = ++id;
            pending.set(number, { resolve, reject });
            socket.send(JSON.stringify({ id: number, method, params }));
        });
        async function evaluate(expression) {
            const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
        async function click(selector) {
            const point = await evaluate(`(async () => {
                const element = document.querySelector(${JSON.stringify(selector)});
                if (!element || element.matches(':disabled')) throw Error('Cannot click ${selector}');
                element.scrollIntoView({ block: 'center', behavior: 'instant' });
                await new Promise(requestAnimationFrame);
                const rect = element.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            })()`);
            await rpc('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
            await rpc('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
            await evaluate('new Promise(requestAnimationFrame)').catch(() => {});
        }
        async function setText(selector, value) {
            await click(selector);
            await rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
            await rpc('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
            await rpc('Input.insertText', { text: value });
        }
        async function setInput(selector, value) {
            return evaluate(`(() => {
                const element = document.querySelector(${JSON.stringify(selector)});
                const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
                setter.call(element, ${JSON.stringify(value)});
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return element.value;
            })()`);
        }

        await rpc('Runtime.enable');
        await rpc('Page.enable');
        await rpc('Emulation.setDeviceMetricsOverride', { width: 1060, height: 1000, deviceScaleFactor: 1, mobile: false });
        await rpc('Page.navigate', { url: origin + '/' });
        await until(() => evaluate("document.readyState === 'complete' && !!document.querySelector('[data-testid=tool-card-qrcode]')"), 'redesigned home');
        await evaluate(`window.toolkitRequests = [];
            const nativeFetch = window.fetch;
            window.fetch = async (input, init = {}) => {
                const url = typeof input === 'string' ? input : input.url;
                let entry;
                if (url.startsWith('/api/') || url.startsWith('/process-') || url.startsWith('/white-border')) {
                    const body = init.body;
                    const form = body instanceof FormData ? Object.fromEntries([...body.entries()].map(([key, value]) => [key, value instanceof File ? { name: value.name, type: value.type, size: value.size } : value])) : null;
                    entry = { url, form };
                    window.toolkitRequests.push(entry);
                }
                const response = await nativeFetch(input, init);
                if (entry && response.headers.get('content-type')?.includes('application/json')) entry.response = await response.clone().json();
                return response;
            };`);
        await delay(400);
        assert.equal(await evaluate('toolkitRequests.length'), 0, 'Opening the workspace sends no processing requests.');
        assert.equal(await evaluate("document.querySelectorAll('[data-testid=dock-file-input]').length"), 0, 'The empty home has no hidden sample workspace.');

        await click('[data-testid=theme-toggle]');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#root').firstElementChild).backgroundColor"), 'rgb(9, 9, 11)', 'Dark theme changes the page canvas.');
        await click('[data-testid=theme-toggle]');

        await click('[data-testid=tool-card-qrcode]');
        await until(() => evaluate("location.pathname === '/qr-code' && !!document.querySelector('[data-testid=qr-url]')"), 'QR screen navigation');
        await evaluate('history.back()');
        await until(() => evaluate("location.pathname === '/' && !!document.querySelector('[data-testid=tool-card-qrcode]')"), 'Back navigation to home');
        await evaluate('history.forward()');
        await until(() => evaluate("location.pathname === '/qr-code' && !!document.querySelector('[data-testid=qr-generate]')"), 'Forward navigation to QR screen');
        await delay(300);
        assert.equal(await evaluate('toolkitRequests.length'), 0, 'Tool navigation sends no processing requests.');

        const url = 'https://example.com/print?edition=7#details';
        await setText('[data-testid=qr-url]', url);
        assert.equal(await evaluate("document.querySelector('[data-testid=qr-generate]').disabled"), false);
        await click('[data-testid=qr-transparent]');
        await click('[data-testid=qr-generate]');
        await until(() => evaluate("toolkitRequests[0]?.response && !document.querySelector('[data-testid=qr-generate]').disabled && !!document.querySelector('img[alt=\"Generated QR code\"]')"), 'backend QR preview');
        const firstRequest = await evaluate('toolkitRequests[0].form');
        assert.equal(firstRequest.url, url);
        assert.equal(firstRequest.format, 'png');
        assert.equal(firstRequest.transparent_background, 'true');
        assert.equal(firstRequest.reference_image, undefined);
        assert(await evaluate("document.querySelector('img[alt=\"Generated QR code\"]').src.startsWith('data:image/png')"));

        const initialColors = await evaluate(`({ foreground: document.querySelector('[data-testid=qr-foreground]').value, background: document.querySelector('[data-testid=qr-background]').value })`);
        await setInput('[data-testid=qr-foreground]', '#ff0000');
        assert.equal(await evaluate("document.querySelector('[data-testid=qr-download]').disabled"), true, 'Manual edits disable QR download until Apply.');
        await click('[data-testid=qr-apply-colors]');
        await until(() => evaluate("toolkitRequests[1]?.response && !document.querySelector('[data-testid=qr-generate]').disabled"), 'manual QR color application');
        const applied = await evaluate('toolkitRequests[1].form');
        assert.equal(applied.foreground, '#ff0000');
        assert.equal(applied.reference_image, undefined, 'Applying colors does not upload the reference again.');
        await click('[data-testid=qr-reset-colors]');
        const resetColors = await evaluate(`({ foreground: document.querySelector('[data-testid=qr-foreground]').value, background: document.querySelector('[data-testid=qr-background]').value })`);
        assert.deepEqual(resetColors, initialColors);
        await click('[data-testid=qr-apply-colors]');
        await until(() => evaluate("toolkitRequests[2]?.response && !document.querySelector('[data-testid=qr-generate]').disabled"), 'reset QR color application');
        assert.equal((await evaluate('toolkitRequests[2].form')).foreground, initialColors.foreground);

        await setInput('[data-testid=qr-format]', 'JPEG');
        assert.equal(await evaluate("document.querySelector('[data-testid=qr-transparent]')"), null, 'JPEG clears transparency mode.');
        await click('[data-testid=qr-generate]');
        await until(() => evaluate("toolkitRequests[3]?.response && !document.querySelector('[data-testid=qr-generate]').disabled"), 'JPEG QR generation');
        const jpegRequest = await evaluate('toolkitRequests[3].form');
        assert.equal(jpegRequest.format, 'jpeg');
        assert.equal(jpegRequest.transparent_background, 'false');
        assert(await evaluate("document.querySelector('img[alt=\"Generated QR code\"]').src.startsWith('data:image/jpeg')"));

        // Exercise a tiny original through the Flask job route, then reload its
        // saved-result route and return to it with browser Back.
        const imagePath = path.join(temporaryRoot, 'tiny.png');
        fs.writeFileSync(imagePath, pngFixture());
        await click('[data-testid=brand-home]');
        await click('[data-testid=tool-card-metadata]');
        await until(() => evaluate("location.pathname === '/metadata' && !!document.querySelector('[data-testid=dock-file-input]')"), 'metadata workspace');
        await rpc('DOM.enable');
        const { root: documentNode } = await rpc('DOM.getDocument', { depth: -1 });
        const { nodeId: uploadInput } = await rpc('DOM.querySelector', { nodeId: documentNode.nodeId, selector: '[data-testid=dock-file-input]' });
        assert(uploadInput, 'The upload dock is available on the metadata workspace.');
        await rpc('DOM.setFileInputFiles', { files: [imagePath], nodeId: uploadInput });
        await evaluate("document.querySelector('[data-testid=dock-file-input]').dispatchEvent(new Event('change', { bubbles: true }))");
        await until(() => evaluate("!!document.querySelector('[data-testid=latitude]') && document.querySelector('[data-testid=latitude]').value === ''"), 'uploaded source and metadata controls');
        const processingRequests = () => evaluate("toolkitRequests.filter(request => request.url === '/process-image' || request.url === '/process-images').length");
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-style-original]').getAttribute('aria-pressed')"), 'true');
        await click('[data-testid=metadata-style-card]');
        await setInput('[data-testid=metadata-theme]', 'slate-dark');
        await click('[data-testid=metadata-show-gps]');
        await click('[data-testid=metadata-show-colors]');
        assert.equal(await processingRequests(), 0, 'Design edits do not generate outputs.');

        // A second source owns an independent design; switching sources retains both drafts.
        const secondPath = path.join(temporaryRoot, 'second.png');
        fs.writeFileSync(secondPath, pngFixture());
        await rpc('DOM.setFileInputFiles', { files: [secondPath], nodeId: uploadInput });
        await evaluate("document.querySelector('[data-testid=dock-file-input]').dispatchEvent(new Event('change', { bubbles: true }))");
        await until(() => evaluate("!!document.querySelector('button[aria-label=\"Select second.png\"]')"), 'second metadata source');
        await click('button[title="Next image"]');
        await until(() => evaluate("document.querySelector('[data-testid=metadata-title]').value === 'second'"), 'second image selection');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-style-original]').getAttribute('aria-pressed')"), 'true');
        await click('[data-testid=metadata-style-film]');
        await setInput('[data-testid=metadata-theme]', 'slate-dark');
        await click('[data-testid=metadata-show-colors]');
        await setText('[data-testid=latitude]', '0');
        await setText('[data-testid=longitude]', '0');
        await click('button[title="Previous image"]');
        await until(() => evaluate("document.querySelector('[data-testid=metadata-title]').value === 'tiny'"), 'first image selection');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-style-card]').getAttribute('aria-pressed')"), 'true');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-theme]').value"), 'slate-dark');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-show-gps]').checked"), false);
        await click('[data-testid=metadata-reset]');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-style-original]').getAttribute('aria-pressed')"), 'true');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-theme]').value"), 'linen-light');
        assert.equal(await evaluate("document.querySelector('[data-testid=metadata-show-gps]').checked && document.querySelector('[data-testid=metadata-show-colors]').checked"), true);
        await setText('[data-testid=latitude]', '0');
        await setText('[data-testid=longitude]', '0');
        await click('[data-testid=generate-selected]');
        let jobId = await until(() => evaluate("window.toolkitRequests.find(request => request.url === '/process-image' && request.response?.id)?.response.id || ''"), 'metadata job creation');
        await until(() => evaluate(`document.querySelector('.preview-panel img')?.getAttribute('src')?.includes('/static/uploads/jobs/${jobId}/preview_') || false`), 'backend-generated tiny image preview');
        assert.equal(await evaluate("document.querySelector('.preview-panel img').getAttribute('src').startsWith('/static/uploads/jobs/')"), true, 'The preview comes from the backend artifact.');
        await until(() => evaluate("!!document.querySelector('[data-testid=job-zip]') && !document.querySelector('[data-testid=job-zip]').disabled"), 'current job ZIP download');
        const firstJobId = jobId;
        const initialProcessingCount = await processingRequests();
        for (const style of ['card', 'overlay', 'film']) {
            await click(`[data-testid=metadata-style-${style}]`);
            assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), true, 'Style changes mark the existing artifact stale.');
        }
        await click('[data-testid=metadata-style-original]');
        assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), false, 'Returning to the generated settings clears staleness.');
        await setInput('[data-testid=metadata-theme]', 'slate-dark');
        assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), true);
        await setInput('[data-testid=metadata-theme]', 'linen-light');
        for (const toggle of ['metadata-show-gps', 'metadata-show-colors']) {
            await click(`[data-testid=${toggle}]`);
            assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), true);
            await click(`[data-testid=${toggle}]`);
            assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), false);
        }
        assert.equal(await processingRequests(), initialProcessingCount);

        // Hold a submitted response so a draft edit happens while generation is pending.
        await evaluate(`{
            const previousFetch = window.fetch;
            window.holdMetadataResponse = true;
            window.fetch = async (input, init) => {
                let response = await previousFetch(input, init);
                const url = typeof input === 'string' ? input : input.url;
                if (url === '/process-image' && window.holdMetadataResponse) {
                    window.holdMetadataResponse = false;
                    await new Promise(resolve => { window.releaseMetadataResponse = resolve; });
                }
                return response;
            };
        }`);
        await click('[data-testid=metadata-style-card]');
        await click('[data-testid=metadata-show-colors]');
        await click('[data-testid=generate-selected]');
        await until(() => evaluate("typeof releaseMetadataResponse === 'function'"), 'held metadata response');
        const cardJobId = await evaluate("toolkitRequests.filter(request => request.url === '/process-image').at(-1).response.id");
        await click('[data-testid=metadata-style-overlay]');
        await evaluate('releaseMetadataResponse()');
        await until(() => evaluate(`document.querySelector('.preview-panel img')?.getAttribute('src')?.includes('/${cardJobId}/') && !document.querySelector('[data-testid=generate-selected]').disabled`), 'submitted Card result while Overlay is selected');
        assert.equal(await evaluate("document.querySelector('[data-testid=generated-download]').disabled"), true);
        assert(await evaluate("document.body.innerText.includes('Generated result · Card')"), 'Result labels use the submitted style.');
        await click('[data-testid=generate-selected]');
        await until(() => evaluate("!document.querySelector('[data-testid=generate-selected]').disabled && !document.querySelector('[data-testid=generated-download]').disabled && document.body.innerText.includes('Generated result · Overlay')"), 'regenerated Overlay result');

        // Generate a real mixed-style batch and inspect the persisted settings.
        await click('[data-testid=metadata-style-card]');
        await click('[data-testid=generate-all]');
        jobId = await until(() => evaluate("toolkitRequests.find(request => request.url === '/process-images' && request.response?.id)?.response.id || ''"), 'mixed-style batch creation');
        await until(() => evaluate(`document.querySelector('.preview-panel img')?.getAttribute('src')?.includes('/${jobId}/') && !document.querySelector('[data-testid=job-zip]').disabled`), 'mixed-style batch completion');
        const mixed = await (await fetch(origin + '/api/jobs/' + jobId)).json();
        assert.deepEqual(mixed.outputs.map(output => output.metadata_options.overlayStyle), ['card', 'film']);
        assert.deepEqual(mixed.outputs.map(output => output.metadata_options.themeTone), ['linen-light', 'slate-dark']);
        const mixedPayload = await evaluate("JSON.parse(toolkitRequests.find(request => request.url === '/process-images').form.payload)");
        assert.deepEqual(mixed.outputs.map(output => output.client_image_id), mixedPayload.images.map(image => image.clientImageId));
        assert(mixed.outputs.every(output => output.metadata_options.showColorStrip === false));
        assert.notEqual(jobId, firstJobId);
        await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 1100, deviceScaleFactor: 1, mobile: true });
        await delay(250);
        assert(await evaluate('document.documentElement.scrollWidth <= 390'), 'Metadata controls fit a narrow viewport.');
        if (process.env.TOOLKIT_SCREENSHOT_PATH) {
            const screenshot = await rpc('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(process.env.TOOLKIT_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
        }
        await rpc('Emulation.setDeviceMetricsOverride', { width: 1060, height: 1000, deviceScaleFactor: 1, mobile: false });
        await setText('[data-testid=metadata-title]', 'Changed title');
        await until(() => evaluate("document.querySelector('[data-testid=job-zip]').disabled && document.querySelector('[data-testid=generated-download]').disabled"), 'stale output download protection');
        await click('a[href^="/results/"]');
        await until(() => evaluate(`location.pathname === '/results/${jobId}' && !!document.querySelector('[data-testid=brand-home]') && document.body.innerText.includes('Job outputs')`), 'saved metadata job');
        assert(await evaluate("document.querySelector('.preview-panel img')?.getAttribute('src')?.includes('/static/uploads/jobs/')"));
        assert(await evaluate("document.body.innerText.includes('Card') && document.body.innerText.includes('Film')"), 'Saved outputs show persisted styles.');
        // Opening the saved-results link is a full navigation, so install this
        // compatibility fixture in the new document before its next job fetch.
        await evaluate(`{
            const previousFetch = window.fetch;
            window.fetch = async (input, init) => {
                const response = await previousFetch(input, init);
                const url = typeof input === 'string' ? input : input.url;
                if (!url.startsWith('/api/jobs/')) return response;
                const data = await response.json();
                data.outputs?.forEach(output => { delete output.metadata_options; });
                return new Response(JSON.stringify(data), { status: response.status, headers: { 'Content-Type': 'application/json' } });
            };
        }`);
        await click('[data-testid=brand-home]');
        await until(() => evaluate("location.pathname === '/' && !!document.querySelector('[data-testid=tool-card-metadata]')"), 'home from saved result');
        await evaluate('history.back()');
        await until(() => evaluate(`location.pathname === '/results/${jobId}' && document.body.innerText.includes('Job outputs') && !!document.querySelector('.preview-panel img')`), 'Back navigation to a saved result');

        assert(await evaluate("document.body.innerText.includes('Original')"), 'Historical outputs without metadata_options display Original.');

        await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
        await delay(250);
        assert(await evaluate('document.documentElement.scrollWidth <= 390'), 'The saved output workspace fits a narrow viewport.');

        await rpc('Page.navigate', { url: origin + '/results/missing-browser-audit-job' });
        await until(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Unable to load this saved job.')"), 'readable missing job result');
        await evaluate('history.back()');
        await until(() => evaluate(`location.pathname === '/results/${jobId}' && !!document.querySelector('.preview-panel img')`), 'Back navigation from a missing result');
        assert.equal(browserErrors.length, 0, JSON.stringify(browserErrors));
        console.log('Passed navigation, QR exports, per-image metadata styles/themes/visibility, pending-job snapshots, mixed-style batches, stale-download protection, saved and historical results, and narrow-screen checks.');
    } finally {
        if (socket && socket.readyState === WebSocket.OPEN) { rpc('Browser.close').catch(() => {}); await delay(400); socket.close(); }
        for (const child of children.reverse()) if (child.exitCode === null) child.kill();
        await delay(400);
        const resolved = path.resolve(temporaryRoot);
        assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
        assert(path.basename(resolved).startsWith('image-toolkit-react-browser-'));
        fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });

function pngFixture() {
    const zlib = require('node:zlib');
    const width = 16, height = 12;
    const pixels = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 3 + 1);
        pixels[row] = 0;
        for (let x = 0; x < width; x++) {
            pixels[row + 1 + x * 3] = x < width / 2 ? 240 : 20;
            pixels[row + 2 + x * 3] = y < height / 2 ? 40 : 180;
            pixels[row + 3 + x * 3] = 80;
        }
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc32 = buffer => {
        let crc = 0xffffffff;
        for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const typeData = Buffer.from(type);
        const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
        const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeData, data])));
        return Buffer.concat([length, typeData, data, checksum]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
    ]);
}
