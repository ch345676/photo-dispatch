import assert from "node:assert/strict";
import { chromium } from "playwright";
import { demoData, today, balance, recordPayment } from "../src/domain.mjs";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 1000 },
});
const p = await context.newPage();
const url = process.env.QA_BASE_URL || "http://127.0.0.1:5188";
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(url, { waitUntil: "networkidle" });
await p.getByRole("button", { name: "日历", exact: true }).click();
await p.getByRole("button", { name: "按沟通日期" }).click();
await p.getByRole("button", { name: "我的", exact: true }).click();
await p.getByRole("button", { name: "业务概览", exact: true }).click();
assert.equal(
  await p.locator(".day-schedule .shoot-card").count(),
  2,
  "工作台始终按拍摄日",
);
const data = demoData();
const a = {
  ...data.orders[0],
  id: "qa-a",
  title: "档期冲突历史单 A",
  amount: 800,
  travelAmount: 120,
  depositRequired: 200,
  depositPaid: 200,
  settlementPaid: 0,
};
const b = { ...a, id: "qa-b", title: "档期冲突历史单 B" };
const cancelled = {
  ...a,
  id: "qa-c",
  title: "取消后仍需付费",
  amount: 300,
  travelAmount: 0,
  depositRequired: 100,
  depositPaid: 100,
  dispatchStatus: "已取消",
  executionStatus: "已取消",
};
data.orders = [a, b, cancelled];
await p.evaluate((d) => {
  localStorage.setItem("shiguang-photo-v1-mode", "personal");
  localStorage.setItem("shiguang-photo-v1-personal", JSON.stringify(d));
}, data);
await p.reload();
await p.getByRole("button", { name: "结算", exact: true }).click();
await p.getByRole("button", { name: "待结账", exact: true }).click();
assert.equal(
  await p.locator(".table-title").filter({ hasText: "取消后仍需付费" }).count(),
  1,
  "取消欠款仍在待结账",
);
await p
  .getByRole("button", { name: /档期冲突历史单 A/ })
  .first()
  .click();
await p.getByRole("button", { name: "登记付款", exact: true }).click();
await p.getByLabel("本次付款金额").fill("300");
await p.getByRole("button", { name: "确认登记" }).click();
await p.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
let saved = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("shiguang-photo-v1-personal")),
);
assert.equal(saved.orders[0].settlementPaid, 300);
assert.equal(balance(saved.orders[0]), 420);
await p
  .getByRole("button", { name: /档期冲突历史单 A/ })
  .first()
  .click();
await p.getByRole("button", { name: "编辑派单" }).click();
await p.getByLabel("拍摄费用").fill("10");
await p.getByRole("button", { name: "保存派单", exact: true }).click();
await p.locator("dialog[open] .toast").waitFor();
assert.ok(
  (await p.locator("dialog[open] .toast").innerText()).includes(
    "约定定金不能超过",
  ),
  "校验错误在弹窗上层可见",
);
const p2 = await context.newPage();
await p2.goto(url, { waitUntil: "networkidle" });
const concurrentData = structuredClone(saved);
concurrentData.orders[0] = {
  ...recordPayment(concurrentData.orders[0], {
    kind: "settlement",
    amount: 120,
    date: today(),
    note: "另一标签新增付款",
  }),
  updatedAt: new Date().toISOString(),
};
await p2.evaluate(
  (d) => localStorage.setItem("shiguang-photo-v1-personal", JSON.stringify(d)),
  concurrentData,
);
await p.waitForFunction(
  () => document.querySelectorAll("dialog[open]").length === 0,
);
saved = await p.evaluate(() =>
  JSON.parse(localStorage.getItem("shiguang-photo-v1-personal")),
);
assert.equal(
  saved.orders[0].settlementPaid,
  420,
  "其他标签已付金额不被旧编辑覆盖",
);
for (const route of [
  "overview",
  "calendar",
  "orders",
  "partners",
  "finance",
  "venues",
  "reminders",
  "settings",
]) {
  await p.goto(url + "#" + route, { waitUntil: "networkidle" });
  await p.setViewportSize({ width: 360, height: 800 });
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, route + "在360px无整页横向溢出");
  await p.setViewportSize({ width: 1400, height: 1000 });
}
assert.deepEqual(errors, []);
console.log(
  "PASS: date-view isolation, cancelled unpaid bills, historical conflict payment, reimbursement totals, visible modal validation, multi-tab stale-write protection, all 8 routes at 360px.",
);
await browser.close();
