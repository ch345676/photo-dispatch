import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${readFileSync("build/icon.svg", "utf8")}`,
  );
  mkdirSync("build", { recursive: true });
  await page.screenshot({ path: "build/icon.png", omitBackground: true });
} finally {
  await browser.close();
}
