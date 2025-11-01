// scripts/shot.js — unify crops to the full map container (Kilima framing for all)
import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || "1920", 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || "1200", 10);
const DEVICE_SCALE = parseFloat(process.env.DEVICE_SCALE || "2"); // crisp
const STABILIZE_MS = parseInt(process.env.STABILIZE_MS || "800", 10);

// Optional selector overrides per-map (if ever needed)
const KILIMA_SELECTOR   = process.env.KILIMA_SELECTOR   || ".maplibregl-map";
const BAHARI_SELECTOR   = process.env.BAHARI_SELECTOR   || ".maplibregl-map";
const ELDERWOOD_SELECTOR= process.env.ELDERWOOD_SELECTOR|| ".maplibregl-map";

// Targets (unchanged)
const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png",    sel: KILIMA_SELECTOR },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png",    sel: BAHARI_SELECTOR },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png", sel: ELDERWOOD_SELECTOR },
];

const FALLBACKS = ["#map", ".leaflet-container"];

// Hide page chrome so only the map container is visible
async function hideChrome(page) {
  await page.addStyleTag({ content: `
    header, nav, footer, .tabs, .tabbar, .maplibregl-control-container {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    body { background: #000 !important; }
  `});
}

// Wait until element exists, is visible, and its size has "settled" for STABILIZE_MS
async function waitSizeStable(page, selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 30000 });

  // poll bounding box until unchanged for STABILIZE_MS
  let last = null;
  const start = Date.now();
  let stableSince = Date.now();

  while (Date.now() - start < 15000) {
    const box = await loc.boundingBox();
    if (!box || box.width < 100 || box.height < 100) {
      await page.waitForTimeout(100);
      continue;
    }
    const asKey = `${Math.round(box.x)}:${Math.round(box.y)}:${Math.round(box.width)}:${Math.round(box.height)}`;
    if (asKey === last) {
      if (Date.now() - stableSince >= STABILIZE_MS) return loc; // stable long enough
    } else {
      last = asKey;
      stableSince = Date.now();
    }
    await page.waitForTimeout(100);
  }
  return loc; // good enough
}

async function captureMap(page, primarySelector) {
  // Try primary selector; if not present, fall back
  let sel = primarySelector;
  if (!(await page.locator(sel).count())) {
    for (const fb of FALLBACKS) {
      if (await page.locator(fb).count()) { sel = fb; break; }
    }
  }
  const loc = await waitSizeStable(page, sel);
  // Scroll into view (no-op if already)
  await loc.scrollIntoViewIfNeeded();
  // Element screenshot (captures full element even outside viewport)
  return await loc.screenshot({ type: "png", animations: "disabled" });
}

async function snapOne(url, outfile, selector) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      deviceScaleFactor: DEVICE_SCALE,
    });
    const page = await context.newPage();

    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
      await hideChrome(page);

      try {
        const buf = await captureMap(page, selector);
        await fs.mkdir("docs", { recursive: true });
        await fs.writeFile(outfile, buf);
        return;
      } catch (e) {
        if (attempt === 1) { await page.waitForTimeout(1000); continue; }
        throw e;
      }
    }
  } finally {
    await browser.close();
  }
}

async function run() {
  for (const t of TARGETS) {
    console.log("Shooting:", t.url, "with selector:", t.sel);
    await snapOne(t.url, t.out, t.sel);
    console.log("Wrote:", t.out);
  }
}

run().catch(err => { console.error(err); process.exit(1); });
