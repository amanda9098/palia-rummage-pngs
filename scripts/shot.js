// scripts/shot.js — capture full map containers (no clipping to viewport)
import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || "1600", 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || "1000", 10);
const DEVICE_SCALE = parseFloat(process.env.DEVICE_SCALE || "2"); // crisp output

const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png" },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png" },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png" },
];

// Preferred containers in order (these hold the whole map frame)
const CONTAINERS = [
  ".maplibregl-map",     // MapLibre root
  "#map",                // generic
  ".leaflet-container"   // Leaflet root
];

async function getContainerLocator(page) {
  for (const sel of CONTAINERS) {
    const loc = page.locator(sel).first();
    if (await loc.count()) return loc;
  }
  // fallback: largest visible canvas, then its parent element
  const canvases = page.locator("canvas");
  const n = await canvases.count();
  let bestIndex = -1, bestArea = 0;
  for (let i = 0; i < n; i++) {
    const h = canvases.nth(i);
    const box = await h.boundingBox();
    if (box) {
      const area = box.width * box.height;
      if (area > bestArea) { bestArea = area; bestIndex = i; }
    }
  }
  if (bestIndex >= 0) {
    const canvas = canvases.nth(bestIndex);
    // climb to a sizable parent
    const handle = await canvas.elementHandle();
    const parent = await handle.evaluateHandle(el => el.parentElement || el);
    return page.locator(":scope", { has: page.locator("canvas").nth(bestIndex) }).filter({ has: page.locator("canvas").nth(bestIndex) }) || parent;
  }
  return null;
}

async function snapOne(url, outfile) {
  const browser = await chromium.launch(); // headless
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      deviceScaleFactor: DEVICE_SCALE,
    });
    const page = await context.newPage();

    // Two attempts in case layout finalizes late
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });

      // Wait until a map canvas shows up
      await page.waitForSelector("canvas", { state: "visible", timeout: 20_000 });

      // Try to hide top tabs/footer if present (safe no-ops if not found)
      await page.addStyleTag({ content: `
        header, nav, .tabs, .tabbar, footer { display: none !important; }
        body { background: #000 !important; }
      `});

      const container = await getContainerLocator(page);
      if (container) {
        // Element screenshot captures full element even outside viewport (no clipping)
        const buf = await container.screenshot({ type: "png", animations: "disabled" });
        await fs.mkdir("docs", { recursive: true });
        await fs.writeFile(outfile, buf);
        return;
      }

      if (attempt === 1) await page.waitForTimeout(2000);
    }

    // Absolute fallback: full-page (shouldn’t be needed)
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    await fs.mkdir("docs", { recursive: true });
    await fs.writeFile(outfile, buf);
  } finally {
    await browser.close();
  }
}

async function run() {
  for (const t of TARGETS) {
    console.log("Shooting:", t.url);
    await snapOne(t.url, t.out);
    console.log("Wrote:", t.out);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
