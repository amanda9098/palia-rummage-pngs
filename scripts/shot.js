// scripts/shot.js
import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || "1600", 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || "1000", 10);
const DEVICE_SCALE = parseFloat(process.env.DEVICE_SCALE || "1.75"); // crisp but not huge

// Your three targets
const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png" },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png" },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png" },
];

/**
 * Find the DOM box that holds the whole map (not the tabs/header).
 * Priority: .maplibregl-map -> #map -> .leaflet-container -> canvas parent chain.
 */
async function getMapBoundingBox(page) {
  // wait for app to finish rendering
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  // Try a few known containers first
  const selectors = [
    ".maplibregl-map",         // MapLibre root
    "#map",                    // generic id some apps use
    ".leaflet-container"       // Leaflet root
  ];

  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      try {
        await loc.waitFor({ state: "visible", timeout: 10_000 });
        const box = await loc.boundingBox();
        if (box && box.width > 400 && box.height > 300) return box;
      } catch {}
    }
  }

  // Fallback: start from the canvas and walk up to a large ancestor
  const canvas = await page.$("canvas.maplibregl-canvas") || await page.$("canvas");
  if (canvas) {
    // climb up to the nearest sizeable ancestor (likely .maplibregl-map)
    const box = await page.evaluate((el) => {
      function good(r){ return r && r.width > 400 && r.height > 300 && r.height < window.innerHeight * 0.95; }
      let node = el;
      let best = null;
      while (node) {
        const r = node.getBoundingClientRect();
        if (good(r)) best = r;
        // stop at the first element that’s clearly the container
        if (node.classList && (node.classList.contains("maplibregl-map") || node.id === "map")) break;
        node = node.parentElement;
      }
      if (!best) best = el.getBoundingClientRect();
      return { x: best.x, y: best.y, width: best.width, height: best.height };
    }, canvas);
    return box;
  }

  // Last resort: whole viewport
  return { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H };
}

async function snapOne(url, outfile) {
  const browser = await chromium.launch(); // headless
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      deviceScaleFactor: DEVICE_SCALE
    });
    const page = await context.newPage();

    // Try up to 2 attempts in case the map finishes sizing late
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });

      const box = await getMapBoundingBox(page);

      // small padding to include the map frame but avoid tabs (tune as needed)
      const P = 8;
      const clip = {
        x: Math.max(0, box.x - P),
        y: Math.max(0, box.y - P),
        width: Math.min(box.width + P * 2, VIEWPORT_W),
        height: Math.min(box.height + P * 2, VIEWPORT_H)
      };

      // Ensure clip stays within the page
      if (clip.width > 0 && clip.height > 0) {
        const buf = await page.screenshot({ type: "png", clip });
        await fs.mkdir("docs", { recursive: true });
        await fs.writeFile(outfile, buf);
        return;
      }

      // If the box looked wrong on first attempt, wait and retry once
      if (attempt === 1) await page.waitForTimeout(2000);
    }
    throw new Error("Could not compute a valid map bounding box.");
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
