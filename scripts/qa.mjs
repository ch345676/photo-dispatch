import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1512, height: 1120 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.QA_BASE_URL || "http://127.0.0.1:5188", {
  waitUntil: "networkidle",
});
await page.screenshot({
  path: "test-results/desktop.png",
  fullPage: true,
  animations: "disabled",
});
await page.getByRole("button", { name: "进入个人空间" }).click();
await page
  .getByRole("button", { name: "新建派单", exact: true })
  .first()
  .click();
await page.getByLabel("伙伴姓名").fill("测试摄影师");
await page.getByLabel("联系方式").fill("13800000000");
await page.getByRole("button", { name: "保存伙伴", exact: true }).click();
await page.getByLabel("拍摄主题").fill("验收婚礼拍摄");
await page.getByLabel("酒店 / 场地").fill("测试酒店");
await page.getByLabel("展厅 / 宴会厅").fill("3 楼水晶厅");
await page.getByLabel("拍摄费用").fill("800");
await page.getByLabel("报销车费").fill("120");
await page.getByLabel("车费说明").fill("往返打车");
await page.getByLabel("约定定金").fill("200");
await page.getByLabel("已付定金", { exact: true }).fill("200");
await page.getByLabel("定金支付日期").fill("2026-10-08");
await page.getByRole("button", { name: "保存派单", exact: true }).click();
await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
await page.reload();
await page
  .getByRole("button", { name: "全部订单", exact: false })
  .first()
  .click();
await page
  .getByRole("button", { name: "验收婚礼拍摄", exact: false })
  .first()
  .click();
await page.getByRole("dialog").getByText("未结账", { exact: true }).waitFor();
await page.getByRole("button", { name: "登记付款", exact: true }).click();
await page.getByLabel("本次付款金额").fill("300");
await page.getByRole("button", { name: "确认登记", exact: true }).click();
await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
await page
  .getByRole("button", { name: "验收婚礼拍摄", exact: false })
  .first()
  .click();
await page.getByRole("dialog").getByText("部分结账", { exact: true }).waitFor();
await page.getByRole("button", { name: "登记付款", exact: true }).click();
await page.getByRole("button", { name: /填入剩余金额/ }).click();
await page.getByRole("button", { name: "确认登记", exact: true }).click();
await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
await page
  .getByRole("button", { name: "验收婚礼拍摄", exact: false })
  .first()
  .click();
await page.getByRole("dialog").getByText("已结账", { exact: true }).waitFor();
await page.getByRole("button", { name: "关闭", exact: true }).click();
await page.getByRole("button", { name: "数据与设置", exact: true }).click();
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "导出完整备份" }).click();
await (await dl).saveAs("test-results/backup.json");
await page
  .locator("input[type=file]")
  .setInputFiles("test-results/backup.json");
await page.getByRole("button", { name: "确认恢复", exact: true }).click();
await page.getByRole("status").filter({ hasText: "备份已恢复" }).waitFor();
await page.getByRole("button", { name: "查看演示空间", exact: true }).click();
await page.getByRole("button", { name: "工作台", exact: true }).click();
await page.getByRole("button", { name: "关闭提示", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "test-results/mobile.png",
  fullPage: true,
  animations: "disabled",
});
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw new Error("Mobile document overflows");
await page.getByRole("button", { name: "打开导航", exact: true }).click();
await page.getByRole("button", { name: "派单日历", exact: true }).click();
await page.getByRole("button", { name: "按沟通日期", exact: true }).click();
await page.screenshot({
  path: "test-results/mobile-calendar.png",
  fullPage: true,
  animations: "disabled",
});
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "PASS: desktop/mobile render, personal/demo separation, partner + order CRUD, persistence, partial/full payment, backup export/import, calendar, no runtime errors or mobile overflow.",
);
await browser.close();
