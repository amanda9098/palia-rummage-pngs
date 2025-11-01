import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W = parseInt(process.env.VIEWPORT_W || "1600", 10);
const VIEWPORT_H = parseInt(process.env.VIEWPORT_H || "1000", 10);

// TH.GL map URLs (you can change text labels, but keep the URLs)
const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png" },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png" },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png" },
];

async function snap(url, outfile) {
  const browser = await chromium.launch(); // default headless
  const page = await browser.newPage({ viewport: { width: VIEWPORT_W, height: VIEWPORT_H } });

  // Load page and wait for network to settle; TH.GL is client-rendered
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });

  // Full-page shot is safest. If you later want just the map canvas,
  // you can find a selector and do element screenshot instead.
  const buffer = await page.screenshot({ fullPage: true, type: "png" });

  await fs.mkdir("docs", { recursive: true });
  await fs.writeFile(outfile, buffer);
  await browser.close();
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
