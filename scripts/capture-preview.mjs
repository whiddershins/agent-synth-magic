import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Optional local visual inspection. Start npm run dev first.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading', { name: 'FM / 6' }).waitFor();
  await mkdir('build/previews', { recursive: true });
  await page.screenshot({ path: 'build/previews/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'build/previews/mobile.png', fullPage: true });
} finally { await browser.close(); }
