import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  demoData,
  emptyData,
  recordPayment,
  voidPayment,
  validateBackup,
} from "../src/domain.mjs";

const base = (process.env.QA_BASE_URL || "http://127.0.0.1:5188/").split(
  "#",
)[0];
const prefix = "shiguang-photo-v1-";
const keys = {
  personal: prefix + "personal",
  demo: prefix + "demo",
  personalMeta: prefix + "backup-personal",
  demoMeta: prefix + "backup-demo",
  mode: prefix + "mode",
};
const now = "2026-10-08T04:00:00.000Z";
const exportedAt = "2026-10-07T03:24:00.000Z";
const originalMeta = {
  lastExportedAt: exportedAt,
  lastRestoredAt: "",
  snoozedUntil: "",
};
const current = demoData("2026-10-08");
current.partners = current.partners.slice(0, 2);
current.venues = current.venues.slice(0, 1);
current.orders = [
  {
    ...current.orders[0],
    id: "preview-current",
    title: "原空间中应保持不变的拍摄",
    shootDate: "2026-10-09",
    amount: 600,
    travelAmount: 40,
    depositRequired: 200,
    depositPaid: 100,
    depositDate: "2026-10-01",
    settlementPaid: 100,
    settlementDate: "2026-10-02",
  },
];
const incoming = demoData("2026-10-08");
let ledgerOrder = {
  ...incoming.orders[0],
  id: "preview-ledger",
  title: "包含历史累计和逐笔流水的备份订单",
  shootDate: "2026-10-01",
  amount: 800,
  travelAmount: 120,
  travelNote: "往返车费，不重复计入拍摄费",
  depositRequired: 300,
  depositPaid: 200,
  depositDate: "2026-09-25",
  settlementPaid: 100,
  settlementDate: "2026-10-01",
};
ledgerOrder = recordPayment(ledgerOrder, {
  kind: "deposit",
  amount: 50,
  date: "2026-09-26",
  note: "补付定金",
});
ledgerOrder = recordPayment(ledgerOrder, {
  kind: "settlement",
  amount: 100,
  date: "2026-10-02",
  note: "已支付尾款",
});
ledgerOrder = recordPayment(ledgerOrder, {
  kind: "settlement",
  amount: 25,
  date: "2026-10-03",
  note: "随后撤销的错误付款",
});
ledgerOrder = voidPayment(
  ledgerOrder,
  ledgerOrder.paymentLedger.entries.at(-1).id,
  "错误付款不参与汇总",
);
incoming.orders = [
  ledgerOrder,
  {
    ...incoming.orders[1],
    id: "preview-cancelled",
    title: "取消后仍有待结款与车费的备份订单",
    shootDate: "2026-10-21",
    amount: 300,
    travelAmount: 30,
    depositRequired: 100,
    depositPaid: 0,
    depositDate: "",
    settlementPaid: 50,
    settlementDate: "2026-10-01",
    dispatchStatus: "已取消",
    executionStatus: "已取消",
  },
];
const incomingFile = { ...incoming, exportedAt, space: "demo" };
const expectedCurrent = {
  拍摄费: 600,
  报销车费: 40,
  应付合计: 640,
  已付定金: 100,
  已付尾款: 100,
  已付合计: 200,
  待结金额: 440,
  待结订单: 1,
  订单数量: 1,
  合作伙伴: 2,
  常用场地: 1,
};
const expectedIncoming = {
  拍摄费: 1100,
  报销车费: 150,
  应付合计: 1250,
  已付定金: 250,
  已付尾款: 250,
  已付合计: 500,
  待结金额: 750,
  待结订单: 2,
  订单数量: 2,
  合作伙伴: 4,
  常用场地: 3,
};
const errors = [];
const checks = [];
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

async function seed(
  page,
  { mode = "personal", rawCurrent, overrides = {} } = {},
) {
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
        [keys.personal]: JSON.stringify(current),
        [keys.demo]: JSON.stringify(current),
        [keys.personalMeta]: JSON.stringify(originalMeta),
        [keys.demoMeta]: JSON.stringify(originalMeta),
        ...(rawCurrent !== undefined ? { [keys[mode]]: rawCurrent } : {}),
        ...overrides,
      },
    },
  );
  await page.goto(base + "#settings");
  await page.reload({ waitUntil: "networkidle" });
}

const raw = (page, key) =>
  page.evaluate((key) => localStorage.getItem(key), key);
const snapshot = (page) =>
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
const dialog = (page) =>
  page.getByRole("dialog", { name: "恢复备份", exact: true });
const comparison = (page) =>
  dialog(page).getByRole("table", { name: "备份与当前空间对比", exact: true });
const notice = (page, text) =>
  page.getByRole("status").filter({ hasText: text }).waitFor();

async function selectFile(
  page,
  data = incomingFile,
  name = "拾光派单完整备份.json",
) {
  await page.locator("input[type=file]").setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)),
  });
}

async function preview(page, data = incomingFile, name) {
  await selectFile(page, data, name);
  await comparison(page).waitFor();
}

async function cells(page, label) {
  const row = comparison(page)
    .getByRole("row")
    .filter({ has: page.getByText(label, { exact: true }) });
  const values = await row.locator("th, td").allTextContents();
  assert.equal(values.length, 3, label + "应有项目、当前空间、备份文件三列");
  return values.map((value) => value.trim());
}

async function assertTotals(
  page,
  currentExpected = expectedCurrent,
  incomingExpected = expectedIncoming,
) {
  for (const [label, expected] of Object.entries(incomingExpected)) {
    const values = await cells(page, label);
    const numeric = (text) => Number(text.replace(/[^\d.-]/g, ""));
    assert.equal(numeric(values[2]), expected, "备份文件 " + label);
    if (currentExpected)
      assert.equal(
        numeric(values[1]),
        currentExpected[label],
        "当前空间 " + label,
      );
  }
}

async function confirm(page) {
  await dialog(page)
    .getByRole("button", { name: "确认恢复", exact: true })
    .click();
  await notice(page, "备份已恢复");
  await dialog(page).waitFor({ state: "hidden" });
}

async function scenario(name, run) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1120 },
    timezoneId: "Asia/Shanghai",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  try {
    await run(page, context);
    checks.push(name);
    console.log("PASS: " + name);
  } catch (error) {
    console.error("FAIL: " + name + ": " + error.message);
    throw new Error(name + ": " + error.message, { cause: error });
  } finally {
    await context.close();
  }
}

try {
  await scenario(
    "预览和取消只读，取消单车费与付款流水按当前累计准确核对",
    async (page) => {
      await seed(page);
      const before = await snapshot(page);
      await preview(page);
      assert.deepEqual(
        await comparison(page).locator("thead th").allTextContents(),
        ["核对项目", "当前个人空间", "备份文件"],
      );
      await assertTotals(page);
      assert.match((await cells(page, "拍摄日期范围"))[1], /2026-10-09/);
      const dateRange = (await cells(page, "拍摄日期范围"))[2];
      assert.match(dateRange, /2026-10-01/);
      assert.match(dateRange, /2026-10-21/);
      const information = await dialog(page).innerText();
      for (const term of [
        "拾光派单完整备份.json",
        "版本",
        "导出时间",
        "演示空间",
      ])
        assert.ok(information.includes(term), "应显示文件信息 " + term);
      assert.match(information, /2026/);
      assert.deepEqual(
        await snapshot(page),
        before,
        "打开预览不能写业务或备份元数据",
      );
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
      await dialog(page).waitFor({ state: "hidden" });
      assert.deepEqual(await snapshot(page), before, "取消预览不修改任何存储");
    },
  );

  for (const mode of ["personal", "demo"]) {
    await scenario(
      "确认恢复仅替换当前" + mode + "空间，记录恢复时间并保留另一空间",
      async (page) => {
        await seed(page, { mode });
        const before = await snapshot(page);
        await preview(page);
        await comparison(page)
          .getByRole("columnheader", {
            name: mode === "personal" ? "当前个人空间" : "当前演示空间",
            exact: true,
          })
          .waitFor();
        await confirm(page);
        assert.deepEqual(
          JSON.parse(await raw(page, keys[mode])),
          validateBackup(incoming),
        );
        const other = mode === "personal" ? "demo" : "personal";
        assert.equal(await raw(page, keys[other]), before[keys[other]]);
        assert.equal(
          await raw(page, keys[other + "Meta"]),
          before[keys[other + "Meta"]],
        );
        const metadata = JSON.parse(await raw(page, keys[mode + "Meta"]));
        assert.equal(metadata.lastRestoredAt, now);
        assert.equal(metadata.lastExportedAt, exportedAt);
        assert.equal(metadata.snoozedUntil, "");
        assert.equal(await raw(page, keys.mode), mode);
        await page.reload({ waitUntil: "networkidle" });
        assert.deepEqual(
          JSON.parse(await raw(page, keys[mode])).orders,
          incoming.orders,
        );
      },
    );
  }

  await scenario(
    "预览从最新原始存储计算当前列，不受页面旧状态影响",
    async (page) => {
      await seed(page);
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: keys.personal, value: JSON.stringify(incoming) },
      );
      const before = await snapshot(page);
      await preview(page);
      await assertTotals(page, expectedIncoming);
      assert.deepEqual(await snapshot(page), before);
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
      assert.deepEqual(await snapshot(page), before);
    },
  );

  await scenario(
    "确认前同页原始存储变动时关闭预览并拒绝覆盖新值",
    async (page) => {
      await seed(page);
      await preview(page);
      const newer = structuredClone(current);
      newer.orders[0].title = "预览后写入且不得覆盖的新订单内容";
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: keys.personal, value: JSON.stringify(newer) },
      );
      const afterChange = await snapshot(page);
      await dialog(page)
        .getByRole("button", { name: "确认恢复", exact: true })
        .click();
      await notice(page, "当前空间数据已变化，请重新选择备份核对");
      await dialog(page).waitFor({ state: "hidden" });
      assert.deepEqual(
        await snapshot(page),
        afterChange,
        "拒绝旧预览不能覆写新业务或更新恢复时间",
      );
      await preview(page);
      await confirm(page);
      assert.deepEqual(
        JSON.parse(await raw(page, keys.personal)),
        validateBackup(incoming),
      );
    },
  );

  await scenario(
    "版本1备份仍可预览和恢复，缺少车费字段按零补齐",
    async (page) => {
      await seed(page);
      const legacy = structuredClone(current);
      legacy.version = 1;
      delete legacy.orders[0].travelAmount;
      delete legacy.orders[0].travelNote;
      await preview(page, legacy, "旧版本1备份.json");
      await assertTotals(page, expectedCurrent, {
        ...expectedCurrent,
        报销车费: 0,
        应付合计: 600,
        待结金额: 400,
      });
      assert.match(await dialog(page).innerText(), /版本[\s\S]*1/);
      await confirm(page);
      const restored = JSON.parse(await raw(page, keys.personal));
      assert.equal(restored.version, 2);
      assert.equal(restored.orders[0].travelAmount, 0);
      assert.equal(restored.orders[0].travelNote, "");
    },
  );

  await scenario(
    "本机业务损坏时当前汇总无法读取，仍能恢复有效备份",
    async (page) => {
      const damaged = '{"orders": ["必须保留到确认恢复的原文"';
      await seed(page, { rawCurrent: damaged });
      const before = await snapshot(page);
      await preview(page);
      await assertTotals(page, null);
      assert.match((await cells(page, "应付合计"))[1], /无法读取/);
      assert.match((await cells(page, "订单数量"))[1], /无法读取/);
      assert.deepEqual(await snapshot(page), before);
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
      assert.equal(await raw(page, keys.personal), damaged);
      await preview(page);
      await confirm(page);
      assert.deepEqual(
        JSON.parse(await raw(page, keys.personal)),
        validateBackup(incoming),
      );
    },
  );

  await scenario(
    "预览前业务原文被删除时显示无法读取，取消保留页面记录且仍可明确恢复",
    async (page) => {
      await seed(page);
      await page.evaluate((key) => localStorage.removeItem(key), keys.personal);
      const before = await snapshot(page);
      await preview(page);
      assert.match((await cells(page, "订单数量"))[1], /无法读取/);
      assert.match((await cells(page, "应付合计"))[1], /无法读取/);
      await assertTotals(page, null);
      assert.deepEqual(await snapshot(page), before);
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
      assert.equal(await raw(page, keys.personal), null);
      assert.match(
        await page.locator(".storage-facts").innerText(),
        /1\s*场订单/,
      );
      await preview(page);
      await confirm(page);
      assert.deepEqual(
        JSON.parse(await raw(page, keys.personal)),
        validateBackup(incoming),
      );
    },
  );

  await scenario(
    "首次空个人空间没有业务存储时当前汇总为零，可正常核对后恢复",
    async (page) => {
      await seed(page, { rawCurrent: JSON.stringify(emptyData()) });
      await page.evaluate((key) => localStorage.removeItem(key), keys.personal);
      await page.reload({ waitUntil: "networkidle" });
      const before = await snapshot(page);
      await preview(page);
      await assertTotals(
        page,
        Object.fromEntries(Object.keys(expectedCurrent).map((key) => [key, 0])),
      );
      assert.doesNotMatch((await cells(page, "订单数量"))[1], /无法读取/);
      assert.deepEqual(await snapshot(page), before);
      await confirm(page);
      assert.deepEqual(
        JSON.parse(await raw(page, keys.personal)),
        validateBackup(incoming),
      );
    },
  );

  await scenario(
    "空备份明确提醒清空风险，取消后完整保留当前数据",
    async (page) => {
      await seed(page);
      const before = await snapshot(page);
      await preview(page, emptyData(), "空备份.json");
      await assertTotals(
        page,
        expectedCurrent,
        Object.fromEntries(
          Object.keys(expectedIncoming).map((key) => [key, 0]),
        ),
      );
      assert.match(await dialog(page).innerText(), /空备份|清空/);
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
      assert.deepEqual(await snapshot(page), before);
    },
  );

  await scenario(
    "无效JSON、版本、关联和流水备份保持原校验且不打开预览",
    async (page) => {
      const invalidVersion = { ...incomingFile, version: 999 };
      const invalidPartner = structuredClone(incomingFile);
      invalidPartner.orders[0].partnerId = "missing-partner";
      const invalidLedger = structuredClone(incomingFile);
      invalidLedger.orders[0].depositPaid += 1;
      for (const invalid of [
        "{bad json",
        invalidVersion,
        invalidPartner,
        invalidLedger,
      ]) {
        await seed(page);
        const before = await snapshot(page);
        await selectFile(page, invalid, "损坏的备份.json");
        await notice(page, "导入失败");
        assert.equal(await dialog(page).count(), 0);
        assert.deepEqual(await snapshot(page), before);
      }
    },
  );

  await scenario(
    "长文件名与大金额在桌面、390和360像素预览均无横向溢出",
    async (page) => {
      await seed(page);
      const large = structuredClone(current);
      large.orders[0].amount = 100000000;
      large.orders[0].travelAmount = 99999999.99;
      const filename =
        "重庆摄影团队-十月婚礼与品牌活动-包含已取消订单和逐笔付款记录-跨设备完整备份-请核对金额与日期-2026-10-07.json";
      await preview(
        page,
        { ...large, exportedAt, space: "personal" },
        filename,
      );
      assert.ok((await dialog(page).innerText()).includes(filename));
      assert.equal(
        Number((await cells(page, "应付合计"))[2].replace(/[^\d.-]/g, "")),
        199999999.99,
      );
      const closeToast = page.getByRole("button", {
        name: "关闭提示",
        exact: true,
      });
      if (await closeToast.count()) await closeToast.click();
      for (const width of [1512, 390, 360]) {
        await page.setViewportSize({
          width,
          height: width === 1512 ? 1120 : 844,
        });
        await dialog(page).evaluate((element) => {
          element.scrollTop = 0;
        });
        const box = await dialog(page).boundingBox();
        assert.ok(
          box.x >= -1 && box.x + box.width <= width + 1,
          "预览框应在视口内",
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        assert.equal(
          await dialog(page).evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
          false,
          `${width}px预览框不应横向溢出`,
        );
        assert.equal(
          await comparison(page).evaluate(
            (element) => element.scrollWidth > element.clientWidth,
          ),
          false,
          `${width}px核对表不应横向溢出`,
        );
        const path = resolve("test-results", `import-preview-${width}.png`);
        await page.screenshot({ path, animations: "disabled" });
        console.log("SCREENSHOT: " + path);
      }
      await dialog(page)
        .getByRole("button", { name: "取消", exact: true })
        .click();
    },
  );

  assert.deepEqual(errors, [], "页面不应出现未捕获异常");
  console.log(
    `PASS: ${checks.length} import-preview scenarios; no uncaught page errors.`,
  );
} finally {
  await browser.close();
}
