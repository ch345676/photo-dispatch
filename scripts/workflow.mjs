import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import {
  demoData,
  blankOrder,
  recordPayment,
  validateBackup,
  balance,
  paid,
} from "../src/domain.mjs";
const base = (process.env.QA_BASE_URL || "http://127.0.0.1:5188/").split(
  "#",
)[0];
const prefix = "shiguang-photo-v1-",
  key = prefix + "personal",
  draftKey = prefix + "drafts-personal";
const seed = demoData("2026-10-08");
const original = recordPayment(
  {
    ...blankOrder("2026-10-08"),
    id: "workflow-main",
    title: "车费待补录婚礼",
    city: "重庆",
    venue: "拾光酒店",
    hall: "3楼水晶厅",
    partnerId: seed.partners[0].id,
    amount: 800,
    depositRequired: 200,
    travelStatus: "pending",
    dispatchStatus: "已确认",
    executionStatus: "已完成",
  },
  { kind: "deposit", amount: 200, date: "2026-10-08", note: "微信定金" },
);
const fixture = validateBackup({ ...seed, orders: [original] });
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
  ...(process.env.QA_PROXY_SERVER
    ? {
        proxy: {
          server: process.env.QA_PROXY_SERVER,
          bypass: "localhost,127.0.0.1",
        },
      }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1512, height: 1120 },
  timezoneId: "Asia/Shanghai",
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () => page.locator("dialog[open]");
const read = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
const getDrafts = () =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key))?.items || [],
    draftKey,
  );
async function route(p) {
  await page.goto(base + "#" + p, { waitUntil: "networkidle" });
}
async function saved() {
  await dialog().waitFor({ state: "hidden" });
}
async function close() {
  await dialog().getByRole("button", { name: "关闭", exact: true }).click();
  await saved();
}
async function openMain() {
  await page
    .getByRole("button", { name: /车费待补录婚礼/ })
    .first()
    .click();
  await page.getByRole("dialog", { name: "派单详情", exact: true }).waitFor();
}
async function shot(name) {
  const dismiss = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await dismiss.count()) await dismiss.click();
  await page.screenshot({
    path: `test-results/workflow-${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ fixture, key, prefix }) => {
      localStorage.clear();
      localStorage.setItem(prefix + "mode", "personal");
      localStorage.setItem(key, JSON.stringify(fixture));
    },
    { fixture, key, prefix },
  );
  await page.reload({ waitUntil: "networkidle" });
  await route("calendar");
  await page.getByLabel("日历月份").fill("2026-10");
  assert.match(
    await page
      .getByRole("button", { name: "2026-10-08，1 场拍摄", exact: true })
      .innerText(),
    /陈予安/,
  );
  await button("周视图").click();
  await page.getByRole("region", { name: "派单日历" }).waitFor();
  await button("上一周").click();
  await button("下一周").click();
  assert.equal(await page.locator(".week-day-row").count(), 7);
  await shot("desktop-week");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await shot("mobile-week");
  await button("月视图").click();
  await shot("mobile-month");
  await page.setViewportSize({ width: 1512, height: 1120 });
  console.log("PASS: 月历短标题、周视图切换和桌面手机展示");

  await button("新建派单").click();
  assert.equal(await page.getByLabel("已付定金", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("派单沟通日期").count(), 0);
  await page.getByLabel("拍摄主题").fill("草稿恢复拍摄");
  await page.getByLabel("拍摄日期").fill("2026-10-22");
  await page.getByLabel("合作伙伴").selectOption(seed.partners[0].id);
  await button("暂存并关闭").click();
  await saved();
  assert.equal((await read()).orders.length, 1);
  assert.equal((await getDrafts()).length, 1);
  await route("drafts");
  await button("继续填写").click();
  assert.equal(await page.getByLabel("拍摄主题").inputValue(), "草稿恢复拍摄");
  await page.getByLabel("酒店 / 场地").fill("草稿酒店");
  await page.getByLabel("展厅 / 宴会厅").fill("二楼春日厅");
  await page.getByLabel("拍摄费用").fill("1250");
  await button("无需报销").click();
  await shot("desktop-quick-form");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await shot("mobile-quick-form");
  await button("保存派单").click();
  await saved();
  assert.equal((await read()).orders.length, 2);
  assert.equal((await getDrafts()).length, 0);
  await page.setViewportSize({ width: 1512, height: 1120 });
  console.log("PASS: 简洁表单、自动草稿、刷新恢复、正式保存后清理草稿");

  await route("orders");
  await openMain();
  await button("登记付款").click();
  await button("填入剩余金额 ¥ 600").click();
  await button("确认登记").click();
  assert.equal((await read()).orders[0].settlementPaid, 0);
  await page.getByRole("checkbox", { name: /我确认本次仅付清/ }).check();
  await button("确认登记").click();
  await saved();
  let order = (await read()).orders[0];
  assert.equal(paid(order), 800);
  assert.equal(balance(order), 0);
  await openMain();
  assert.match(await dialog().innerText(), /待核车费/);
  await button("核对车费").click();
  await page.getByLabel("车费状态").selectOption("checked");
  await page.getByLabel("报销车费", { exact: true }).fill("120.5");
  await page.getByLabel("车费说明").fill("往返打车已核对");
  await button("保存车费").click();
  await saved();
  order = (await read()).orders[0];
  assert.equal(balance(order), 120.5);
  assert.equal(paid(order), 800);
  assert.equal(order.paymentLedger.entries.length, 2);
  console.log("PASS: 未知车费结清前确认、待核状态、补录后金额与流水一致");

  await openMain();
  await button("微信派单信息").click();
  const share = await page.getByLabel("派单信息文案").inputValue();
  assert.match(share, /3楼水晶厅/);
  assert.match(share, /120.5/);
  await button("复制派单信息").click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
    share,
  );
  await button("返回详情").click();
  await button("编辑派单").click();
  await page.getByLabel("拍摄日期").fill("2026-10-11");
  await page.getByLabel("开始时间").fill("10:00");
  await button("保存派单").click();
  assert.equal((await read()).orders[0].shootDate, "2026-10-08");
  await page.getByLabel("改期原因").fill("客户将婚礼改到周末");
  await button("保存派单").click();
  await saved();
  let changed = (await read()).orders[0];
  assert.equal(changed.scheduleHistory.length, 1);
  assert.equal(changed.scheduleHistory[0].from.date, "2026-10-08");
  assert.equal(changed.dispatchStatus, "已改期");
  assert.deepEqual(changed.paymentLedger, order.paymentLedger);
  await openMain();
  assert.match(await dialog().innerText(), /客户将婚礼改到周末/);
  await shot("desktop-history");
  await page
    .getByRole("region", { name: "改期历史", exact: true })
    .scrollIntoViewIfNeeded();
  await shot("desktop-history-records");
  await close();
  console.log("PASS: 微信文案可复制，改期原因必填且历史和付款完整保留");

  await route("finance");
  await page.getByLabel("统计月份").fill("2026-10");
  await button("伙伴对账").click();
  await page.getByLabel("对账伙伴").selectOption(seed.partners[0].id);
  assert.equal(await page.locator(".statement-order").count(), 2);
  assert.match(await page.locator(".statement-summary").innerText(), /1,370.5/);
  let dl = page.waitForEvent("download");
  await button("导出对账 CSV").click();
  await (await dl).saveAs("test-results/workflow-statement.csv");
  let csv = readFileSync("test-results/workflow-statement.csv", "utf8");
  assert.match(csv, /"120.5"/);
  assert.equal(csv.split("\r\n").length, 3);
  await button("复制对账文字").click();
  assert.match(
    await page.evaluate(() => navigator.clipboard.readText()),
    /合计 2 场/,
  );
  await shot("desktop-statement");
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow();
  await shot("mobile-statement");
  await page.setViewportSize({ width: 1512, height: 1120 });
  console.log("PASS: 伙伴月度对账、分币总额、导出与复制内容一致");

  await route("orders");
  await openMain();
  await button("删除派单").click();
  await button("移入回收站").click();
  await saved();
  let deleted = await read();
  assert.equal(deleted.orders.length, 1);
  assert.deepEqual(deleted.trash[0].order, changed);
  await route("trash");
  await shot("desktop-trash");
  dl = page.waitForEvent("download");
  await button("先导出完整备份").click();
  await (await dl).saveAs("test-results/workflow-backup.json");
  let backup = validateBackup(
    JSON.parse(readFileSync("test-results/workflow-backup.json", "utf8")),
  );
  assert.deepEqual(backup.trash[0].order, changed);
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/workflow-backup.json");
  assert.match(await dialog().innerText(), /回收站订单/);
  await button("确认恢复").click();
  await saved();
  await button("恢复订单").click();
  assert.equal((await read()).trash.length, 0);
  assert.deepEqual(
    (await read()).orders.find((o) => o.id === changed.id).paymentLedger,
    changed.paymentLedger,
  );
  await route("orders");
  await openMain();
  await button("删除派单").click();
  await button("移入回收站").click();
  await saved();
  await route("trash");
  await button("永久删除").click();
  assert.match(await dialog().innerText(), /无法恢复/);
  await dialog().getByRole("button", { name: "永久删除", exact: true }).click();
  await saved();
  assert.equal((await read()).trash.length, 0);
  console.log("PASS: 回收站、完整备份恢复、找回付款历史与永久删除确认");

  await route("orders");
  await button("新建派单").click();
  await page.getByLabel("拍摄主题").fill("个人未完成草稿");
  await button("暂存并关闭").click();
  await saved();
  await route("settings");
  await button("查看演示空间").click();
  await route("drafts");
  assert.equal(await page.locator(".workflow-list-row").count(), 0);
  await route("settings");
  await button("进入个人空间").first().click();
  await route("drafts");
  assert.equal(await page.locator(".workflow-list-row").count(), 1);
  await button("继续填写").click();
  const other = await context.newPage();
  await other.goto(base);
  await other.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key));
    data.items[0].order.title = "另一标签草稿";
    localStorage.setItem(key, JSON.stringify(data));
  }, draftKey);
  await page.getByLabel("拍摄主题").fill("当前标签未保存修改");
  await button("暂存并关闭").click();
  assert.equal(await dialog().count(), 1);
  assert.equal((await getDrafts())[0].order.title, "另一标签草稿");
  assert.match(await dialog().innerText(), /其他页面/);
  dl = page.waitForEvent("download");
  await button("下载当前输入").click();
  await (await dl).saveAs("test-results/workflow-unsaved-input.json");
  assert.equal(
    JSON.parse(readFileSync("test-results/workflow-unsaved-input.json", "utf8"))
      .items[0].order.title,
    "当前标签未保存修改",
  );
  await button("放弃本次输入").click();
  await button("确认放弃当前输入").click();
  await saved();
  assert.equal((await getDrafts())[0].order.title, "另一标签草稿");
  await other.close();
  await page.reload({ waitUntil: "networkidle" });
  await button("继续填写").click();
  assert.equal(await page.getByLabel("拍摄主题").inputValue(), "另一标签草稿");
  await close();
  console.log("PASS: 草稿空间隔离及跨标签覆盖保护，保存失败保留输入");

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      "calendar",
      "orders",
      "drafts",
      "finance",
      "partners",
      "trash",
      "settings",
    ]) {
      await route(path);
      await noOverflow();
    }
    await route("drafts");
    await shot(`drafts-${width}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await route("calendar");
  assert.equal(
    await page
      .locator("main")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await button("新建派单").click();
  assert.equal(
    await dialog().evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await close();
  assert.deepEqual(errors, []);
  console.log("PASS: 390/360px 分栏、无横向溢出、减少动态效果及零页面异常");
} catch (error) {
  await page.screenshot({
    path: "test-results/workflow-failure.png",
    fullPage: true,
    animations: "disabled",
  });
  console.error("FAIL workflow:", error.message);
  throw error;
} finally {
  await browser.close();
}
