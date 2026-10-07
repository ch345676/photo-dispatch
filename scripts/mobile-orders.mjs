import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { demoData, today } from "../src/domain.mjs";

mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5188/";
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(base, { waitUntil: "networkidle" });
  const data = demoData();
  data.orders = [
    {
      ...data.orders[0],
      id: "mobile-a",
      title: "婚礼与车费验收",
      amount: 800,
      travelAmount: 120,
      travelNote: "往返打车",
      depositRequired: 200,
      depositPaid: 200,
      settlementPaid: 300,
      settlementDate: today(),
    },
    {
      ...data.orders[1],
      id: "mobile-cancel",
      title: "取消后仍需结清",
      amount: 300,
      travelAmount: 0,
      depositRequired: 100,
      depositPaid: 100,
      depositDate: today(),
      settlementPaid: 0,
      dispatchStatus: "已取消",
      executionStatus: "已取消",
    },
    {
      ...data.orders[2],
      id: "mobile-zero",
      title: "零元合作拍摄",
      amount: 0,
      travelAmount: 0,
      depositRequired: 0,
      depositPaid: 0,
      settlementPaid: 0,
    },
    {
      ...data.orders[3],
      id: "mobile-long",
      title: "长标题婚礼：" + "一起记录值得珍藏的幸福时刻".repeat(5),
      venue: "非常长的酒店名称".repeat(6),
      hall: "十二楼水晶宴会厅及露台观礼区域".repeat(4),
      amount: 99999999.99,
      travelAmount: 99999999.99,
      depositRequired: 0,
      depositPaid: 0,
      settlementPaid: 0,
    },
  ];
  await page.evaluate((value) => {
    localStorage.setItem("shiguang-photo-v1-mode", "personal");
    localStorage.setItem("shiguang-photo-v1-personal", JSON.stringify(value));
  }, data);
  await page.reload();

  const visibleCards = page.locator(
    ".mobile-order-list:visible .order-list-card",
  );
  const activeCard = page.getByRole("article", {
    name: "婚礼与车费验收",
    exact: true,
  });
  async function assertLayout() {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "整页没有横向溢出",
    );
    const overflow = await visibleCards.evaluateAll((cards) =>
      cards
        .flatMap((card) => [
          card,
          ...card.querySelectorAll(
            "h3,.order-list-place,.order-list-payment,.order-list-actions",
          ),
        ])
        .some((element) => element.scrollWidth > element.clientWidth + 1),
    );
    assert.equal(overflow, false, "卡片及其文字、金额和操作区不需要横向滚动");
    assert.equal(
      await page
        .locator(".stat-value")
        .evaluateAll((values) =>
          values.some((value) => value.scrollWidth > value.clientWidth + 1),
        ),
      false,
      "月度大金额不能被统计卡片裁切",
    );
  }

  // Each order surface uses the exact same records and ordering as its desktop table.
  for (const route of ["overview", "orders", "finance"]) {
    await page.goto(base + "#" + route, { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1512, height: 1120 });
    assert.equal(await page.locator(".mobile-order-list").isVisible(), false);
    const desktopTitles = await page
      .locator(".desktop-order-table .table-title > span")
      .allTextContents();
    await page.setViewportSize({ width: 760, height: 1000 });
    assert.equal(await page.locator(".desktop-order-table").isVisible(), false);
    assert.equal(await page.locator(".mobile-order-list").isVisible(), true);
    assert.deepEqual(
      await visibleCards.locator("h3").allTextContents(),
      desktopTitles,
    );
    await page.setViewportSize({ width: 761, height: 1000 });
    assert.equal(await page.locator(".desktop-order-table").isVisible(), true);
    assert.equal(await page.locator(".mobile-order-list").isVisible(), false);
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 });
      await assertLayout();
    }
  }

  await page.goto(base + "#orders", { waitUntil: "networkidle" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await visibleCards.count(), 4);
  assert.match(await activeCard.innerText(), /920/);
  assert.match(
    await activeCard.locator(".order-list-balance").innerText(),
    /420/,
  );
  assert.match(
    await activeCard.locator(".order-list-payment > p").innerText(),
    /已付 ¥ 500.*应付含车费 ¥ 120/,
  );
  await activeCard.getByText("已付定金", { exact: true }).waitFor();
  await activeCard.getByText("部分结账", { exact: true }).waitFor();
  await activeCard.getByText(data.orders[0].hall, { exact: true }).waitFor();
  await activeCard
    .getByText(data.orders[0].communicatedDate, { exact: true })
    .waitFor();
  const zeroCard = page.getByRole("article", {
    name: "零元合作拍摄",
    exact: true,
  });
  assert.equal(
    await zeroCard.getByRole("button", { name: /登记付款/ }).count(),
    0,
  );
  await zeroCard.getByText("无需结账", { exact: true }).waitFor();

  // Independent 44px action targets, with no nested buttons or hidden-table focus.
  for (const button of await activeCard.getByRole("button").all()) {
    const bounds = await button.boundingBox();
    assert.ok(bounds.height >= 44, "主要操作触控高度至少 44px");
  }
  assert.equal(await page.locator(".order-list-card button button").count(), 0);
  const detailsButton = activeCard.getByRole("button", {
    name: "查看婚礼与车费验收详情",
    exact: true,
  });
  await detailsButton.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("dialog")
    .getByText("婚礼与车费验收", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();

  await activeCard.getByRole("button", { name: /的全部派单$/ }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await visibleCards.count(), 1, "伙伴入口只显示对应伙伴派单");
  await page.getByRole("button", { name: "返回伙伴列表" }).click();
  await page.goto(base + "#orders", { waitUntil: "networkidle" });

  await activeCard
    .getByRole("button", { name: "为婚礼与车费验收登记付款", exact: true })
    .click();
  await page.getByLabel("本次付款金额").fill("120");
  await page.getByRole("button", { name: "确认登记", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "派单已保存" }).waitFor();
  assert.match(
    await activeCard.locator(".order-list-balance").innerText(),
    /300/,
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shiguang-photo-v1-personal")),
  );
  assert.equal(saved.orders[0].travelAmount, 120);
  assert.equal(saved.orders[0].settlementPaid, 420);
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();

  await page.getByRole("textbox", { name: "搜索订单" }).fill("婚礼与车费验收");
  assert.equal(await visibleCards.count(), 1);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出明细", exact: true }).click();
  await (await downloadPromise).saveAs("test-results/mobile-filtered.csv");
  const csv = readFileSync("test-results/mobile-filtered.csv", "utf8");
  assert.ok(csv.includes('"120","920","往返打车"'));
  assert.ok(!csv.includes("取消后仍需结清"));
  await page.getByRole("button", { name: "关闭提示", exact: true }).click();
  await page.screenshot({
    path: "test-results/mobile-orders-390.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("textbox", { name: "搜索订单" })
    .fill("不存在的拍摄记录");
  assert.equal(await page.locator(".empty:visible").count(), 1);
  assert.equal(await visibleCards.count(), 0);
  await page.getByRole("textbox", { name: "搜索订单" }).fill("");

  await page.goto(base + "#finance", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "待结账", exact: true }).click();
  await page
    .getByRole("article", { name: "取消后仍需结清", exact: true })
    .waitFor();
  assert.equal(await visibleCards.count(), 3);
  await page.setViewportSize({ width: 360, height: 800 });
  await assertLayout();
  await page.screenshot({
    path: "test-results/mobile-finance-360.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1512, height: 1120 });
  await page.screenshot({
    path: "test-results/orders-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four order surfaces, 760/761px switch, 360/390px overflow, long text and large money, travel totals, statuses, keyboard/detail/partner/payment actions, cancelled balances, search and CSV, single empty state.",
  );
} finally {
  await browser.close();
}
