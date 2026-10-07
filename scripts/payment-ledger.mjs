import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { demoData, balance } from "../src/domain.mjs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1512, height: 1500 },
});
const page = await context.newPage();
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5188/";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base, { waitUntil: "networkidle" });
  const data = demoData();
  data.version = 1;
  data.orders = [
    {
      ...data.orders[0],
      id: "ledger-qa",
      title: "付款流水验收婚礼",
      amount: 800,
      travelAmount: 120,
      travelNote: "往返打车",
      depositRequired: 300,
      depositPaid: 200,
      depositDate: "2026-10-01",
      settlementPaid: 100,
      settlementDate: "2026-10-02",
      paymentNote: "此前只有累计记录",
    },
  ];
  await page.evaluate((d) => {
    localStorage.setItem("shiguang-photo-v1-mode", "personal");
    localStorage.setItem("shiguang-photo-v1-personal", JSON.stringify(d));
  }, data);
  await page.goto(base + "#orders", { waitUntil: "networkidle" });
  await page.reload();
  const read = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("shiguang-photo-v1-personal")),
    );
  async function detail(p = page) {
    await p
      .getByRole("button", { name: /付款流水验收婚礼/ })
      .first()
      .click();
    await p.getByRole("dialog", { name: "派单详情", exact: true }).waitFor();
  }
  async function close(p = page) {
    await p.getByRole("button", { name: "关闭", exact: true }).click();
  }
  async function register(kind, amount, date, note, p = page) {
    await detail(p);
    await p.getByRole("button", { name: "登记付款", exact: true }).click();
    await p.getByLabel("付款类型").selectOption(kind);
    await p.getByLabel("本次付款金额").fill(String(amount));
    await p.getByLabel("付款日期").fill(date);
    await p.getByLabel("本次付款备注").fill(note);
    await p.getByRole("button", { name: "确认登记", exact: true }).click();
    await p.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
  }
  await detail();
  assert.equal(await page.locator(".ledger-row").count(), 0);
  await page.getByText("此前只有累计记录", { exact: true }).first().waitFor();
  await close();
  await register("deposit", 50, "2026-10-10", "补付定金 50 元");
  let saved = await read();
  assert.equal(saved.version, 2);
  assert.equal(saved.orders[0].depositPaid, 250);
  assert.equal(saved.orders[0].paymentLedger.baseline.depositPaid, 200);
  assert.equal(saved.orders[0].paymentLedger.entries.length, 1);
  await register("deposit", 40, "2026-10-05", "补录较早的定金");
  saved = await read();
  assert.equal(saved.orders[0].depositDate, "2026-10-10");
  await detail();
  await page
    .getByRole("button", { name: "撤销定金付款 50 元", exact: true })
    .click();
  await page.getByLabel("撤销原因").fill("这笔记录重复填写");
  await page.getByRole("button", { name: "确认撤销记录", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
  saved = await read();
  assert.equal(saved.orders[0].depositPaid, 240);
  assert.equal(saved.orders[0].depositDate, "2026-10-05");
  assert.ok(saved.orders[0].paymentLedger.entries[0].voidedAt);
  assert.equal(balance(saved.orders[0]), 580);
  await register("settlement", 580, "2026-10-12", "尾款含车费，收款已确认");
  saved = await read();
  assert.equal(balance(saved.orders[0]), 0);
  assert.equal(saved.orders[0].paymentNote, "此前只有累计记录");
  await detail();
  await page.getByRole("button", { name: "编辑派单", exact: true }).click();
  assert.equal(
    await page.getByLabel("已付定金", { exact: true }).isEditable(),
    false,
  );
  assert.equal(await page.getByLabel("尾款支付日期").isEditable(), false);
  await page.getByRole("button", { name: "取消", exact: true }).click();

  await detail();
  await page.getByRole("button", { name: "更正初始累计", exact: true }).click();
  await page.getByLabel("初始已付尾款").fill("900");
  await page.getByLabel("更正原因").fill("校验超付");
  await page.getByRole("button", { name: "确认更正", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "超过" }).waitFor();
  assert.equal((await read()).orders[0].paymentLedger.revisions.length, 0);
  await page.getByLabel("初始已付尾款").fill("100");
  await page.getByLabel("初始已付定金").fill("180");
  await page.getByLabel("更正原因").fill("核对原记录：初始定金多填了 20 元");
  assert.equal(await page.getByRole("alert").count(), 0);
  const dismiss = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await dismiss.count()) await dismiss.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/payment-baseline-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "确认更正", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
  saved = await read();
  assert.equal(saved.orders[0].paymentLedger.baseline.depositPaid, 200);
  assert.equal(
    saved.orders[0].paymentLedger.revisions[0].value.depositPaid,
    180,
  );
  assert.equal(saved.orders[0].depositPaid, 220);
  assert.equal(balance(saved.orders[0]), 20);
  await page.setViewportSize({ width: 1512, height: 1500 });
  await detail();
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await page.screenshot({
    path: "test-results/payment-history-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator(".payment-history").scrollIntoViewIfNeeded();
  const overflow = await page
    .getByRole("dialog")
    .evaluate((d) => d.scrollWidth > d.clientWidth);
  assert.equal(overflow, false);
  await page.screenshot({
    path: "test-results/payment-history-mobile.png",
    animations: "disabled",
  });
  await close();
  await page.setViewportSize({ width: 1512, height: 1500 });

  // Competing windows: the older open payment form must close after the other pays.
  await detail();
  await page.getByRole("button", { name: "登记付款", exact: true }).click();
  await page.getByLabel("本次付款金额").fill("20");
  const other = await context.newPage();
  other.on("pageerror", (e) => errors.push(e.message));
  await other.goto(base + "#orders", { waitUntil: "networkidle" });
  await register("settlement", 20, "2026-10-13", "另一标签页结清", other);
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  saved = await read();
  assert.equal(saved.orders[0].paymentLedger.entries.length, 4);
  assert.equal(balance(saved.orders[0]), 0);
  await other.close();

  await page.getByRole("button", { name: "数据与设置", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份" }).click();
  await (
    await downloadPromise
  ).saveAs("test-results/payment-ledger-backup.json");
  const backup = JSON.parse(
    readFileSync("test-results/payment-ledger-backup.json", "utf8"),
  );
  assert.equal(backup.version, 2);
  assert.equal(backup.orders[0].paymentLedger.entries.length, 4);
  const corrupted = structuredClone(backup);
  corrupted.orders[0].settlementPaid--;
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad-ledger.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(corrupted)),
    });
  await page.getByRole("status").filter({ hasText: "不一致" }).waitFor();
  assert.deepEqual(await read(), saved);
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/payment-ledger-backup.json");
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "备份已恢复" }).waitFor();
  assert.deepEqual(
    (await read()).orders[0].paymentLedger,
    saved.orders[0].paymentLedger,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: v1 migration, first-payment baseline, dated deposit entries, backdated payment, void and balance rollback, full travel settlement, read-only derived totals, audited baseline correction, cross-tab competition, exact backup restore and corrupted-backup rejection, desktop/mobile ledger.",
  );
} finally {
  await browser.close();
}
