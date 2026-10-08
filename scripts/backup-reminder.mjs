import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  demoData,
  emptyData,
  recordPayment,
  validateBackup,
} from "../src/domain.mjs";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:5188/";
const prefix = "shiguang-photo-v1-";
const personalKey = prefix + "personal";
const personalMetaKey = prefix + "backup-personal";
const demoKey = prefix + "demo";
const demoMetaKey = prefix + "backup-demo";
const now = Date.parse("2026-10-08T04:00:00.000Z"); // Beijing, October 8 at noon.
const day = 24 * 60 * 60 * 1000;
const iso = (time) => new Date(time).toISOString();
const meta = (overrides = {}) => ({
  lastExportedAt: "",
  lastRestoredAt: "",
  snoozedUntil: "",
  ...overrides,
});
const fixture = demoData("2026-10-08");
fixture.orders = [
  recordPayment(
    {
      ...fixture.orders[0],
      id: "backup-reminder-order",
      title: "备份验收婚礼",
      amount: 1800,
      travelAmount: 120,
      travelNote: "需随备份保留的往返车费",
      depositRequired: 500,
      depositPaid: 0,
      depositDate: "",
      settlementPaid: 0,
      settlementDate: "",
      note: "需随备份保留的拍摄备注",
      paymentNote: "需随备份保留的付款备注",
    },
    {
      kind: "deposit",
      amount: 200,
      date: "2026-10-08",
      note: "需随备份保留的单笔流水",
    },
  ),
];
const business = validateBackup(fixture);
const errors = [];
const checks = [];
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_CHANNEL
    ? { channel: process.env.QA_BROWSER_CHANNEL }
    : {}),
});

async function newPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(now));
  return page;
}

async function seed(page, values = {}, route = "overview") {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ prefix, values }) => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      }
      for (const [key, value] of Object.entries(values)) {
        localStorage.setItem(key, value);
      }
    },
    {
      prefix,
      values: {
        [prefix + "mode"]: "personal",
        [personalKey]: JSON.stringify(business),
        ...values,
      },
    },
  );
  await page.goto(base.split("#")[0] + "#" + route);
  await page.reload({ waitUntil: "networkidle" });
}

const raw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const readMeta = async (page, key = personalMetaKey) =>
  JSON.parse(await raw(page, key));
const reminder = (page) =>
  page.getByRole("region", { name: "备份提醒", exact: true });
const notice = (page, text) =>
  page.getByRole("status").filter({ hasText: text }).waitFor();
const settings = (page) =>
  page.getByRole("button", { name: "我的", exact: true }).click();
const overview = async (page) => {
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "业务概览", exact: true }).click();
};

async function advance(page, time) {
  await page.clock.setFixedTime(new Date(time));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

async function exportBackup(page) {
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整备份", exact: true }).click();
  const download = await downloading;
  assert.equal(await download.failure(), null, "完整备份下载应成功发起");
  const payload = JSON.parse(readFileSync(await download.path(), "utf8"));
  await notice(page, "已发起备份下载");
  return payload;
}

async function screenshot(page, name) {
  const closeToast = page.getByRole("button", {
    name: "关闭提示",
    exact: true,
  });
  if (await closeToast.count()) await closeToast.click();
  const path = resolve("test-results", name + ".png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  console.log("SCREENSHOT: " + path);
}

function assertPayload(payload, expected, space = "personal") {
  assert.deepEqual(validateBackup(payload), validateBackup(expected));
  assert.equal(payload.space, space);
  assert.equal(payload.exportedAt, iso(now));
  assert.deepEqual(
    Object.keys(payload).sort(),
    [
      "version",
      "orders",
      "partners",
      "venues",
      "settings",
      "exportedAt",
      "space",
    ].sort(),
    "下载文件只包含业务数据和导出标识，不包含提醒元数据",
  );
  for (const key of ["lastExportedAt", "lastRestoredAt", "snoozedUntil"]) {
    assert.equal(JSON.stringify(payload).includes('"' + key + '"'), false);
  }
}

async function scenario(name, run) {
  // A fresh context owns every record in this scenario; no real browser profile is used.
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1120 },
    acceptDownloads: true,
    timezoneId: "Asia/Shanghai",
  });
  const page = await newPage(context);
  try {
    await run(page, context);
    checks.push(name);
    console.log("PASS: " + name);
  } catch (error) {
    throw new Error(name + ": " + error.message, { cause: error });
  } finally {
    await context.close();
  }
}

try {
  await scenario(
    "空个人空间不提醒，伙伴或场地本身也属于待备份数据",
    async (page) => {
      await seed(page, { [personalKey]: JSON.stringify(emptyData()) });
      await reminder(page).waitFor({ state: "hidden" });
      await settings(page);
      assert.match(
        await page.getByLabel("备份记录", { exact: true }).innerText(),
        /还没有需要备份/,
      );
      for (const kind of ["partners", "venues"]) {
        const data = emptyData();
        data[kind] = business[kind];
        await seed(page, { [personalKey]: JSON.stringify(data) });
        await reminder(page).waitFor();
        assert.match(
          await reminder(page).innerText(),
          /本机尚无完整备份导出记录/,
        );
      }
    },
  );

  await scenario("演示不提醒，导出只更新演示元数据", async (page) => {
    const personalMeta = JSON.stringify(
      meta({ lastExportedAt: iso(now - 8 * day) }),
    );
    await seed(page, {
      [prefix + "mode"]: "demo",
      [demoKey]: JSON.stringify(business),
      [personalMetaKey]: personalMeta,
    });
    await reminder(page).waitFor({ state: "hidden" });
    await settings(page);
    assert.match(
      await page.getByLabel("备份记录", { exact: true }).innerText(),
      /当前为演示空间/,
    );
    assertPayload(await exportBackup(page), business, "demo");
    assert.equal((await readMeta(page, demoMetaKey)).lastExportedAt, iso(now));
    assert.equal(await raw(page, personalMetaKey), personalMeta);
    assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
    await overview(page);
    await reminder(page).waitFor({ state: "hidden" });
  });

  await scenario(
    "首次提醒可暂缓，刷新保持且北京时间次日重新出现",
    async (page) => {
      await seed(page);
      await reminder(page).waitFor();
      await reminder(page)
        .getByRole("button", { name: "明天提醒", exact: true })
        .click();
      await reminder(page).waitFor({ state: "hidden" });
      const snoozed = await readMeta(page);
      assert.equal(snoozed.snoozedUntil, "2026-10-08T16:00:00.000Z");
      assert.equal(snoozed.lastExportedAt, "");
      assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
      await page.reload({ waitUntil: "networkidle" });
      await reminder(page).waitFor({ state: "hidden" });
      await settings(page);
      assert.match(
        await page.getByLabel("备份记录", { exact: true }).innerText(),
        /已暂缓至/,
      );
      await overview(page);
      await advance(page, Date.parse(snoozed.snoozedUntil) - 1);
      await reminder(page).waitFor({ state: "hidden" });
      await advance(page, Date.parse(snoozed.snoozedUntil));
      await reminder(page).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      await reminder(page).waitFor();
    },
  );

  await scenario(
    "完整导出保留付款流水且刷新记住时间，满七天再提醒",
    async (page) => {
      await seed(page);
      await reminder(page).waitFor();
      await screenshot(page, "backup-reminder-desktop");
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: 844 });
        await reminder(page).scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `备份提醒在 ${width}px 宽度不应导致页面横向溢出`,
        );
        await screenshot(page, "backup-reminder-" + width);
      }
      await page.setViewportSize({ width: 1512, height: 1120 });
      const payload = await exportBackup(page);
      assertPayload(payload, business);
      assert.deepEqual(
        payload.orders[0].paymentLedger,
        business.orders[0].paymentLedger,
      );
      assert.deepEqual(
        await readMeta(page),
        meta({ lastExportedAt: iso(now) }),
      );
      assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
      await reminder(page).waitFor({ state: "hidden" });
      await page.reload({ waitUntil: "networkidle" });
      await reminder(page).waitFor({ state: "hidden" });
      await settings(page);
      const summary = await page
        .getByLabel("备份记录", { exact: true })
        .innerText();
      assert.match(summary, /近期已发起备份导出/);
      assert.doesNotMatch(summary, /本机暂无记录/);
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByLabel("备份记录", { exact: true })
        .scrollIntoViewIfNeeded();
      await screenshot(page, "backup-reminder-settings-390");
      await page.setViewportSize({ width: 1512, height: 1120 });
      await overview(page);
      await advance(page, now + 7 * day - 1);
      await reminder(page).waitFor({ state: "hidden" });
      await advance(page, now + 7 * day);
      await reminder(page).waitFor();
      assert.match(await reminder(page).innerText(), /距上次导出已满 7 天/);
    },
  );

  await scenario(
    "跨标签同步备份时间，不关闭另一标签的订单编辑草稿",
    async (page, context) => {
      await seed(page);
      const editing = await newPage(context);
      await editing.goto(base.split("#")[0] + "#orders", {
        waitUntil: "networkidle",
      });
      await editing
        .getByRole("button", { name: /备份验收婚礼/ })
        .first()
        .click();
      await editing
        .getByRole("button", { name: "编辑派单", exact: true })
        .click();
      await editing.getByLabel("拍摄主题").fill("另一标签未保存的主题");
      assertPayload(await exportBackup(page), business);
      await editing.waitForFunction(
        ({ key, stamp }) =>
          JSON.parse(localStorage.getItem(key) || "null")?.lastExportedAt ===
          stamp,
        { key: personalMetaKey, stamp: iso(now) },
      );
      await editing
        .getByRole("dialog", { name: "编辑派单", exact: true })
        .waitFor();
      assert.equal(
        await editing.getByLabel("拍摄主题").inputValue(),
        "另一标签未保存的主题",
      );
      assert.deepEqual(JSON.parse(await raw(editing, personalKey)), business);
      await editing.getByRole("button", { name: "取消", exact: true }).click();
      await overview(editing);
      await reminder(editing).waitFor({ state: "hidden" });
      await settings(editing);
      assert.match(
        await editing.getByLabel("备份记录", { exact: true }).innerText(),
        /近期已发起备份导出/,
      );
    },
  );

  await scenario(
    "恢复有效备份后提示重新导出，恢复成功提示保持兼容",
    async (page) => {
      const previousExport = iso(now - 60000);
      await seed(
        page,
        {
          [personalMetaKey]: JSON.stringify(
            meta({
              lastExportedAt: previousExport,
              snoozedUntil: iso(now + day),
            }),
          ),
        },
        "settings",
      );
      const restored = structuredClone(business);
      restored.orders[0].title = "恢复文件中的最新订单";
      await page.locator("input[type=file]").setInputFiles({
        name: "有效完整备份.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            ...restored,
            exportedAt: previousExport,
            space: "personal",
          }),
        ),
      });
      await page.getByRole("button", { name: "确认恢复", exact: true }).click();
      await notice(page, "备份已恢复");
      assert.deepEqual(JSON.parse(await raw(page, personalKey)), restored);
      const record = await readMeta(page);
      assert.equal(record.lastExportedAt, previousExport);
      assert.equal(record.lastRestoredAt, iso(now));
      assert.equal(record.snoozedUntil, "");
      await overview(page);
      await reminder(page).waitFor();
      assert.match(
        await reminder(page).innerText(),
        /恢复后的数据，建议重新备份/,
      );
      await page.reload({ waitUntil: "networkidle" });
      await reminder(page).waitFor();
      assertPayload(await exportBackup(page), restored);
      await reminder(page).waitFor({ state: "hidden" });
      assert.deepEqual(
        await readMeta(page),
        meta({ lastExportedAt: iso(now) }),
      );
    },
  );

  await scenario("损坏提醒元数据不影响现有业务数据与完整导出", async (page) => {
    await seed(page, { [personalMetaKey]: "{invalid metadata" });
    await reminder(page).waitFor();
    assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
    assertPayload(await exportBackup(page), business);
    assert.equal((await readMeta(page)).lastExportedAt, iso(now));
    assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
  });

  await scenario(
    "读取导入文件期间切换空间会取消旧恢复请求，两空间记录均保持不变",
    async (page) => {
      const demoBusiness = structuredClone(business);
      demoBusiness.orders[0].title = "应保持原样的演示订单";
      const stored = {
        [personalKey]: JSON.stringify(business),
        [demoKey]: JSON.stringify(demoBusiness),
        [personalMetaKey]: JSON.stringify(
          meta({ lastExportedAt: iso(now - day) }),
        ),
        [demoMetaKey]: JSON.stringify(
          meta({ lastExportedAt: iso(now - 2 * day) }),
        ),
      };
      await seed(page, stored, "settings");
      await page.evaluate(() => {
        window.backupQaOriginalFileText = File.prototype.text;
        File.prototype.text = async function () {
          const contents = await window.backupQaOriginalFileText.call(this);
          return new Promise((resolve) => {
            window.backupQaReleaseFile = () => resolve(contents);
          });
        };
      });
      try {
        const imported = structuredClone(business);
        imported.orders[0].title = "不应恢复到任何空间的延迟文件";
        await page.locator("input[type=file]").setInputFiles({
          name: "延迟读取的备份.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(imported)),
        });
        await page.waitForFunction(
          () => typeof window.backupQaReleaseFile === "function",
        );
        assert.equal(await page.getByRole("dialog").count(), 0);
        await page
          .getByRole("button", { name: "查看演示空间", exact: true })
          .click();
        await notice(page, "已切换到演示空间");
        await page.evaluate(() => window.backupQaReleaseFile());
        // Give the cancelled async handler a turn without relying on animation frames,
        // which a background or minimized headless Edge window may suspend.
        await page.waitForTimeout(150);
        assert.equal(
          await page.getByRole("dialog").count(),
          0,
          "旧文件读取完成后不应出现恢复确认框",
        );
        assert.equal(await raw(page, prefix + "mode"), "demo");
        for (const [key, value] of Object.entries(stored)) {
          assert.equal(
            await raw(page, key),
            value,
            "切换期间导入不得修改 " + key,
          );
        }
        assert.match(
          await page.getByLabel("备份记录", { exact: true }).innerText(),
          /当前为演示空间/,
        );
      } finally {
        await page.evaluate(() => {
          File.prototype.text = window.backupQaOriginalFileText;
          delete window.backupQaOriginalFileText;
          delete window.backupQaReleaseFile;
        });
      }
    },
  );

  await scenario("浏览器拒绝发起下载时不更新原导出记录", async (page) => {
    const originalMeta = JSON.stringify(
      meta({ lastExportedAt: iso(now - 8 * day) }),
    );
    await seed(page, { [personalMetaKey]: originalMeta });
    await page.evaluate(() => {
      window.backupQaOriginalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        throw new Error("QA simulated download rejection");
      };
    });
    try {
      await reminder(page)
        .getByRole("button", { name: "导出完整备份", exact: true })
        .click();
      await notice(page, "完整备份导出失败");
      assert.equal(await raw(page, personalMetaKey), originalMeta);
      assert.deepEqual(JSON.parse(await raw(page, personalKey)), business);
      await reminder(page).waitFor();
    } finally {
      await page.evaluate(() => {
        HTMLAnchorElement.prototype.click = window.backupQaOriginalAnchorClick;
        delete window.backupQaOriginalAnchorClick;
      });
    }
  });

  await scenario(
    "导出读取最新存储，未收到 storage 事件也包含最新订单与付款",
    async (page) => {
      await seed(page, {}, "settings");
      const latest = structuredClone(business);
      latest.orders[0] = recordPayment(latest.orders[0], {
        kind: "settlement",
        amount: 100,
        date: "2026-10-08",
        note: "导出前另一页面的新付款",
      });
      latest.orders.push({
        ...latest.orders[0],
        id: "newly-stored-order",
        title: "导出前刚写入的第二场订单",
      });
      // setItem in the current document deliberately does not dispatch a storage event.
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        {
          key: personalKey,
          value: JSON.stringify(latest),
        },
      );
      assert.match(
        await page.locator(".storage-facts").innerText(),
        /1\s*场订单/,
      );
      assertPayload(await exportBackup(page), latest);
      assert.match(
        await page.locator(".storage-facts").innerText(),
        /1\s*场订单/,
        "导出只读最新存储，不更新当前页面的业务状态",
      );
      assert.deepEqual(JSON.parse(await raw(page, personalKey)), latest);
    },
  );

  await scenario(
    "损坏业务原文导出失败，不创建元数据也不覆盖原文",
    async (page) => {
      await seed(page, {}, "settings");
      const broken = '{"orders": ["必须保留的损坏原文"';
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        {
          key: personalKey,
          value: broken,
        },
      );
      await page
        .getByRole("button", { name: "导出完整备份", exact: true })
        .click();
      await notice(page, "完整备份导出失败");
      assert.equal(await raw(page, personalMetaKey), null);
      assert.equal(await raw(page, personalKey), broken);
      await page.reload({ waitUntil: "networkidle" });
      await page
        .getByRole("alert")
        .filter({ hasText: "本地数据读取失败" })
        .waitFor();
      await page
        .getByRole("button", { name: "导出完整备份", exact: true })
        .click();
      await notice(page, "数据读取异常");
      assert.equal(await raw(page, personalMetaKey), null);
      assert.equal(await raw(page, personalKey), broken);
    },
  );

  for (const removed of [false, true]) {
    await scenario(
      removed
        ? "个人业务存储被删除时阻止导出，保留页面记录且不记导出时间"
        : "个人业务存储为空字符串时导出失败，保留页面记录和原文",
      async (page) => {
        await seed(page, {}, "settings");
        const downloads = [];
        page.on("download", (download) => downloads.push(download));
        await page.evaluate(
          ({ key, removed }) => {
            if (removed) localStorage.removeItem(key);
            else localStorage.setItem(key, "");
          },
          { key: personalKey, removed },
        );
        await page
          .getByRole("button", { name: "导出完整备份", exact: true })
          .click();
        await notice(
          page,
          removed ? "本地存储记录已被移除" : "完整备份导出失败",
        );
        assert.match(
          await page.locator(".storage-facts").innerText(),
          /1\s*场订单/,
        );
        assert.equal(await raw(page, personalMetaKey), null);
        assert.equal(await raw(page, personalKey), removed ? null : "");
        assert.equal(downloads.length, 0, "异常存储不能被导出为空业务文件");
      },
    );
  }

  assert.deepEqual(errors, [], "页面不应出现未捕获异常");
  console.log(
    `PASS: ${checks.length} backup-reminder scenarios; no uncaught page errors.`,
  );
} finally {
  await browser.close();
}
