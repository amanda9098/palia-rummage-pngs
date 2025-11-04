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
  if
