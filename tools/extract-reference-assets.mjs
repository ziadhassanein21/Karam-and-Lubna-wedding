import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = resolve('.analysis/chrome-assets-profile');
const url = 'https://webgency.tilda.ws/template6';

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
  '--remote-debugging-port=9225',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const getJson = async (endpoint) => {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`${endpoint} ${response.status}`);
  return response.json();
};

async function waitForTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson('http://127.0.0.1:9225/json/list');
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      await sleep(150);
    }
  }
  throw new Error('No page target');
}

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.ws.addEventListener('open', resolveReady, { once: true });
      this.ws.addEventListener('error', rejectReady, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      const listeners = this.events.get(message.method);
      if (listeners) listeners.forEach((listener) => listener(message.params ?? {}));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.id;
    this.id += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveSend, reject) => {
      this.pending.set(id, { resolve: resolveSend, reject });
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

try {
  const cdp = new Cdp(await waitForTarget());
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Page.navigate', { url });
  await cdp.once('Page.loadEventFired');
  await sleep(5500);
  const result = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const urlSet = new Set();
      const records = [];
      const addUrls = (value) => {
        if (!value || value === 'none') return;
        for (const match of value.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)) urlSet.add(match[1]);
      };
      [...document.querySelectorAll('*')].forEach((el) => {
        const style = getComputedStyle(el);
        addUrls(style.backgroundImage);
        addUrls(style.maskImage);
        addUrls(style.webkitMaskImage);
        if (el.currentSrc || el.src) urlSet.add(el.currentSrc || el.src);
        const rect = el.getBoundingClientRect();
        if ((style.backgroundImage && style.backgroundImage !== 'none') || el.currentSrc || el.src) {
          records.push({
            tag: el.tagName.toLowerCase(),
            id: el.id,
            cls: String(el.className || '').slice(0, 130),
            text: (el.innerText || el.alt || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y + scrollY), w: Math.round(rect.width), h: Math.round(rect.height) },
            bg: style.backgroundImage,
            src: el.currentSrc || el.src || ''
          });
        }
      });
      performance.getEntriesByType('resource').forEach((entry) => {
        if (/\\.(png|jpe?g|webp|gif|mp4|webm|mp3|m4a)(\\?|$)/i.test(entry.name)) urlSet.add(entry.name);
      });
      return { urls: [...urlSet], records };
    })()`,
  });
  const payload = result.result.value;
  await writeFile(resolve('.analysis/reference-assets.json'), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload.urls, null, 2));
  cdp.close();
} finally {
  chrome.kill();
}
