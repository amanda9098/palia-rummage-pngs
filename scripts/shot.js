// scripts/shot.js
// Screenshot the visible map area from palia.th.gl for 3 regions.
// No scrolling/zooming. We wait for tiles/canvas to render, then
// screenshot the biggest map element (canvas/img/map container).

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, '..', 'docs');
const SHOTS = [
  { name: 'kilima.png',    url: 'https://palia.th.gl/rummage-pile?map=kilima-valley' },
  { name: 'bahari.png',    url: 'https://palia.th.gl/rummage-pile?map=bahari-bay' },
  { name: 'elderwood.png', url: 'https://palia.th.gl/rummage-pile?map=elderwood' },
];

// Smallest allowed image (guards against corrupt 0-byte/HTML screenshots)
const MIN_BYTES = 20_000;

function isValidPng(buf) {
  if (!buf || buf.length < 100) return false;
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  return buf.subarray(0, 8).equals(sig);
}

// Wait until tiles/canvas are actually drawn (generic heuristic)
async function waitForMapRender(page, timeout = 20_000) {
  await page.waitForFunction(() => {
    // loaded map tiles (Leaflet/Mapbox/etc.)
    const imgs = Array.from(document.querySelectorAll('img')).filter(i =>
      i.naturalWidth > 0 &&
      i.naturalHeight > 0 &&
      i.offsetParent !== null &&
      /(tile|map|leaflet|mapbox|raster|png|jpg)/i.test(i.src || '')
    );
    if (imgs.length >= 4) return true;

    // large visible canvas also counts
    const canvases = Array.from(document.querySelectorAll('canvas'))
      .filter(c => c.width >= 800 && c.height >= 600 && c.offsetParent !== null);
    return canvases.length > 0;
  }, { timeout });
}

// Choose the largest likely "map" element to screenshot
async function getMapLocator(page) {
  // Common containers first
  const candidates = [
    '.leaflet-container',
    '.mapboxgl-map',
    '.mapboxgl-canvas',
    '#map',
    '.map',
    'main',
    'canvas',
    'img'
  ];

  // Try preferred selectors
  for (const sel of candidates) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 3000 });
        const box = await loc.boundingBox();
        if (box && box.width >= 600 && box.height >= 400) return loc;
      } catch {}
    }
  }

  // Fallback: pick the largest visible canvas/img on the page
  const handle = await page.evaluateHandle(() => {
    const els = Array.from(document.querySelectorAll('canvas, img'))
      .filter(e => e.offsetParent !== null);
    let best = null, bestArea = 0;
    for (const e of els) {
      const r = e.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = e; bestArea = area; }
    }
    return best;
  });
  if (!handle) throw new Error('Could not find a map element to screenshot');
  return page.locator('canvas, img').filter({ has: handle });
}

(async () => {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 2200, height: 1400 }
  });
  const page = await ctx.newPage();

  for (const { name, url } of SHOTS) {
    console.log(`[shot] ${name} ← ${url}`);

    // 1) Navigate and let things settle
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
    await waitForMapRender(page, 20_000);
    await page.waitForTimeout(300); // tiny extra settle

    // 2) Get the map element as-is (no zoom/scroll)
    const mapLoc = await getMapLocator(page);

    // Optional: hide controls/tabs so we only capture the map area
    await page.addStyleTag({ content: `
      .leaflet-control, .mapboxgl-ctrl, [class*="control"] { opacity: 0 !important; pointer-events: none !important; }
      .leaflet-bottom.leaflet-right, .mapboxgl-ctrl-bottom-right { display: none !important; }
    `});

    // 3) Screenshot the element
    const buf = await mapLoc.screenshot({ type: 'png', animations: 'disabled' });

    // 4) Validate & write
    if (!isValidPng(buf) || buf.length < MIN_BYTES) {
      throw new Error(`Refusing to write ${name}: invalid/too-small PNG (len=${buf?.length ?? 0})`);
    }
    const outPath = path.join(OUTDIR, name);
    fs.writeFileSync(outPath, buf); // binary write
    console.log(`[ok] wrote ${outPath} (${buf.length} bytes)`);
  }

  await browser.close();
})().catch(err => {
  console.error('[shot] failed:', err);
  process.exit(1);
});
