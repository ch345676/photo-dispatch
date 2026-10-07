import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  demoData,
  today,
  shiftDate,
  recordPayment,
  balance,
} from "../src/domain.mjs";

mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1512, height: 1120 },
});
const page = await context.newPage();
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5188/";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base, { waitUntil: "networkidle" });
  const data = demoData();
  const source = recordPayment(
    {
      ...data.orders[0],
      title: "已结清的原婚礼",
      amount: 800,
      travelAmount: 120,
      travelNote: "原订单往返车费",
      depositRequired: 200,
      depositPaid: 200,
      depositDate: today(),
      settlementPaid: 0,
      settlementDate: "",
      executionStatus: "已完成",
      note: "原婚礼联系人与改期历史",
      paymentNote: "原婚礼结算备注",
    },
    { kind: "settlement", amount: 720, date: today(), note: "原婚礼已结清" },
  );
  data.orders = [source];
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
  const demoBefore = await page.evaluate(() =>
    localStorage.getItem("shiguang-photo-v1-demo"),
  );
  const savedNotice = (text) =>
    page.getByRole("status").filter({ hasText: text }).waitFor();
  async function dismiss() {
    const button = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await button.count()) await button.click();
  }
  async function openSource() {
    await page
      .getByRole("button", { name: /已结清的原婚礼/ })
      .first()
      .click();
    await page.getByRole("dialog", { name: "派单详情", exact: true }).waitFor();
  }
  async function copy() {
    await page.getByRole("button", { name: "复制派单", exact: true }).click();
    await page
      .getByRole("dialog", { name: "复制为新派单", exact: true })
      .waitFor();
  }
  async function assertDraft() {
    assert.equal(await page.getByLabel("拍摄主题").inputValue(), "");
    assert.equal(
      await page.getByLabel("拍摄日期", { exact: false }).inputValue(),
      "",
    );
    assert.equal(await page.getByLabel("派单沟通日期").inputValue(), today());
    assert.equal(
      await page.getByLabel("合作伙伴", { exact: false }).inputValue(),
      source.partnerId,
    );
    assert.equal(
      await page.getByLabel("酒店 / 场地").inputValue(),
      source.venue,
    );
    assert.equal(
      await page.getByLabel("展厅 / 宴会厅").inputValue(),
      source.hall,
    );
    assert.equal(await page.getByLabel("拍摄费用").inputValue(), "800");
    assert.equal(await page.getByLabel("约定定金").inputValue(), "200");
    assert.equal(await page.getByLabel("报销车费").inputValue(), "0");
    assert.equal(await page.getByLabel("车费说明").inputValue(), "");
    assert.equal(
      await page.getByLabel("已付定金", { exact: true }).inputValue(),
      "0",
    );
    assert.equal(
      await page
        .getByLabel("已付尾款（不含定金）", { exact: true })
        .inputValue(),
      "0",
    );
    assert.equal(await page.getByLabel("拍摄备注").inputValue(), "");
    assert.equal(await page.getByLabel("结算备注").inputValue(), "");
    assert.equal(await page.getByLabel("派单状态").inputValue(), "待确认");
    assert.equal(await page.getByLabel("执行状态").inputValue(), "待拍摄");
  }
  await openSource();
  const copyButton = page.getByRole("button", {
    name: "复制派单",
    exact: true,
  });
  await copyButton.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog", { name: "复制为新派单", exact: true })
    .waitFor();
  await assertDraft();
  assert.deepEqual(await read(), data, "打开复制草稿不保存任何订单");
  await page.getByRole("button", { name: "保存派单", exact: true }).click();
  assert.equal(
    await page.getByLabel("拍摄主题").evaluate((e) => e.validity.valueMissing),
    true,
  );
  await page.getByLabel("拍摄主题").fill("下一场婚礼");
  await page.getByRole("button", { name: "保存派单", exact: true }).click();
  assert.equal(
    await page.getByLabel("拍摄日期").evaluate((e) => e.validity.valueMissing),
    true,
  );
  assert.deepEqual(await read(), data);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("dialog", { name: "派单详情", exact: true }).waitFor();
  assert.deepEqual(await read(), data, "取消复制不修改原单");

  await copy();
  await page.getByLabel("拍摄主题").fill("下一场婚礼");
  await page.getByLabel("拍摄日期").fill(source.shootDate);
  await page.getByRole("button", { name: "保存派单", exact: true }).click();
  await savedNotice("档期冲突");
  assert.deepEqual(await read(), data, "原单参与新单档期冲突判断");
  const nextDate = shiftDate(source.shootDate, 3);
  await page.getByLabel("拍摄日期").fill(nextDate);
  await page.getByLabel("派单沟通日期").fill(shiftDate(today(), -1));
  await page.getByLabel("报销车费").fill("90");
  await page.getByLabel("车费说明").fill("新场次另行约定的车费");
  await dismiss();
  await page.getByRole("dialog").evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({
    path: "test-results/duplicate-order-desktop.png",
    animations: "disabled",
  });

  // Adding a partner temporarily leaves the order form; both cancel and save must retain its draft.
  await page.getByRole("button", { name: "添加伙伴", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .getByRole("dialog", { name: "复制为新派单", exact: true })
    .waitFor();
  assert.equal(await page.getByLabel("拍摄主题").inputValue(), "下一场婚礼");
  assert.equal(await page.getByLabel("拍摄日期").inputValue(), nextDate);
  await page.getByRole("button", { name: "添加伙伴", exact: true }).click();
  await page.getByLabel("伙伴姓名").fill("复制验收摄影师");
  await page.getByLabel("联系方式").fill("13800009999");
  await page.getByRole("button", { name: "保存伙伴", exact: true }).click();
  await savedNotice("伙伴信息已保存");
  await page
    .getByRole("dialog", { name: "复制为新派单", exact: true })
    .waitFor();
  const partnerId = await page.getByLabel("合作伙伴").inputValue();
  assert.notEqual(partnerId, source.partnerId);
  assert.equal(await page.getByLabel("报销车费").inputValue(), "90");
  assert.equal((await read()).orders.length, 1);
  await page.getByRole("button", { name: "保存派单", exact: true }).click();
  await savedNotice("派单已保存");
  await page.reload();
  const saved = await read();
  assert.deepEqual(
    saved.orders.find((o) => o.id === source.id),
    source,
  );
  const created = saved.orders.find((o) => o.id !== source.id);
  assert.ok(created);
  assert.equal(created.title, "下一场婚礼");
  assert.equal(created.shootDate, nextDate);
  assert.equal(created.communicatedDate, shiftDate(today(), -1));
  assert.equal(created.partnerId, partnerId);
  assert.equal(created.paymentLedger, undefined);
  assert.equal(created.depositPaid + created.settlementPaid, 0);
  assert.equal(created.travelAmount, 90);
  assert.equal(balance(created), 890);
  assert.equal(created.note, "");
  assert.equal(created.dispatchStatus, "待确认");
  assert.equal(created.executionStatus, "待拍摄");
  assert.equal(saved.orders.length, 2);

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await openSource();
    const button = page.getByRole("button", { name: "复制派单", exact: true });
    const box = await button.boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width);
    await page.screenshot({
      path: `test-results/duplicate-entry-${width}.png`,
      animations: "disabled",
    });
    await copy();
    assert.equal(
      await page
        .getByRole("dialog")
        .evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: `test-results/duplicate-form-${width}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "派单详情", exact: true }).waitFor();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    assert.deepEqual((await read()).orders, saved.orders);
  }
  await page.setViewportSize({ width: 1512, height: 1120 });
  await page.getByRole("button", { name: "数据与设置", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份" }).click();
  await (await download).saveAs("test-results/duplicate-backup.json");
  const backup = JSON.parse(
    readFileSync("test-results/duplicate-backup.json", "utf8"),
  );
  assert.deepEqual(backup.orders, saved.orders);
  await page
    .locator("input[type=file]")
    .setInputFiles("test-results/duplicate-backup.json");
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await savedNotice("备份已恢复");
  assert.deepEqual((await read()).orders, saved.orders);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("shiguang-photo-v1-demo")),
    demoBefore,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: keyboard/mobile copy entry, unsaved and cancel isolation, required new date/title, original-order conflict, editable travel and communication date, partner detour, independent saved order, unchanged paid source, backup roundtrip and demo isolation.",
  );
} finally {
  await browser.close();
}
