import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { demoData, recordPayment, validateBackup } from "../src/domain.mjs";

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
const metadata = JSON.stringify({
  lastExportedAt: "2026-10-07T00:00:00.000Z",
  lastRestoredAt: "",
  snoozedUntil: "",
});
const initial = demoData("2026-10-08");
const source = recordPayment(
  {
    ...initial.orders[0],
    id: "storage-primary",
    title: "存储保护验收婚礼",
    shootDate: "2026-10-08",
    communicatedDate: "2026-09-21",
    amount: 800,
    travelAmount: 120,
    travelNote: "保留报销车费",
    depositRequired: 300,
    depositPaid: 200,
    depositDate: "2026-10-01",
    settlementPaid: 0,
    settlementDate: "",
    dispatchStatus: "待确认",
    executionStatus: "待拍摄",
  },
  {
    kind: "settlement",
    amount: 100,
    date: "2026-10-07",
    note: "不可丢失的已付尾款",
  },
);
const fixture = validateBackup({ ...initial, orders: [source] });
const other = validateBackup({
  ...initial,
  orders: [{ ...source, id: "storage-other", title: "另一空间的独立订单" }],
});
const checks = [],
  errors = [],
  downloads = [];
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
// All mutations affect this disposable context only, never an existing browser profile.
const context = await browser.newContext({
  viewport: { width: 1512, height: 1120 },
  timezoneId: "Asia/Shanghai",
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
page.on("download", (download) => downloads.push(download));
await page.clock.setFixedTime(new Date(now));
let peer;
const raw = (key = keys.personal) =>
  page.evaluate((key) => localStorage.getItem(key), key);
const dialog = (name) => page.getByRole("dialog", { name, exact: true });
const banner = () => page.locator(".storage-alert[role=alert]");
const notice = (text) =>
  page.getByRole("status").filter({ hasText: text }).waitFor();
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
async function seed({
  mode = "personal",
  value = JSON.stringify(fixture),
  data = fixture,
  route = "orders",
} = {}) {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ prefix, values }) => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(values))
        if (value !== null) localStorage.setItem(key, value);
    },
    {
      prefix,
      values: {
        [keys.mode]: mode,
        [keys.personal]: mode === "personal" ? value : JSON.stringify(other),
        [keys.demo]: mode === "demo" ? value : JSON.stringify(other),
        [keys.personalMeta]: metadata,
        [keys.demoMeta]: metadata,
      },
    },
  );
  await page.goto(base + "#" + route);
  await page.reload({ waitUntil: "networkidle" });
  return data;
}
async function changeRaw(value, target = page, key = keys.personal) {
  await target.evaluate(
    ({ key, value }) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    },
    { key, value },
  );
}
async function otherPage() {
  if (!peer) {
    peer = await context.newPage();
    peer.on("pageerror", (error) => errors.push(error.message));
    await peer.clock.setFixedTime(new Date(now));
    await peer.goto(base, { waitUntil: "networkidle" });
  }
  return peer;
}
async function openOrder(title = source.title) {
  await page
    .getByRole("button", { name: new RegExp(title) })
    .first()
    .click();
  await dialog("派单详情").waitFor();
}
async function editOrder(title = source.title) {
  await openOrder(title);
  await dialog("派单详情")
    .getByRole("button", { name: "编辑派单", exact: true })
    .click();
  await page.getByLabel("拍摄主题").waitFor();
}
async function closeDialog() {
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
}
async function dismissToast() {
  const button = page.getByRole("button", { name: "关闭提示", exact: true });
  if (await button.count()) await button.click();
}
async function blocked(expected, value, before, key = keys.personal) {
  await notice(expected);
  await banner().waitFor();
  assert.match(await banner().innerText(), expected);
  assert.equal(await raw(key), value, "异常原文不应被覆盖");
  for (const fixed of [
    keys.personalMeta,
    keys.demoMeta,
    key === keys.personal ? keys.demo : keys.personal,
  ]) {
    assert.equal(
      await raw(fixed),
      before[fixed],
      "不应更改另一个空间或备份时间",
    );
  }
}
async function downloadFrom(button) {
  const waiting = page.waitForEvent("download");
  await button.click();
  const download = await waiting;
  assert.equal(await download.failure(), null);
  return {
    bytes: readFileSync(await download.path()),
    name: download.suggestedFilename(),
  };
}
async function importFile(bytes) {
  await page.locator("input[type=file]").setInputFiles({
    name: "页面记录恢复验收.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await dialog("恢复备份").waitFor();
}
async function scenario(name, run) {
  if (process.env.QA_SCENARIO && !name.includes(process.env.QA_SCENARIO))
    return;
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
    "无事件删除、空字符串和损坏原文均阻止保存订单并保留表单草稿",
    async () => {
      for (const value of [null, "", "{broken-business-json"]) {
        await seed();
        const before = await snapshot();
        await editOrder();
        await page.getByLabel("拍摄主题").fill("尚未保存的婚礼草稿");
        await changeRaw(value);
        await page
          .getByRole("button", { name: "保存派单", exact: true })
          .click();
        await blocked(
          value === null ? /本地记录已被移除/ : /本地数据无法读取/,
          value,
          before,
        );
        assert.equal(
          await page.getByLabel("拍摄主题").inputValue(),
          "尚未保存的婚礼草稿",
        );
        await closeDialog();
        assert.equal(
          await page
            .locator(".table-title")
            .filter({ hasText: source.title })
            .count(),
          1,
        );
        assert.equal(
          await page
            .getByRole("button", { name: /尚未保存的婚礼草稿/ })
            .count(),
          0,
        );
      }
    },
  );

  await scenario(
    "付款、伙伴、场地、提醒开关、快捷状态和删除共用存储保护",
    async () => {
      const cases = [
        {
          route: "orders",
          value: null,
          setup: async () => {
            await openOrder();
            await page
              .getByRole("button", { name: "登记付款", exact: true })
              .click();
            await page.getByLabel("本次付款金额").fill("30");
            await page.getByLabel("付款日期").fill("2026-10-08");
            return {
              submit: page.getByRole("button", {
                name: "确认登记",
                exact: true,
              }),
              verify: async () =>
                assert.equal(
                  await page.getByLabel("本次付款金额").inputValue(),
                  "30",
                ),
            };
          },
        },
        {
          route: "partners",
          value: "",
          setup: async () => {
            await page
              .getByRole("button", { name: "添加伙伴", exact: true })
              .first()
              .click();
            await page.getByLabel("伙伴姓名").fill("不能丢失的伙伴草稿");
            return {
              submit: page.getByRole("button", {
                name: "保存伙伴",
                exact: true,
              }),
              verify: async () =>
                assert.equal(
                  await page.getByLabel("伙伴姓名").inputValue(),
                  "不能丢失的伙伴草稿",
                ),
            };
          },
        },
        {
          route: "venues",
          value: "{invalid",
          setup: async () => {
            await page
              .getByRole("button", { name: "添加场地", exact: true })
              .first()
              .click();
            await page.getByLabel("场地名称").fill("场地草稿保留");
            await page.getByLabel("展厅 / 宴会厅（每行一个）").fill("水晶厅");
            return {
              submit: page.getByRole("button", {
                name: "保存场地",
                exact: true,
              }),
              verify: async () =>
                assert.equal(
                  await page.getByLabel("场地名称").inputValue(),
                  "场地草稿保留",
                ),
            };
          },
        },
        {
          route: "settings",
          value: null,
          setup: async () => {
            const toggle = page.getByRole("switch", {
              name: "拍摄前 3 天提醒",
              exact: true,
            });
            const checked = await toggle.isChecked();
            return {
              submit: toggle,
              verify: async () =>
                assert.equal(await toggle.isChecked(), checked),
            };
          },
        },
        {
          route: "orders",
          value: "",
          setup: async () => {
            await openOrder();
            await dialog("派单详情")
              .getByRole("button", { name: "确认派单", exact: true })
              .click();
            return {
              submit: dialog("确认派单").getByRole("button", {
                name: "确认派单",
                exact: true,
              }),
              verify: async () =>
                assert.equal(await dialog("确认派单").count(), 1),
            };
          },
        },
        {
          route: "orders",
          value: null,
          setup: async () => {
            await openOrder();
            await page
              .getByRole("button", { name: "删除派单", exact: true })
              .click();
            return {
              submit: page.getByRole("button", {
                name: "移入回收站",
                exact: true,
              }),
              verify: async () =>
                assert.equal(
                  await page
                    .getByRole("button", { name: "移入回收站", exact: true })
                    .count(),
                  1,
                ),
            };
          },
        },
      ];
      for (const item of cases) {
        await seed({ route: item.route });
        const before = await snapshot();
        const form = await item.setup();
        await changeRaw(item.value);
        await form.submit.click();
        await blocked(
          item.value === null ? /本地记录已被移除/ : /本地数据无法读取/,
          item.value,
          before,
        );
        await form.verify();
      }
    },
  );

  await scenario(
    "其他标签removeItem和clear保留当前草稿，写入有效数据后自动恢复同步",
    async () => {
      for (const action of ["remove", "clear"]) {
        await seed();
        await editOrder();
        await page.getByLabel("拍摄主题").fill("跨标签仍保留的草稿");
        const writer = await otherPage();
        if (action === "clear")
          await writer.evaluate(() => localStorage.clear());
        else await changeRaw(null, writer);
        await notice(/本地记录已被移除/);
        await banner().waitFor();
        assert.equal(
          await page.getByLabel("拍摄主题").inputValue(),
          "跨标签仍保留的草稿",
        );
        assert.equal(await raw(), null);
        const fresh = validateBackup({
          ...fixture,
          orders: [{ ...source, title: "另一标签恢复的最新婚礼" }],
        });
        await changeRaw(JSON.stringify(fresh), writer);
        await notice(/另一标签页同步/);
        assert.equal(await page.locator("dialog[open]").count(), 0);
        assert.equal(await banner().count(), 0);
        await page
          .locator(".table-title")
          .filter({ hasText: "另一标签恢复的最新婚礼" })
          .waitFor();
        assert.deepEqual(JSON.parse(await raw()), fresh);
      }
    },
  );

  await scenario(
    "排队的旧storage事件按当前存储读取，有效数据清除错误并关闭旧弹窗",
    async () => {
      await seed();
      await editOrder();
      await page.getByLabel("拍摄主题").fill("旧弹窗草稿");
      await page.evaluate((key) => {
        localStorage.setItem(key, "");
        window.dispatchEvent(
          new StorageEvent("storage", {
            key,
            newValue: JSON.stringify({ harmless: "stale-event" }),
            storageArea: localStorage,
          }),
        );
      }, keys.personal);
      await notice(/本地数据无法读取/);
      assert.equal(
        await page.getByLabel("拍摄主题").inputValue(),
        "旧弹窗草稿",
      );
      const fresh = validateBackup({
        ...fixture,
        orders: [{ ...source, title: "当前存储中的真实最新订单" }],
      });
      await page.evaluate(
        ({ key, value }) => {
          localStorage.setItem(key, value);
          window.dispatchEvent(
            new StorageEvent("storage", {
              key,
              newValue: "{outdated-broken",
              storageArea: localStorage,
            }),
          );
        },
        { key: keys.personal, value: JSON.stringify(fresh) },
      );
      await notice(/另一标签页同步/);
      assert.equal(await banner().count(), 0);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      // The former form is now an independent draft; it must not overwrite the synced order.
      await page.goto(base + "#drafts", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "继续填写", exact: true }).click();
      await notice(/原订单已变化/);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      await page.getByRole("button", { name: "删除草稿", exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "删除草稿", exact: true })
        .click();
      await page.goto(base + "#orders", { waitUntil: "networkidle" });
      await editOrder("当前存储中的真实最新订单");
      await page.getByLabel("拍摄主题").fill("同步后可正常保存");
      await page.getByRole("button", { name: "保存派单", exact: true }).click();
      await notice("派单已保存");
      assert.equal(JSON.parse(await raw()).orders[0].title, "同步后可正常保存");
    },
  );

  await scenario(
    "首次空串载入无页面快照，可进入损坏目标空间恢复且保留当前空间原文",
    async () => {
      for (const mode of ["personal", "demo"]) {
        await seed({ mode, value: "", route: "settings" });
        await banner().waitFor();
        const recovery = page.getByRole("region", {
          name: "页面记录恢复",
          exact: true,
        });
        assert.equal(
          await recovery
            .getByRole("button", { name: "导出页面记录", exact: true })
            .isDisabled(),
          true,
        );
        assert.match(await recovery.innerText(), /尚未成功载入/);
        const before = await snapshot();
        const exported = await downloadFrom(
          page.getByRole("button", { name: "下载原始存储文件", exact: true }),
        );
        assert.equal(
          exported.bytes.length,
          0,
          "空字符串的原始下载必须保持0字节",
        );
        assert.deepEqual(await snapshot(), before);
      }
      await seed({ route: "settings" });
      const before = await snapshot();
      await changeRaw("", page, keys.demo);
      await page
        .getByRole("button", { name: "查看演示空间", exact: true })
        .click();
      await notice(/已进入目标空间的恢复页面/);
      assert.equal(await raw(keys.mode), "demo");
      assert.equal(await raw(), before[keys.personal]);
      assert.equal(await raw(keys.demo), "");
      assert.equal(
        await page
          .getByRole("button", { name: "导出页面记录", exact: true })
          .isDisabled(),
        true,
      );
      assert.match(
        await page.locator(".storage-facts").innerText(),
        /0\s*场订单/,
      );
      await page
        .getByRole("button", { name: "进入个人空间", exact: true })
        .last()
        .click();
      await notice(/已进入个人空间/);
      assert.equal(await raw(keys.mode), "personal");
      assert.equal(await banner().count(), 0);
      assert.match(
        await page.locator(".storage-facts").innerText(),
        /1\s*场订单/,
      );
    },
  );

  await scenario(
    "当前空间异常时阻止切换，保留页面中唯一已载入副本",
    async () => {
      for (const value of [null, "", "{invalid-current"]) {
        await seed({ route: "settings" });
        const before = await snapshot();
        await changeRaw(value);
        await page
          .getByRole("button", { name: "查看演示空间", exact: true })
          .click();
        await notice(/请先导出页面记录并恢复当前空间/);
        assert.equal(await raw(keys.mode), "personal");
        assert.equal(await raw(), value);
        assert.equal(await raw(keys.demo), before[keys.demo]);
        assert.equal(await raw(keys.personalMeta), before[keys.personalMeta]);
        await banner().waitFor();
        assert.match(
          await page.locator(".storage-facts").innerText(),
          /1\s*场订单/,
        );
        const recovery = page.getByRole("region", {
          name: "页面记录恢复",
          exact: true,
        });
        assert.equal(
          await recovery
            .getByRole("button", { name: "导出页面记录", exact: true })
            .isEnabled(),
          true,
        );
        const file = await downloadFrom(
          recovery.getByRole("button", { name: "导出页面记录", exact: true }),
        );
        assert.deepEqual(
          validateBackup(JSON.parse(file.bytes.toString("utf8"))),
          fixture,
        );
      }
    },
  );

  await scenario(
    "首次个人空空间和未保存演示允许保存，已保存空空间再被删除则拦截",
    async () => {
      for (const mode of ["personal", "demo"]) {
        await seed({ mode, value: null, route: "settings" });
        assert.equal(await banner().count(), 0);
        const toggle = page.getByRole("switch", {
          name: "拍摄前 3 天提醒",
          exact: true,
        });
        const checked = await toggle.isChecked();
        await toggle.click();
        const saved = JSON.parse(await raw(keys[mode]));
        assert.equal(saved.settings.before3, !checked);
        assert.equal(saved.orders.length > 0, mode === "demo");
        assert.equal(await banner().count(), 0);
        if (mode === "personal") {
          const before = await snapshot();
          await changeRaw(null);
          await toggle.click();
          await blocked(/本地记录已被移除/, null, before);
          assert.equal(await toggle.isChecked(), !checked);
        }
      }
    },
  );

  await scenario(
    "导出页面记录保留已载入付款而不含草稿，预览恢复后可再次保存",
    async () => {
      await seed();
      const before = await snapshot();
      await editOrder();
      await page.getByLabel("拍摄主题").fill("绝不能进入恢复文件的未保存草稿");
      await changeRaw("{damaged-original");
      await page.getByRole("button", { name: "保存派单", exact: true }).click();
      await blocked(/本地数据无法读取/, "{damaged-original", before);
      await closeDialog();
      await page.goto(base + "#settings");
      const exported = await downloadFrom(
        page
          .getByRole("region", { name: "页面记录恢复", exact: true })
          .getByRole("button", { name: "导出页面记录", exact: true }),
      );
      const recovered = JSON.parse(exported.bytes.toString("utf8"));
      assert.equal(recovered.recoverySource, "page");
      assert.equal(recovered.space, "personal");
      assert.equal(recovered.exportedAt, now);
      assert.deepEqual(validateBackup(recovered), fixture);
      assert.equal(recovered.orders[0].title, source.title);
      assert.equal(recovered.orders[0].settlementPaid, 100);
      assert.deepEqual(recovered.orders[0].paymentLedger, source.paymentLedger);
      assert.equal(await raw(), "{damaged-original");
      assert.equal(await raw(keys.personalMeta), before[keys.personalMeta]);
      await dismissToast();
      await importFile(exported.bytes);
      assert.match(await dialog("恢复备份").innerText(), /无法读取/);
      assert.equal(await raw(), "{damaged-original", "预览应保持只读");
      await dialog("恢复备份")
        .getByRole("button", { name: "确认恢复", exact: true })
        .click();
      await notice("备份已恢复");
      assert.equal(await banner().count(), 0);
      assert.deepEqual(JSON.parse(await raw()), fixture);
      const restoredMeta = JSON.parse(await raw(keys.personalMeta));
      assert.equal(
        restoredMeta.lastExportedAt,
        JSON.parse(metadata).lastExportedAt,
      );
      assert.equal(restoredMeta.lastRestoredAt, now);
      assert.equal(await raw(keys.demo), before[keys.demo]);
      assert.equal(await raw(keys.demoMeta), before[keys.demoMeta]);
      await page.goto(base + "#orders");
      await editOrder();
      await page.getByLabel("拍摄主题").fill("恢复后正常保存的派单");
      await page.getByRole("button", { name: "保存派单", exact: true }).click();
      await notice("派单已保存");
      assert.equal(
        JSON.parse(await raw()).orders[0].title,
        "恢复后正常保存的派单",
      );
    },
  );

  await scenario("恢复确认前无事件存储更新仍阻止覆盖最新记录", async () => {
    await seed({ route: "settings" });
    await importFile(Buffer.from(JSON.stringify(fixture)));
    const fresh = validateBackup({
      ...fixture,
      orders: [{ ...source, title: "恢复预览后新写入的记录" }],
    });
    await changeRaw(JSON.stringify(fresh));
    const before = await snapshot();
    await dialog("恢复备份")
      .getByRole("button", { name: "确认恢复", exact: true })
      .click();
    await notice(/当前空间数据已变化/);
    assert.equal(await dialog("恢复备份").count(), 0);
    assert.deepEqual(await snapshot(), before);
  });

  await scenario(
    "缺失原始记录不生成伪造文件，空串下载原文且不记完整备份时间",
    async () => {
      await seed({ route: "settings" });
      const before = await snapshot();
      await changeRaw(null);
      const count = downloads.length;
      await page
        .getByRole("button", { name: "下载原始存储文件", exact: true })
        .click();
      await notice("当前空间没有可下载的原始存储文件");
      assert.equal(downloads.length, count);
      assert.equal(await raw(), null);
      await changeRaw("");
      const file = await downloadFrom(
        page.getByRole("button", { name: "下载原始存储文件", exact: true }),
      );
      assert.equal(file.bytes.length, 0);
      assert.equal(await raw(), "");
      assert.equal(await raw(keys.personalMeta), before[keys.personalMeta]);
    },
  );

  await scenario(
    "1512/390/360存储警示及页面恢复区域无横向溢出且按钮至少44px",
    async () => {
      const sizeIssues = [];
      for (const width of [1512, 390, 360]) {
        await page.setViewportSize({
          width,
          height: width === 1512 ? 1120 : 844,
        });
        await seed({ route: "settings" });
        await changeRaw(null);
        await page
          .getByRole("switch", { name: "拍摄前 3 天提醒", exact: true })
          .click();
        await notice(/本地记录已被移除/);
        await dismissToast();
        const recovery = page.getByRole("region", {
          name: "页面记录恢复",
          exact: true,
        });
        for (const button of [
          recovery.getByRole("button", { name: "导出页面记录", exact: true }),
          page.getByRole("button", { name: "导入备份", exact: true }),
          page.getByRole("button", { name: "下载原始存储文件", exact: true }),
        ]) {
          await button.scrollIntoViewIfNeeded();
          const box = await button.boundingBox();
          if (!(box && box.height >= 44 && box.width >= 44))
            sizeIssues.push(
              `${width}px视口 ${await button.innerText()} 应至少44px，实际 ${JSON.stringify(box)}`,
            );
          assert.ok(box.x >= -1 && box.x + box.width <= width + 1);
        }
        for (const target of [banner(), recovery])
          assert.equal(
            await target.evaluate(
              (element) => element.scrollWidth > element.clientWidth + 1,
            ),
            false,
          );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        const topPath = resolve("test-results", `storage-guard-${width}.png`);
        await page.screenshot({
          path: topPath,
          fullPage: width === 1512,
          animations: "disabled",
        });
        console.log("SCREENSHOT: " + topPath);
        if (width !== 1512) {
          await recovery.scrollIntoViewIfNeeded();
          const recoveryPath = resolve(
            "test-results",
            `storage-guard-${width}-recovery.png`,
          );
          await page.screenshot({ path: recoveryPath, animations: "disabled" });
          console.log("SCREENSHOT: " + recoveryPath);
        }
      }
      assert.deepEqual(sizeIssues, [], "恢复操作按钮尺寸");
    },
  );
  assert.deepEqual(errors, [], "页面不应出现未捕获异常");
  console.log(
    `PASS: ${checks.length} storage-guard scenarios; no uncaught page errors.`,
  );
} finally {
  await browser.close();
}
