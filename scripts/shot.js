import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || "1600", 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || "1000", 10);

const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png" },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png" },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png" },
];

async function snapOnce(browser, url) {
  const page = await browser.newPage({ viewport: { width: VIEWPORT_W, height: VIEWPORT_H } });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });

  // Try to screenshot the map area if we can find it; otherwise full page.
  const candidate = page.locator("canvas, #map, .leaflet-pane, .maplibregl-canvas").first();
  try {
    await candidate.waitFor({ state: "visible", timeout: 10_000 });
    const buf = await candidate.screenshot({ type: "png" });
    await page.close();
    return buf;
  } catch {
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    await page.close();
    return buf;
  }
}

async function snap(url, outfile) {
  const browser = await chromium.launch(); // headless
  try {
    try {
      const buf = await snapOnce(browser, url);
      await fs.mkdir("docs", { recursive: true });
      await fs.writeFile(outfile, buf);
      return;
    } catch (e) {
      console.log("Retrying once for:", url, e.message ?? e);
      const buf = await snapOnce(browser, url);
      await fs.mkdir("docs", { recursive: true });
      await fs.writeFile(outfile, buf);
    }
  } finally {
    await browser.close();
  }
}

async function run() {
  for (const t of TARGETS) {
    console.log("Shooting:", t.url);
    await snap(t.url, t.out);
    console.log("Wrote:", t.out);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
