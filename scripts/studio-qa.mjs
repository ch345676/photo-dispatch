import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1512, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.QA_BASE_URL || "http://127.0.0.1:5188/", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "进入个人空间", exact: true }).click();
  await page.locator(".studio-welcome").waitFor();
  await page.screenshot({
    path: "test-results/studio-empty-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `test-results/studio-empty-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /简洁模式/ }).click();
  assert.equal(
    await page.locator("html").getAttribute("data-sg-motion"),
    "calm",
  );
  await page.reload();
  assert.equal(
    await page.locator("html").getAttribute("data-sg-motion"),
    "calm",
  );
  await page.getByRole("button", { name: "日历", exact: true }).click();
  assert.equal(
    await page
      .locator(".motion-page")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /丰富动效/ }).click();
  await page.screenshot({
    path: "test-results/studio-settings-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.getByRole("button", { name: "日历", exact: true }).click();
  assert.equal(
    await page
      .locator(".motion-page")
      .evaluate((el) => getComputedStyle(el).animationName),
    "studio-page",
  );
  const nav = page.getByRole("button", { name: "我的", exact: true });
  const box = await nav.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  assert.ok((await page.locator(".studio-ripple").count()) > 0);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "日历", exact: true }).click();
  assert.equal(
    await page
      .locator(".motion-page")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "查看演示空间", exact: true }).click();
  await page.getByRole("button", { name: "日历", exact: true }).click();
  await page.screenshot({
    path: "test-results/studio-calendar-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 1512/390/360 layouts, empty onboarding, motion preference persistence, real ripple, reduced-motion, demo separation, no runtime errors",
  );
} finally {
  await browser.close();
}
