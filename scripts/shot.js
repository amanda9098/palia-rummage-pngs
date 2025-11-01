// scripts/shot.js — robust: find largest visible Leaflet rect, resize viewport, clip screenshot
import { chromium } from "playwright";
import fs from "fs/promises";

const VIEWPORT_W   = parseInt(process.env.VIEWPORT_W   || "1920", 10);
const VIEWPORT_H   = parseInt(process.env.VIEWPORT_H   || "1200", 10);
const DEVICE_SCALE = parseFloat(process.env.DEVICE_SCALE || "2");
const STABILIZE_MS = parseInt(process.env.STABILIZE_MS || "1200", 10);
const PADDING      = parseInt(process.env.MAP_PADDING    || "8", 10); // a little breathing room

const TARGETS = [
  { url: "https://palia.th.gl/rummage-pile?map=kilima-valley", out: "docs/kilima.png" },
  { url: "https://palia.th.gl/rummage-pile?map=bahari-bay",    out: "docs/bahari.png" },
  { url: "https://palia.th.gl/rummage-pile?map=elderwood",     out: "docs/elderwood.png" },
];

async function hideChrome(page) {
  await page.addStyleTag({ content: `
    header, nav, footer, .tabs, .tabbar, .maplibregl-control-container,
    .ad, [id*="ad"], [class*="ad"] { display:none!important; }
    body { background:#000!important; }
  `});
}

/**
 * Return the bounding rect of the largest *visible* Leaflet container.
 * Rect is in CSS pixels relative to the viewport (DOMRect values).
 */
async function getLargestVisibleLeafletRect(page) {
  return await page.evaluate(() => {
    const isVisible = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 200 && r.height > 150 && r.bottom > 0 &&
