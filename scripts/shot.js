// scripts/shot.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, '..', 'docs');
const SHOTS = [
  { name: 'kilima.png',    url: 'https://palia.th.gl/rummage-pile?map=kilima-valley' },
  { name: 'bahari.png',    url: 'https://palia.th.gl/rummage-pile?map=bahari-bay' },
  { name: 'elderwood.png', url: 'https://palia.th.gl/rummage-pile?map=elderwood' },
];

const MIN_BYTES = 50_000; // sanity threshold to avoid committing corrupt images

function isValidPng(buf) {
  if (!buf || buf.length < 100) return false;
  const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  return buf.subarray(0, 8).equals(sig);
}

(async () => {
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();

  for (const { name, url } of SHOTS) {
    console.log(`[shot] ${name} ← ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });

    // give the tiles/canvas time to render
    await page.waitForTimeout(3000);

    const buf = await page.screenshot({ type: 'png', fullPage: true });

    if (!isValidPng(buf) || buf.length < MIN_BYTES) {
      throw new Error(`Refusing to write ${name}: invalid/too-small PNG (len=${buf?.length ?? 0})`);
    }

    const outPath = path.join(OUTDIR, name);
    fs.writeFileSync(outPath, buf); // binary write (NO encoding option)
    console.log(`[ok] wrote ${outPath} (${buf.length} bytes)`);
  }

  await browser.close();
})().catch(err => {
  console.error('[shot] failed:', err);
  process.exit(1);
});
