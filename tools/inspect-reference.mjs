import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const mode = ['opened', 'rsvp'].includes(process.argv[2]) ? process.argv[2] : 'initial';
const outDir = resolve(
  mode === 'opened' ? '.analysis/reference-opened'
    : mode === 'rsvp' ? '.analysis/reference-rsvp'
      : '.analysis/reference',
);
const userDataDir = resolve('.analysis/chrome-profile');
const url = 'https://webgency.tilda.ws/template6';

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
  '--remote-debugging-port=9223',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function getJson(endpoint) {
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`${endpoint} ${response.status}`);
  return response.json();
}

async function waitForDevTools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson('http://127.0.0.1:9223/json/list');
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
        const { resolve: resolvePending, reject } = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) reject(new Error(payload.error.message));
        else resolvePending(payload.result ?? {});
        return;
      }
      const listeners = this.events.get(payload.method);
      if (listeners) {
        for (const listener of listeners) listener(payload.params ?? {});
      }
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

async function inspectViewport(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.dpr ?? 1,
    mobile: viewport.mobile ?? false,
  });
  await cdp.send('Page.navigate', { url });
  await cdp.once('Page.loadEventFired');
  await sleep(3500);
  if (mode === 'opened' || mode === 'rsvp') {
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `new Promise(resolve => {
        const button = document.querySelector('.popup-enter') || [...document.querySelectorAll('button,a,div')].find(el => /click to open/i.test(el.textContent || ''));
        if (button) {
          button.click();
        } else {
          const target = document.elementFromPoint(innerWidth / 2, Math.min(520, innerHeight / 2));
          target && target.click();
        }
        setTimeout(resolve, 1800);
      })`,
    });
  }
  if (mode === 'rsvp') {
    await cdp.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `new Promise(resolve => {
        const link = [...document.querySelectorAll('a,button')].find(el => /rsvp|confirm/i.test(el.textContent || el.value || ''));
        if (link) {
          link.scrollIntoView({ block: 'center' });
          setTimeout(() => {
            link.click();
            setTimeout(resolve, 1400);
          }, 400);
        } else {
          resolve();
        }
      })`,
    });
  }
  await cdp.send('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      let y = 0;
      const step = Math.max(320, Math.round(innerHeight * 0.62));
      const id = setInterval(() => {
        y += step;
        scrollTo(0, y);
        if (y >= document.documentElement.scrollHeight - innerHeight) {
          clearInterval(id);
          setTimeout(() => { scrollTo(0, 0); resolve(true); }, 900);
        }
      }, 180);
    })`,
    awaitPromise: true,
    timeout: 20000,
  });
  await sleep(1200);
  const metrics = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const rounded = (value) => Math.round(value * 100) / 100;
      const stylePick = (el) => {
        const s = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          cls: el.className ? String(el.className).slice(0, 140) : '',
          text: (el.innerText || el.alt || '').replace(/\\s+/g, ' ').trim().slice(0, 140),
          rect: (() => {
            const r = el.getBoundingClientRect();
            return { x: rounded(r.x), y: rounded(r.y + scrollY), w: rounded(r.width), h: rounded(r.height) };
          })(),
          display: s.display,
          position: s.position,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          color: s.color,
          background: s.backgroundColor,
          borderRadius: s.borderRadius,
          border: s.border,
          boxShadow: s.boxShadow,
          opacity: s.opacity,
          transform: s.transform
        };
      };
      const records = [...document.querySelectorAll('[id^="rec"]')].map((el, index) => ({
        index,
        id: el.id,
        rect: (() => {
          const r = el.getBoundingClientRect();
          return { x: rounded(r.x), y: rounded(r.y + scrollY), w: rounded(r.width), h: rounded(r.height) };
        })(),
        bg: getComputedStyle(el).backgroundColor,
        text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 280),
        images: [...el.querySelectorAll('img, .tn-atom[style*="background-image"], [data-original]')].slice(0, 12).map((img) => {
          const s = getComputedStyle(img);
          return {
            tag: img.tagName.toLowerCase(),
            alt: img.alt || '',
            src: img.currentSrc || img.src || img.dataset?.original || s.backgroundImage,
            rect: (() => {
              const r = img.getBoundingClientRect();
              return { x: rounded(r.x), y: rounded(r.y + scrollY), w: rounded(r.width), h: rounded(r.height) };
            })(),
            objectFit: s.objectFit,
            borderRadius: s.borderRadius,
          };
        }),
        headings: [...el.querySelectorAll('h1,h2,h3,.tn-atom,.t-title,.t-descr,.t-name')].filter(node => (node.innerText || '').trim()).slice(0, 20).map(stylePick),
        buttons: [...el.querySelectorAll('a,button,input[type="submit"],.t-submit')].filter(node => {
          const text = (node.innerText || node.value || '').trim();
          const r = node.getBoundingClientRect();
          return text || (r.width > 20 && r.height > 20);
        }).slice(0, 20).map(stylePick)
      }));
      const candidates = [...document.querySelectorAll('h1,h2,h3,p,a,button,input,textarea,label,li,span,div')]
        .filter(el => {
          const text = (el.innerText || el.value || '').replace(/\\s+/g, ' ').trim();
          const r = el.getBoundingClientRect();
          return text && r.width > 16 && r.height > 8 && getComputedStyle(el).visibility !== 'hidden';
        })
        .slice(0, 260)
        .map(stylePick);
      return {
        url: location.href,
        title: document.title,
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        scrollHeight: document.documentElement.scrollHeight,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        records,
        typographySamples: candidates,
        fixed: [...document.querySelectorAll('*')].filter(el => getComputedStyle(el).position === 'fixed').slice(0,20).map(stylePick)
      };
    })()`,
  });
  await writeFile(join(outDir, `${viewport.name}.json`), JSON.stringify(metrics.result.value, null, 2));
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  await writeFile(join(outDir, `${viewport.name}.png`), Buffer.from(data, 'base64'));
  return metrics.result.value;
}

try {
  const wsUrl = await waitForDevTools();
  const cdp = new Cdp(wsUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  const viewports = [
    { name: 'desktop-1440', width: 1440, height: 1200 },
    { name: 'tablet-768', width: 768, height: 1100 },
    { name: 'mobile-390', width: 390, height: 844, mobile: true, dpr: 2 },
  ];
  const results = [];
  for (const viewport of viewports) {
    results.push(await inspectViewport(cdp, viewport));
  }
  await writeFile(join(outDir, 'summary.json'), JSON.stringify(results.map((item) => ({
    viewport: item.viewport,
    scrollHeight: item.scrollHeight,
    records: item.records.map((record) => ({
      index: record.index,
      id: record.id,
      rect: record.rect,
      bg: record.bg,
      text: record.text,
      images: record.images.map((image) => image.rect),
    })),
  })), null, 2));
  cdp.close();
} finally {
  chrome.kill();
}
