// Optional browser regression check: Node 22+ and Chrome, with no npm dependencies.
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
    while (Date.now() < deadline) {
        try { if (await check()) return; } catch {}
        await delay(100);
    }
    throw new Error('Timed out: ' + label);
}

(async () => {
    const browserPath = process.env.CHROME_BIN || [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(candidate => fs.existsSync(candidate));
    assert(browserPath, 'Set CHROME_BIN to your Chrome executable.');
    assert.equal(typeof WebSocket, 'function', 'This check requires Node 22 or newer.');
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'image-transformer-qr-swatches-'));
    const children = [];
    let socket, rpc;
    try {
        const port = await freePort(), debugPort = await freePort();
        const origin = `http://127.0.0.1:${port}`;
        // Avoid marking a running user's background jobs as interrupted on test startup.
        const server = spawn(process.env.PYTHON || 'python', ['-c',
            "from unittest.mock import patch; from services.job_queue import JobStore; patch.object(JobStore, 'mark_incomplete_jobs_failed').start(); import runpy; runpy.run_path('app.py', run_name='__main__')",
        ], {
            cwd: projectRoot, windowsHide: true, stdio: 'ignore',
            env: { ...process.env, DEV: '0', HOST: '127.0.0.1', PORT: String(port), PYTHONDONTWRITEBYTECODE: '1' },
        });
        children.push(server);
        await until(async () => (await fetch(origin + '/qr-code')).ok, 'Flask startup');
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
        socket.onmessage = ({data}) => {
            const message = JSON.parse(data);
            if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
            if (pending.has(message.id)) {
                const {resolve, reject} = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result);
            }
        };
        rpc = (method, params = {}) => new Promise((resolve, reject) => {
            const number = ++id;
            pending.set(number, {resolve, reject});
            socket.send(JSON.stringify({id: number, method, params}));
        });
        async function evaluate(expression) {
            const result = await rpc('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
            if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
            return result.result.value;
        }
        async function click(selector) {
            const point = await evaluate(`(async () => {
                const element = document.querySelector(${JSON.stringify(selector)});
                if (!element || element.matches(':disabled')) throw Error('Cannot click ${selector}');
                element.scrollIntoView({block: 'center', behavior: 'instant'});
                await new Promise(requestAnimationFrame);
                const rect = element.getBoundingClientRect();
                return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2};
            })()`);
            // Native pointer events catch disabled buttons and event ordering that .click() can miss.
            await rpc('Input.dispatchMouseEvent', {type:'mousePressed', ...point, button:'left', clickCount:1});
            await rpc('Input.dispatchMouseEvent', {type:'mouseReleased', ...point, button:'left', clickCount:1});
            await evaluate('new Promise(requestAnimationFrame)');
        }
        const ready = () => until(() => evaluate('downloadLink.hasAttribute("href") && !generateButton.disabled'), 'generated asset');
        await rpc('Runtime.enable');
        await rpc('Page.enable');
        await rpc('Emulation.setDeviceMetricsOverride', {width:1060,height:1200,deviceScaleFactor:1,mobile:false});
        await rpc('Page.navigate', {url: origin + '/qr-code'});
        await until(() => evaluate('document.readyState === "complete" && !!document.getElementById("qrForm")'), 'QR page');
        assert(await evaluate('new URL(document.querySelector("script[src*=qr_code]").src).searchParams.has("v")'));
        await evaluate(`window.check = (condition, message) => { if (!condition) throw Error(message); };
            window.color = (element, value) => { element.value = value; element.dispatchEvent(new Event('input', {bubbles:true})); };
            const nativeFetch = window.fetch; window.qrRequests = [];
            window.fetch = (...args) => { if (args[0] === '/api/qr-code') qrRequests.push(Object.fromEntries(args[1].body.entries())); return nativeFetch(...args); };`);

        for (const withReference of [false, true]) {
            await evaluate(`color(destinationUrl, 'https://example.com/Pokemon?id=7#details');
                exportFormat.value = ${JSON.stringify(withReference ? 'jpeg' : 'png')};
                exportFormat.dispatchEvent(new Event('change', {bubbles:true}));`);
            if (withReference) {
                await evaluate(`(async () => {
                    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 32;
                    ['#102A43','#FFF7E0','#264653','#E9F5EF'].forEach((value,index) => { canvas.getContext('2d').fillStyle = value; canvas.getContext('2d').fillRect(index*32,0,32,32); });
                    const blob = await new Promise(resolve => canvas.toBlob(resolve));
                    const files = new DataTransfer(); files.items.add(new File([blob], 'reference.png', {type:'image/png'})); referenceImage.files = files.files;
                    referenceImage.dispatchEvent(new Event('change', {bubbles:true}));
                })()`);
            }
            await click('#generateButton');
            await ready();
            await evaluate(`check(transparentBackground.tagName === 'BUTTON' && transparentBackground.parentElement === backgroundPalette, 'transparency is a palette swatch');
                check(backgroundPalette.querySelector('[data-color]'), 'solid background option always exists');`);

            const requestsBeforeSelection = await evaluate('qrRequests.length');
            await click('#transparentBackground');
            assert(await evaluate('!applyColorsButton.disabled && !downloadLink.hasAttribute("href")'),
                JSON.stringify(await evaluate('({applyDisabled:applyColorsButton.disabled, selected:transparentBackground.getAttribute("aria-pressed"), status:qrColorStatus.textContent})')));
            assert.equal(await evaluate('transparentBackground.getAttribute("aria-pressed")'), 'true');
            assert.equal(await evaluate('qrRequests.length'), requestsBeforeSelection);
            await click('#applyColorsButton');
            await ready();
            await evaluate(`check(qrRequests.at(-1).transparent_background === 'true' && qrRequests.at(-1).format === 'png', 'transparency sent as PNG');
                check(exportFormat.value === 'png' && downloadLink.download === 'qr-code.png', 'PNG export selected');
                check(downloadLink.href === qrPreview.src, 'preview and download match');
                check(qrPreview.classList.contains('qr-preview-transparent'), 'transparent preview');
                check(!background.disabled && [...backgroundPalette.children].every(button => !button.disabled), 'background choices stay usable');`);
            await evaluate(`(async () => {
                if (!qrPreview.complete) await new Promise(resolve => qrPreview.onload = resolve);
                const canvas = document.createElement('canvas'); canvas.width = qrPreview.naturalWidth; canvas.height = qrPreview.naturalHeight;
                canvas.getContext('2d').drawImage(qrPreview,0,0);
                check(canvas.getContext('2d').getImageData(0,0,1,1).data[3] === 0, 'download contains transparent pixels');
                check(canvas.getContext('2d').getImageData(64,64,1,1).data[3] === 255, 'QR modules stay opaque');
            })()`);

            if (withReference && process.env.QR_UI_SCREENSHOT_DIR) {
                const output = path.resolve(process.env.QR_UI_SCREENSHOT_DIR);
                fs.mkdirSync(output, {recursive:true});
                for (const [name,width,height,mobile] of [['desktop',1060,1200,false],['mobile',390,1000,true]]) {
                    await rpc('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile});
                    await delay(300);
                    assert(await evaluate(`document.documentElement.scrollWidth <= ${width}`));
                    const screenshot = await rpc('Page.captureScreenshot', {format:'png',captureBeyondViewport:true});
                    fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(screenshot.data,'base64'));
                }
            }

            await click('#backgroundPalette button[data-color]');
            assert(await evaluate('!applyColorsButton.disabled && transparentBackground.getAttribute("aria-pressed") === "false"'));
            await click('#applyColorsButton');
            await ready();
            assert(await evaluate('!qrPreview.classList.contains("qr-preview-transparent")'));
            await click('#transparentBackground');
            await click('#applyColorsButton');
            await ready();
            await evaluate('color(background, "#f6f6f6")');
            assert(await evaluate('!applyColorsButton.disabled && transparentBackground.getAttribute("aria-pressed") === "false"'));
            await click('#applyColorsButton');
            await ready();
            await click('#transparentBackground');
            await click('#resetColorsButton');
            assert.equal(await evaluate('transparentBackground.getAttribute("aria-pressed")'), 'false');
            if (await evaluate('!applyColorsButton.disabled')) { await click('#applyColorsButton'); await ready(); }
            console.log(`Passed native pointer transparency/apply, solid swatch, picker, reset, and alpha checks (${withReference ? 'image palette, JPEG to PNG' : 'no reference, PNG'}).`);
        }
        assert.equal(browserErrors.length,0,JSON.stringify(browserErrors));
    } finally {
        if (socket && socket.readyState === WebSocket.OPEN) { rpc('Browser.close').catch(() => {}); await delay(500); socket.close(); }
        for (const child of children.reverse()) if (child.exitCode === null) child.kill();
        await delay(500);
        const resolved = path.resolve(temporaryRoot);
        assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
        assert(path.basename(resolved).startsWith('image-transformer-qr-swatches-'));
        fs.rmSync(resolved, {recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
