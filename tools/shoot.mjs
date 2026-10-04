// Visual QA harness: serves a folder (or uses a URL), drives installed Chrome on the real GPU,
// runs a scripted sequence of steps, and saves screenshots + console + FPS samples.
//
// usage: node tools/shoot.mjs <dirOrUrl> <outDir> [stepsJsonFile]
//   steps: [{ "wait": ms } | { "shot": "name" } | { "eval": "js" } | { "key": "KeyW", "ms": 800 }
//           | { "mouse": [x,y] } | { "click": [x,y] } | { "fps": ms } | { "drag": [x0,y0,x1,y1,ms] }]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [, , target, outDir = 'shots', stepsFile] = process.argv;
const CHROME = process.env.CHROME_PATH || path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe');
const W = +(process.env.W || 1600), H = +(process.env.H || 900);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.otf': 'font/otf', '.woff2': 'font/woff2' };

function serve(dir) {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(dir, p);
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, () => res(srv));
  });
}

const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [{ wait: 4000 }, { shot: 'initial' }];
fs.mkdirSync(outDir, { recursive: true });

let srv, url = target;
if (!/^https?:/.test(target)) { srv = await serve(path.resolve(target)); url = `http://localhost:${srv.address().port}/`; }
if (process.env.QS) url += (url.includes('?') ? '&' : '?') + process.env.QS;

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const log = [];
page.on('console', (m) => log.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });

const report = { url, renderer: null, fps: [] };
report.renderer = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const d = c && c.getExtension('WEBGL_debug_renderer_info');
  return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
});

for (const s of steps) {
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: path.join(outDir, `${s.shot}.png`) });
  if (s.eval) log.push('[eval] ' + JSON.stringify(await page.evaluate(s.eval)));
  if (s.mouse) await page.mouse.move(s.mouse[0], s.mouse[1], { steps: 12 });
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  if (s.drag) {
    const [x0, y0, x1, y1, ms = 600] = s.drag;
    await page.mouse.move(x0, y0); await page.mouse.down();
    const n = 30; for (let i = 1; i <= n; i++) { await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await page.waitForTimeout(ms / n); }
    await page.mouse.up();
  }
  if (s.down) await page.mouse.down();
  if (s.up) await page.mouse.up();
  if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms || 500); await page.keyboard.up(s.key); }
  if (s.press) await page.keyboard.press(s.press);
  if (s.fps) {
    const fps = await page.evaluate((ms) => new Promise((r) => {
      let n = 0, worst = 0, last = performance.now(); const t0 = last;
      const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else r({ avg: +(n * 1000 / (t - t0)).toFixed(1), worstFrameMs: +worst.toFixed(1) }); };
      requestAnimationFrame(f);
    }), s.fps);
    report.fps.push({ label: s.label || '', ...fps });
  }
}
report.log = log;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ renderer: report.renderer, fps: report.fps, errors: log.filter((l) => /error|warn/i.test(l)).slice(0, 25) }, null, 2));
await browser.close();
srv && srv.close();
