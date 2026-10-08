import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { demoData, validateBackup } from "../src/domain.mjs";

const base = (process.env.QA_BASE_URL || "http://127.0.0.1:5188/").split(
  "#",
)[0];
const key = "shiguang-photo-v1-";
const source = demoData("2026-10-08");
const fixture = validateBackup({
  ...source,
  orders: [
    ...source.orders.slice(0, 3).map((o, i) => ({
      ...o,
      id: `calendar-${i}`,
      title: ["水晶厅婚礼", "品牌发布会", "江边婚礼"][i],
      shootDate: "2026-10-08",
      communicatedDate: "2026-10-02",
      dispatchStatus: "已确认",
      executionStatus: "待拍摄",
    })),
    {
      ...source.orders[0],
      id: "calendar-cancel",
      title: "已取消不占档期",
      shootDate: "2026-10-08",
      communicatedDate: "2026-10-02",
      dispatchStatus: "已取消",
      executionStatus: "已取消",
    },
  ],
});
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
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
await page.clock.setFixedTime(new Date("2026-10-08T04:00:00.000Z"));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const raw = () =>
  page.evaluate((key) => localStorage.getItem(key + "personal"), key);
const dialog = (name) => page.getByRole("dialog", { name, exact: true });
const close = async () =>
  page
    .locator("dialog[open]")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
const nav = () =>
  page.getByRole("navigation", { name: "底部分栏", exact: true });
async function section(label) {
  const navigation =
    page.viewportSize().width <= 760
      ? nav()
      : page.getByRole("navigation", { name: "主导航", exact: true });
  await navigation.getByRole("button", { name: label, exact: true }).click();
}
async function shot(name, fullPage = false) {
  await page.screenshot({
    path: `test-results/calendar-sections-${name}.png`,
    fullPage,
    animations: "disabled",
  });
}
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "页面不能横向溢出",
  );
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ key, fixture }) => {
      localStorage.setItem(key + "mode", "personal");
      localStorage.setItem(key + "personal", JSON.stringify(fixture));
    },
    { key, fixture },
  );
  await page.reload({ waitUntil: "networkidle" });
  const before = await raw();
  await page.getByRole("heading", { name: "日程概览", exact: true }).waitFor();
  assert.equal(
    await page.locator(".stats-grid, .orders-toolbar, .settings-grid").count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button")
      .count(),
    5,
  );
  assert.equal(await page.locator(".month-day").count(), 35);
  const day = page.getByRole("button", {
    name: "2026-10-08，3 场拍摄",
    exact: true,
  });
  assert.match(await day.innerText(), /\+1 场/);
  assert.equal(
    await page.getByText("已取消不占档期", { exact: true }).count(),
    0,
  );
  await shot("desktop", true);
  await day.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await dialog("10 月 8 日安排").locator(".agenda-order").count(),
    3,
  );
  await shot("desktop-expanded");
  await dialog("10 月 8 日安排")
    .getByRole("button", { name: /水晶厅婚礼/ })
    .click();
  await dialog("派单详情").getByText("报销车费", { exact: true }).waitFor();
  await close();
  await dialog("10 月 8 日安排").waitFor();
  await page.keyboard.press("Escape");
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.equal(await raw(), before);
  console.log(
    "PASS: 默认月历、分栏隔离、多单展示与取消排除、展开详情及返回均只读",
  );

  await page
    .getByRole("button", { name: "2026-10-12，0 场拍摄", exact: true })
    .click();
  await page
    .getByRole("button", { name: "为当天新建派单", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("拍摄日期 *", { exact: true }).inputValue(),
    "2026-10-12",
  );
  await close();
  await page.getByRole("button", { name: "按沟通日期", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-10-02，3 次沟通", exact: true })
    .click();
  assert.equal(
    await dialog("10 月 2 日安排")
      .getByText("拍摄日期 2026-10-08", { exact: true })
      .count(),
    3,
  );
  await page.getByRole("button", { name: "记录当天沟通", exact: true }).click();
  await page
    .getByRole("button", { name: "沟通、状态与备注", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("拍摄日期 *", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await page.getByLabel("派单沟通日期 *", { exact: true }).inputValue(),
    "2026-10-02",
  );
  await close();
  await section("派单");
  assert.equal(
    await page.getByRole("combobox", { name: "筛选日期类型" }).inputValue(),
    "shootDate",
  );
  assert.equal(await raw(), before);
  console.log(
    "PASS: 空日建单预填拍摄日，沟通日建单分离拍摄日，订单筛选日期独立",
  );

  await section("日历");
  await page.getByRole("button", { name: "按拍摄日期", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-09-28，0 场拍摄", exact: true })
    .click();
  assert.equal(await page.getByLabel("日历月份").inputValue(), "2026-09");
  await close();
  await page.getByLabel("日历月份").fill("2028-02");
  await page
    .getByRole("button", { name: "2028-02-29，0 场拍摄", exact: true })
    .waitFor();
  await page.getByLabel("日历月份").fill("2026-08");
  assert.equal(await page.locator(".month-day").count(), 42);
  await page.getByRole("button", { name: "今天", exact: true }).click();
  assert.equal(await page.getByLabel("日历月份").inputValue(), "2026-10");
  await dialog("10 月 8 日安排").waitFor();
  await close();
  await page.getByRole("button", { name: "下个月", exact: true }).click();
  assert.equal(await page.getByLabel("日历月份").inputValue(), "2026-11");
  await page.getByRole("button", { name: "上个月", exact: true }).click();
  assert.equal(await page.getByLabel("日历月份").inputValue(), "2026-10");
  console.log("PASS: 邻月日期、闰年二月、六周月份、今天与前后翻月可用");

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    await section("日历");
    await noOverflow();
    assert.equal(await nav().getByRole("button").count(), 5);
    for (const button of await nav().getByRole("button").all()) {
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.width >= 44);
    }
    await shot(`${width}`);
    await page
      .getByRole("button", { name: "2026-10-08，3 场拍摄", exact: true })
      .click();
    await noOverflow();
    await dialog("10 月 8 日安排").evaluate(async (e) => {
      await Promise.all(e.getAnimations().map((a) => a.finished));
    });
    const box = await dialog("10 月 8 日安排").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    assert.ok(Math.abs(box.width - width) < 2, "手机展开层应完整覆盖底部宽度");
    await shot(`${width}-expanded`);
    await close();
    await section("派单");
    await page
      .getByRole("navigation", { name: "派单分类" })
      .getByRole("button", { name: /提醒中心/ })
      .click();
    await page
      .getByRole("heading", { name: "提醒中心", exact: true })
      .waitFor();
    await noOverflow();
    await shot(`${width}-reminders`);
    await section("结算");
    await page
      .getByRole("heading", { name: "费用结算", exact: true })
      .waitFor();
    await noOverflow();
    await section("资源");
    await page
      .getByRole("heading", { name: "合作伙伴", exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "资源分类" })
      .getByRole("button", { name: "场地管理", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "场地管理", exact: true })
      .waitFor();
    await noOverflow();
    await shot(`${width}-resources`);
    await section("我的");
    await page
      .getByRole("heading", { name: "数据与设置", exact: true })
      .waitFor();
    await page
      .getByRole("navigation", { name: "我的分类" })
      .getByRole("button", { name: "业务概览", exact: true })
      .click();
    await page.locator(".stats-grid").waitFor();
    await noOverflow();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(
      await nav()
        .getByRole("button", { name: "我的", exact: true })
        .getAttribute("aria-current"),
      "page",
    );
    assert.equal(await raw(), before);
  }
  console.log(
    "PASS: 390/360手机五栏、各分类功能、刷新路径与只读数据一致，展开与页面均无横向溢出",
  );

  const longData = structuredClone(fixture);
  longData.orders[0].title = "WEDDING".repeat(14);
  longData.orders[0].venue = "重庆双江国际婚礼艺术中心".repeat(5);
  longData.orders[0].hall = "三楼江景水晶宴会厅".repeat(5);
  await page.evaluate(
    ({ key, data }) =>
      localStorage.setItem(key + "personal", JSON.stringify(data)),
    { key, data: longData },
  );
  await page.goto(base + "#calendar");
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "2026-10-08，3 场拍摄", exact: true })
    .click();
  await noOverflow();
  assert.equal(
    await dialog("10 月 8 日安排").evaluate(
      (e) => e.scrollWidth > e.clientWidth,
    ),
    false,
  );
  await shot("360-long-expanded");
  await close();
  await page.evaluate(
    ({ key, before }) => localStorage.setItem(key + "personal", before),
    { key, before },
  );
  await page.reload({ waitUntil: "networkidle" });
  console.log("PASS: 手机长主题、长场地和宴会厅可完整换行，展开层不横向溢出");

  await page.goto(base + "#settings");
  await page.getByRole("button", { name: "查看演示空间", exact: true }).click();
  await section("日历");
  await page.getByRole("button", { name: "进入个人空间", exact: true }).click();
  assert.equal(await raw(), before);
  await page
    .getByRole("button", { name: "2026-10-08，3 场拍摄", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: 演示/个人切换保留原记录，无页面未捕获异常");
  const freshContext = await browser.newContext({
    viewport: { width: 360, height: 844 },
    timezoneId: "Asia/Shanghai",
  });
  const fresh = await freshContext.newPage();
  fresh.on("pageerror", (e) => errors.push(e.message));
  await fresh.clock.setFixedTime(new Date("2026-10-08T04:00:00.000Z"));
  await fresh.goto(base, { waitUntil: "networkidle" });
  await fresh
    .getByRole("button", { name: "进入个人空间", exact: true })
    .click();
  await fresh.getByRole("button", { name: "按沟通日期", exact: true }).click();
  await fresh
    .getByRole("button", { name: "2026-10-02，0 次沟通", exact: true })
    .click();
  await fresh
    .getByRole("button", { name: "记录当天沟通", exact: true })
    .click();
  await fresh.getByLabel("伙伴姓名").fill("日历新伙伴");
  await fresh.getByRole("button", { name: "保存伙伴", exact: true }).click();
  await fresh
    .getByRole("button", { name: "沟通、状态与备注", exact: true })
    .click();
  assert.equal(
    await fresh.getByLabel("派单沟通日期 *", { exact: true }).inputValue(),
    "2026-10-02",
  );
  assert.equal(
    await fresh.getByLabel("拍摄日期 *", { exact: true }).inputValue(),
    "",
  );
  assert.deepEqual(errors, []);
  await freshContext.close();
  console.log(
    "PASS: 首次空空间经添加伙伴返回，仍保留沟通日期草稿并要求填写拍摄日期",
  );
} catch (error) {
  console.error("FAIL: calendar-sections: " + error.message);
  await shot("failure").catch(() => {});
  throw error;
} finally {
  await browser.close();
}
