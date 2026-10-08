import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  demoData,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
  validateBackup,
} from "../src/domain.mjs";

const base = (process.env.QA_BASE_URL || "http://127.0.0.1:5188/").split(
  "#",
)[0];
const prefix = "shiguang-photo-v1-";
const keys = {
  mode: prefix + "mode",
  personal: prefix + "personal",
  demo: prefix + "demo",
  personalMeta: prefix + "backup-personal",
  demoMeta: prefix + "backup-demo",
};
const now = "2026-10-08T04:00:00.000Z";
const month = "2026-10";
const metadata = JSON.stringify({
  lastExportedAt: "2026-10-07T00:00:00.000Z",
  lastRestoredAt: "",
  snoozedUntil: "",
});
const fixture = demoData("2026-10-08");
let crossing = {
  ...fixture.orders[0],
  id: "payment-cross-month",
  title: "跨月婚礼 · 十一月拍摄",
  shootDate: "2026-11-15",
  amount: 2000,
  travelAmount: 120,
  depositRequired: 1000,
  depositPaid: 300,
  depositDate: "2026-09-28",
  settlementPaid: 100,
  settlementDate: "2026-10-02",
  dispatchStatus: "已确认",
  executionStatus: "待拍摄",
  paymentNote: "首次历史累计应由最新更正覆盖",
};
crossing = recordPayment(crossing, {
  kind: "deposit",
  amount: 200,
  date: "2026-10-03",
  note: "十月补付定金",
});
crossing = recordPayment(crossing, {
  kind: "settlement",
  amount: 150,
  date: "2026-09-30",
  note: "十月补录的九月实际付款",
});
crossing = recordPayment(crossing, {
  kind: "settlement",
  amount: 250,
  date: "2026-10-05",
  note: '十月尾款，已确认\n核对"转账单"',
});
crossing = recordPayment(crossing, {
  kind: "settlement",
  amount: 25,
  date: "2026-10-06",
  note: "撤销的尾款不应进入报表",
});
crossing = voidPayment(
  crossing,
  crossing.paymentLedger.entries.at(-1).id,
  "重复录入，排除这笔付款",
);
crossing = revisePaymentBaseline(
  crossing,
  {
    depositPaid: 350,
    depositDate: "2026-10-01",
    settlementPaid: 120,
    settlementDate: "2026-10-02",
    note: "更正后的历史累计，仅保留350定金与120尾款",
  },
  "核对原始转账单后更正金额与定金日期",
);
crossing.paymentLedger.entries[0].recordedAt = "2026-09-30T02:00:00.000Z";
crossing.paymentLedger.entries[1].recordedAt = "2026-10-06T02:00:00.000Z";
crossing.paymentLedger.entries[2].recordedAt = "2026-11-01T02:00:00.000Z";
crossing.paymentLedger.entries[3].recordedAt = "2026-10-06T02:00:00.000Z";
crossing.paymentLedger.entries[3].voidedAt = "2026-10-07T02:00:00.000Z";
crossing.paymentLedger.revisions[0].recordedAt = "2026-11-02T02:00:00.000Z";
const cancelled = {
  ...fixture.orders[1],
  id: "payment-cancelled",
  title: "已取消但定金已支付的品牌活动",
  shootDate: "2026-10-12",
  amount: 600,
  travelAmount: 0,
  depositRequired: 100,
  depositPaid: 80,
  depositDate: "2026-10-04",
  settlementPaid: 0,
  settlementDate: "",
  dispatchStatus: "已取消",
  executionStatus: "已取消",
};
const rejected = {
  ...fixture.orders[2],
  id: "payment-rejected",
  title: "已拒绝但费用已支付的外拍",
  shootDate: "2026-09-20",
  amount: 500,
  travelAmount: 30,
  depositRequired: 0,
  depositPaid: 0,
  depositDate: "",
  settlementPaid: 60,
  settlementDate: "2026-10-07",
  dispatchStatus: "已拒绝",
  executionStatus: "待拍摄",
};
const unpaid = {
  ...fixture.orders[3],
  id: "payment-none",
  title: "十月待拍且完全未付款的婚礼",
  shootDate: "2026-10-21",
  amount: 1000,
  travelAmount: 20,
  depositRequired: 100,
  depositPaid: 0,
  depositDate: "",
  settlementPaid: 0,
  settlementDate: "",
  dispatchStatus: "已确认",
  executionStatus: "待拍摄",
};
fixture.orders = [crossing, cancelled, rejected, unpaid];
const business = validateBackup(fixture);
const demo = validateBackup({
  ...fixture,
  orders: [{ ...cancelled, title: "演示空间专有的付款记录" }],
});
const checks = [];
const errors = [];
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
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
await page.clock.setFixedTime(new Date(now));

const report = () =>
  page.getByRole("region", { name: "付款月份报表", exact: true });
const records = () => report().locator("article.payment-record");
const raw = (key) => page.evaluate((key) => localStorage.getItem(key), key);
const snapshot = () =>
  page.evaluate(
    (prefix) =>
      Object.fromEntries(
        Object.keys(localStorage)
          .filter((key) => key.startsWith(prefix))
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
    prefix,
  );
const numeric = (value) => Number(value.replace(/[^\d.-]/g, ""));
const notice = (text) =>
  page.getByRole("status").filter({ hasText: text }).waitFor();

async function seed(mode = "personal") {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ prefix, values }) => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(values))
        localStorage.setItem(key, value);
    },
    {
      prefix,
      values: {
        [keys.mode]: mode,
        [keys.personal]: JSON.stringify(business),
        [keys.demo]: JSON.stringify(demo),
        [keys.personalMeta]: metadata,
        [keys.demoMeta]: metadata,
      },
    },
  );
  await page.goto(base + "#finance");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("统计月份", { exact: true }).fill(month);
}

async function openReport() {
  await page.getByRole("button", { name: "按付款月份", exact: true }).click();
  await report().waitFor();
}

async function metric(label) {
  const value = await report()
    .getByText(label, { exact: true })
    .evaluate((element) => {
      const card = element.parentElement;
      return (
        card.querySelector("strong")?.textContent ||
        card.textContent.replace(element.textContent, "")
      );
    });
  return numeric(value);
}

async function assertStats(total, deposit, settlement, orders) {
  for (const [label, value] of [
    ["本月支出", total],
    ["定金支出", deposit],
    ["尾款支出", settlement],
    ["涉及订单", orders],
  ]) {
    assert.equal(await metric(label), value, label + "应按实际付款日期统计");
  }
}

async function assertRecord(date, amount, sourceLabel, title = crossing.title) {
  const matches = records()
    .filter({ hasText: title })
    .filter({ hasText: date })
    .filter({ hasText: sourceLabel });
  await matches.waitFor();
  assert.match(
    await matches.innerText(),
    new RegExp("[¥￥]\\s*" + amount + "(?:\\s|元|$)"),
  );
}

function parseCSV(text) {
  const result = [];
  let row = [],
    cell = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index++;
      row.push(cell);
      result.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    result.push(row);
  }
  return result.filter((row) => row.some((value) => value !== ""));
}

async function downloadCSV() {
  const downloading = page.waitForEvent("download");
  await report()
    .getByRole("button", { name: "导出付款明细", exact: true })
    .click();
  const download = await downloading;
  assert.equal(await download.failure(), null);
  assert.match(download.suggestedFilename(), /\.csv$/i);
  return parseCSV(readFileSync(await download.path(), "utf8"));
}

async function dismissToast() {
  const close = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await close.count()) await close.click();
}

async function scenario(name, run) {
  try {
    await run();
    checks.push(name);
    console.log("PASS: " + name);
  } catch (error) {
    console.error("FAIL: " + name + ": " + error.message);
    throw new Error(name + ": " + error.message, { cause: error });
  }
}

try {
  await scenario(
    "默认保留拍摄月份视图，付款月份独立统计且切回不改变原汇总",
    async () => {
      await seed();
      const before = await snapshot();
      await report().waitFor({ state: "hidden" });
      const shootingTotal = page
        .locator(".stat-card")
        .filter({ hasText: "本月应付金额" })
        .locator(".stat-number");
      assert.equal(numeric(await shootingTotal.innerText()), 1020);
      await page
        .getByRole("button", { name: "导出明细", exact: true })
        .waitFor();
      await openReport();
      await assertStats(1060, 630, 430, 3);
      assert.equal(await records().count(), 6);
      await page
        .getByRole("button", { name: "按拍摄月份", exact: true })
        .click();
      await report().waitFor({ state: "hidden" });
      assert.equal(numeric(await shootingTotal.innerText()), 1020);
      await page.getByRole("button", { name: "待结账", exact: true }).waitFor();
      assert.deepEqual(await snapshot(), before);
    },
  );

  await scenario(
    "按付款date跨拍摄月统计，最新历史累计不重复且撤销记录排除",
    async () => {
      await seed();
      const before = await snapshot();
      await openReport();
      await assertStats(1060, 630, 430, 3);
      await assertRecord("2026-10-01", 350, "历史累计");
      await assertRecord("2026-10-02", 120, "历史累计");
      await assertRecord("2026-10-03", 200, "逐笔付款");
      await assertRecord("2026-10-05", 250, "逐笔付款");
      await assertRecord("2026-10-04", 80, "历史累计", cancelled.title);
      await assertRecord("2026-10-07", 60, "历史累计", rejected.title);
      assert.equal(await records().filter({ hasText: "历史累计" }).count(), 4);
      assert.equal(await records().filter({ hasText: "逐笔付款" }).count(), 2);
      assert.equal(
        await records().filter({ hasText: "2026-09-30" }).count(),
        0,
      );
      assert.equal(
        await records().filter({ hasText: "撤销的尾款不应进入报表" }).count(),
        0,
      );
      assert.equal(
        await records().filter({ hasText: unpaid.title }).count(),
        0,
      );
      assert.doesNotMatch(
        await report().innerText(),
        /6\s*笔/,
        "不能将历史累计伪装为六笔实际付款",
      );
      await page.getByLabel("统计月份", { exact: true }).fill("2026-09");
      await assertStats(150, 0, 150, 1);
      assert.equal(await records().count(), 1);
      await assertRecord("2026-09-30", 150, "逐笔付款");
      await page.getByLabel("统计月份", { exact: true }).fill("2026-11");
      await assertStats(0, 0, 0, 0);
      assert.equal(
        await records().count(),
        0,
        "登记于十一月的十月付款不应按recordedAt归月",
      );
      assert.deepEqual(await snapshot(), before);
    },
  );

  await scenario(
    "伙伴、款项和搜索筛选联动，导出CSV严格匹配可见记录",
    async () => {
      await seed();
      const before = await snapshot();
      await openReport();
      await page
        .getByLabel("付款伙伴", { exact: true })
        .selectOption(crossing.partnerId);
      await assertStats(920, 550, 370, 1);
      assert.equal(await records().count(), 4);
      await page
        .getByLabel("款项类型", { exact: true })
        .selectOption("settlement");
      await page.getByLabel("搜索付款记录", { exact: true }).fill("跨月婚礼");
      await assertStats(370, 0, 370, 1);
      assert.equal(await records().count(), 2);
      const csv = await downloadCSV();
      const header = csv[0];
      const index = (expression) => {
        const value = header.findIndex((cell) => expression.test(cell));
        assert.ok(value >= 0, "CSV缺少列 " + expression);
        return value;
      };
      const dateColumn = index(/^付款日期/);
      const kindColumn = index(/款项类型|付款类型/);
      const amountColumn = index(/金额/);
      const partnerColumn = index(/伙伴/);
      const titleColumn = index(/主题/);
      const sourceColumn = index(/来源/);
      assert.equal(csv.length - 1, await records().count());
      assert.deepEqual(
        csv
          .slice(1)
          .map((row) => [row[dateColumn], numeric(row[amountColumn])])
          .sort(),
        [
          ["2026-10-02", 120],
          ["2026-10-05", 250],
        ],
      );
      assert.equal(
        csv.slice(1).reduce((sum, row) => sum + numeric(row[amountColumn]), 0),
        370,
      );
      assert.deepEqual(
        new Set(csv.slice(1).map((row) => row[sourceColumn])),
        new Set(["历史累计", "逐笔付款"]),
      );
      for (const row of csv.slice(1)) {
        assert.match(row[kindColumn], /尾款/);
        assert.equal(
          row[partnerColumn],
          fixture.partners.find((partner) => partner.id === crossing.partnerId)
            .name,
        );
        assert.equal(row[titleColumn], crossing.title);
      }
      const noteColumn = header.findIndex((cell) => /备注/.test(cell));
      if (noteColumn >= 0)
        assert.ok(
          csv
            .slice(1)
            .some((row) =>
              row[noteColumn].includes('十月尾款，已确认\n核对"转账单"'),
            ),
          "CSV保留引号和换行备注",
        );
      await dismissToast();
      await page
        .getByLabel("搜索付款记录", { exact: true })
        .fill("不存在的付款主题");
      await assertStats(0, 0, 0, 0);
      assert.equal(await records().count(), 0);
      await page.getByLabel("付款伙伴", { exact: true }).selectOption("");
      await page.getByLabel("款项类型", { exact: true }).selectOption("");
      await page.getByLabel("搜索付款记录", { exact: true }).fill("已取消");
      await assertStats(80, 80, 0, 1);
      assert.equal(await records().count(), 1);
      assert.deepEqual(
        await snapshot(),
        before,
        "浏览报表与CSV导出不写本地业务或完整备份时间",
      );
    },
  );

  await scenario(
    "付款记录可查看对应派单，返回后筛选保留且账目只读",
    async () => {
      await seed();
      await openReport();
      await page
        .getByLabel("付款伙伴", { exact: true })
        .selectOption(crossing.partnerId);
      await page
        .getByLabel("款项类型", { exact: true })
        .selectOption("deposit");
      const before = await snapshot();
      await records()
        .first()
        .getByRole("button", {
          name: "查看派单：" + crossing.title,
          exact: true,
        })
        .click();
      const detail = page.getByRole("dialog", {
        name: "派单详情",
        exact: true,
      });
      await detail.waitFor();
      assert.ok((await detail.innerText()).includes(crossing.title));
      assert.ok((await detail.innerText()).includes(crossing.shootDate));
      await detail.getByRole("button", { name: "关闭", exact: true }).click();
      assert.equal(
        await page.getByLabel("付款伙伴", { exact: true }).inputValue(),
        crossing.partnerId,
      );
      assert.equal(
        await page.getByLabel("款项类型", { exact: true }).inputValue(),
        "deposit",
      );
      await assertStats(550, 550, 0, 1);
      assert.deepEqual(await snapshot(), before);
    },
  );

  await scenario(
    "个人和演示空间报表独立，刷新和空间切换不写业务或备份元数据",
    async () => {
      await seed();
      const before = await snapshot();
      await openReport();
      await assertStats(1060, 630, 430, 3);
      await page.reload({ waitUntil: "networkidle" });
      await openReport();
      await assertStats(1060, 630, 430, 3);
      await page.goto(base + "#settings");
      await page
        .getByRole("button", { name: "查看演示空间", exact: true })
        .click();
      await page.goto(base + "#finance");
      await openReport();
      await assertStats(80, 80, 0, 1);
      assert.equal(await records().count(), 1);
      assert.match(await records().first().innerText(), /演示空间专有/);
      for (const key of [
        keys.personal,
        keys.demo,
        keys.personalMeta,
        keys.demoMeta,
      ])
        assert.equal(await raw(key), before[key]);
    },
  );

  await scenario("旧版本1备份无流水时仅展示已标注日期的历史累计", async () => {
    await seed();
    const legacy = structuredClone(fixture);
    legacy.version = 1;
    legacy.orders = [
      {
        ...crossing,
        shootDate: "2026-09-15",
        depositPaid: 200,
        depositDate: "2026-10-01",
        settlementPaid: 150,
        settlementDate: "2026-10-02",
      },
    ];
    delete legacy.orders[0].paymentLedger;
    delete legacy.orders[0].travelAmount;
    delete legacy.orders[0].travelNote;
    await page.goto(base + "#settings");
    await page.locator("input[type=file]").setInputFiles({
      name: "旧版本1累计付款备份.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await page
      .getByRole("dialog", { name: "恢复备份", exact: true })
      .getByRole("button", { name: "确认恢复", exact: true })
      .click();
    await notice("备份已恢复");
    const afterRestore = await snapshot();
    await page.goto(base + "#finance");
    await openReport();
    await assertStats(350, 200, 150, 1);
    assert.equal(await records().count(), 2);
    assert.equal(await records().filter({ hasText: "历史累计" }).count(), 2);
    assert.equal(await records().filter({ hasText: "逐笔付款" }).count(), 0);
    assert.doesNotMatch(
      await report().innerText(),
      /2\s*笔/,
      "两项历史累计不能表示两笔实际转账",
    );
    await page.getByLabel("统计月份", { exact: true }).fill("2026-09");
    await assertStats(0, 0, 0, 0);
    assert.deepEqual(await snapshot(), afterRestore);
  });

  await scenario("从付款报表登记本月尾款后记录和汇总即时更新", async () => {
    await seed();
    await openReport();
    const before = await snapshot();
    await records()
      .filter({ hasText: crossing.title })
      .first()
      .getByRole("button", { name: "查看派单：" + crossing.title, exact: true })
      .click();
    await page.getByRole("button", { name: "登记付款", exact: true }).click();
    await page.getByLabel("付款类型").selectOption("settlement");
    await page.getByLabel("本次付款金额").fill("30");
    await page.getByLabel("付款日期").fill("2026-10-08");
    await page.getByLabel("本次付款备注").fill("报表实时更新验收");
    await page.getByRole("button", { name: "确认登记", exact: true }).click();
    await notice("派单已保存");
    const detail = page.getByRole("dialog", { name: "派单详情", exact: true });
    if (await detail.count())
      await detail.getByRole("button", { name: "关闭", exact: true }).click();
    await assertStats(1090, 630, 460, 3);
    assert.equal(await records().count(), 7);
    await assertRecord("2026-10-08", 30, "逐笔付款");
    assert.match(await records().first().innerText(), /报表实时更新验收/);
    const saved = JSON.parse(await raw(keys.personal)).orders.find(
      (order) => order.id === crossing.id,
    );
    assert.equal(saved.settlementPaid, 550);
    assert.equal(saved.paymentLedger.entries.length, 5);
    for (const key of [keys.demo, keys.personalMeta, keys.demoMeta])
      assert.equal(await raw(key), before[key]);
  });

  await scenario("付款列表分页100条且CSV导出完整103条筛选结果", async () => {
    await seed();
    let bulk = {
      ...unpaid,
      id: "payment-bulk",
      title: "批量付款验收订单",
      amount: 2000,
    };
    for (let index = 1; index <= 103; index++) {
      bulk = recordPayment(bulk, {
        kind: "settlement",
        amount: 1,
        date: "2026-10-05",
        note: `批量付款第${index}条`,
      });
    }
    const largeData = validateBackup({ ...fixture, orders: [bulk] });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: keys.personal,
      value: JSON.stringify(largeData),
    });
    await page.reload({ waitUntil: "networkidle" });
    const before = await snapshot();
    await openReport();
    await assertStats(103, 0, 103, 1);
    assert.equal(await records().count(), 100);
    const csv = await downloadCSV();
    assert.equal(csv.length, 104);
    const amountIndex = csv[0].findIndex((heading) => /本条金额/.test(heading));
    assert.ok(amountIndex >= 0);
    assert.equal(
      csv.slice(1).reduce((sum, row) => sum + numeric(row[amountIndex]), 0),
      103,
    );
    await dismissToast();
    await report()
      .getByRole("button", { name: "显示更多付款", exact: true })
      .click();
    assert.equal(await records().count(), 103);
    await page.getByLabel("搜索付款记录", { exact: true }).fill("第103条");
    await assertStats(1, 0, 1, 1);
    assert.equal(await records().count(), 1);
    assert.deepEqual(await snapshot(), before);
  });

  await scenario(
    "1512/390/360报表与筛选无横向溢出，关键操作触控尺寸不少于44px",
    async () => {
      for (const width of [1512, 390, 360]) {
        await page.setViewportSize({
          width,
          height: width === 1512 ? 1120 : 844,
        });
        await seed();
        await openReport();
        await assertStats(1060, 630, 430, 3);
        const searchBox = await report().locator(".search-field").boundingBox();
        assert.ok(searchBox && searchBox.height >= 44, "搜索容器应至少44px");
        for (const target of [
          page.getByRole("button", { name: "按拍摄月份", exact: true }),
          page.getByRole("button", { name: "按付款月份", exact: true }),
          page.getByLabel("付款伙伴", { exact: true }),
          page.getByLabel("款项类型", { exact: true }),
          page.getByLabel("搜索付款记录", { exact: true }),
          report().getByRole("button", { name: "导出付款明细", exact: true }),
          records()
            .first()
            .getByRole("button", { name: /^查看派单：/ }),
        ]) {
          await target.scrollIntoViewIfNeeded();
          const box = await target.boundingBox();
          assert.ok(
            box && box.height >= 44 && box.width >= 44,
            "筛选和操作按钮应至少44px",
          );
          assert.ok(box.x >= -1 && box.x + box.width <= width + 1);
        }
        await dismissToast();
        await page.evaluate(() => window.scrollTo(0, 0));
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        assert.equal(
          await report().evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
          false,
        );
        const path = resolve("test-results", `payment-report-${width}.png`);
        await page.screenshot({
          path,
          fullPage: width === 1512,
          animations: "disabled",
        });
        console.log("SCREENSHOT: " + path);
        if (width === 390) {
          await records().first().scrollIntoViewIfNeeded();
          const recordsPath = resolve(
            "test-results",
            "payment-report-390-records.png",
          );
          await page.screenshot({ path: recordsPath, animations: "disabled" });
          console.log("SCREENSHOT: " + recordsPath);
        }
      }
    },
  );

  await scenario("360px长主题与大额有效付款不挤出统计卡或付款行", async () => {
    await page.setViewportSize({ width: 360, height: 844 });
    await seed();
    const bigOrder = {
      ...unpaid,
      id: "payment-big-1",
      title: "特别长的摄影主题用于手机窄屏金额排版核对".repeat(8),
      amount: 100000000,
      travelAmount: 100000000,
      depositRequired: 0,
      settlementPaid: 200000000,
      settlementDate: "2026-10-05",
    };
    const second = {
      ...bigOrder,
      id: "payment-big-2",
      title: "第二场大额付款",
      partnerId: rejected.partnerId,
    };
    const bigData = validateBackup({ ...fixture, orders: [bigOrder, second] });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: keys.personal,
      value: JSON.stringify(bigData),
    });
    await page.reload({ waitUntil: "networkidle" });
    const before = await snapshot();
    await openReport();
    await assertStats(400000000, 0, 400000000, 2);
    assert.equal(await records().count(), 2);
    for (const target of [
      report(),
      ...(await report()
        .locator(
          ".payment-report-stat, .payment-record, .payment-record-amount",
        )
        .all()),
    ]) {
      assert.equal(
        await target.evaluate(
          (element) => element.scrollWidth > element.clientWidth + 1,
        ),
        false,
        "大额内容不应溢出容器",
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    const path = resolve("test-results", "payment-report-360-large.png");
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    console.log("SCREENSHOT: " + path);
    assert.deepEqual(await snapshot(), before);
  });

  assert.deepEqual(errors, [], "页面不应出现未捕获异常");
  console.log(
    `PASS: ${checks.length} payment-report scenarios; no uncaught page errors.`,
  );
} finally {
  await browser.close();
}
