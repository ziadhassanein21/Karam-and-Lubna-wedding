import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = resolve('.analysis/local');
const userDataDir = resolve('.analysis/chrome-local-profile');
const fileUrl = `file:///${resolve('index.html').replace(/\\/g, '/')}`;

await mkdir(outDir, { recursive: true });
await rm(userDataDir, { recursive: true, force: true });
await mkdir(userDataDir, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,
  '--remote-debugging-port=9224',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const getJson = async (endpoint) => {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`${endpoint} ${response.status}`);
  return response.json();
};

async function waitForPageTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson('http://127.0.0.1:9224/json/list');
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      await sleep(125);
    }
  }
  throw new Error('Chrome DevTools endpoint did not start');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.addEventListener('open', resolveReady, { once: true });
      this.ws.addEventListener('error', rejectReady, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data);
      if (payload.id && this.pending.has(payload.id)) {
        const pending = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) pending.reject(new Error(payload.error.message));
        else pending.resolve(payload.result ?? {});
        return;
      }
      const listeners = this.events.get(payload.method);
      if (listeners) listeners.forEach((listener) => listener(payload.params ?? {}));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePending, reject) => {
      this.pending.set(id, { resolve: resolvePending, reject });
    });
  }

  once(method) {
    return new Promise((resolveEvent) => {
      const listener = (params) => {
        this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== listener));
        resolveEvent(params);
      };
      this.events.set(method, [...(this.events.get(method) ?? []), listener]);
    });
  }

  close() {
    this.ws.close();
  }
}

async function capture(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.dpr ?? 1,
    mobile: viewport.mobile ?? false,
  });
  await cdp.send('Page.navigate', { url: fileUrl });
  await cdp.once('Page.loadEventFired');
  await sleep(2500);
  if (viewport.openCover) {
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `new Promise(resolve => {
        document.querySelector('.cover-opener')?.click();
        setTimeout(resolve, 1600);
      })`,
    });
  }
  await cdp.send('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      let y = 0;
      const step = Math.max(300, Math.round(innerHeight * 0.65));
      const timer = setInterval(() => {
        y += step;
        scrollTo(0, y);
        if (y >= document.documentElement.scrollHeight - innerHeight) {
          clearInterval(timer);
          setTimeout(() => { scrollTo(0, 0); resolve(true); }, 800);
        }
      }, 130);
    })`,
    awaitPromise: true,
  });
  await sleep(700);
  const metrics = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => ({
      title: document.title,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      sections: [...document.querySelectorAll('main > section')].map((section) => {
        const r = section.getBoundingClientRect();
        return { className: section.className, y: Math.round(r.y + scrollY), h: Math.round(r.height) };
      }),
      brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).map(img => img.src),
      horizontalOverflow: Math.max(...[...document.body.querySelectorAll('*')].map(el => el.getBoundingClientRect().right)) - innerWidth
    }))()`,
  });
  await writeFile(join(outDir, `${viewport.name}.json`), JSON.stringify(metrics.result.value, null, 2));
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  await writeFile(join(outDir, `${viewport.name}.png`), Buffer.from(screenshot.data, 'base64'));
}

try {
  const cdp = new Cdp(await waitForPageTarget());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 1200 },
    { name: 'tablet-768-opened', width: 768, height: 1100, openCover: true },
    { name: 'mobile-390-opened', width: 390, height: 844, dpr: 2, mobile: true, openCover: true },
    { name: 'mobile-390-initial', width: 390, height: 844, dpr: 2, mobile: true },
  ];
  for (const viewport of viewports) {
    await capture(cdp, viewport);
  }
  cdp.close();
} finally {
  chrome.kill();
}
