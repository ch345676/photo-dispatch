import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  demoData,
  recordPayment,
  voidPayment,
  validateBackup,
} from "../src/domain.mjs";

const base = (process.env.QA_BASE_URL || "http://127.0.0.1:5188/").split(
  "#",
)[0];
const prefix = "shiguang-photo-v1-";
const today = "2026-10-08";
const now = "2026-10-08T04:00:00.000Z";
const storageKeys = {
  personal: prefix + "personal",
  demo: prefix + "demo",
  personalMeta: prefix + "backup-personal",
  demoMeta: prefix + "backup-demo",
  mode: prefix + "mode",
};
const fixture = demoData(today);
let source = {
  ...fixture.orders[0],
  id: "status-primary",
  title: "状态验收·纪实婚礼",
  shootDate: today,
  startTime: "10:00",
  endTime: "14:00",
  communicatedDate: "2026-09-21",
  amount: 800,
  travelAmount: 120,
  travelNote: "往返打车报销120元，已核对车票；完成拍摄不等于结清费用",
  depositRequired: 300,
  depositPaid: 200,
  depositDate: "2026-09-22",
  settlementPaid: 100,
  settlementDate: "2026-10-07",
  dispatchStatus: "待确认",
  executionStatus: "待拍摄",
  note: "请保留原拍摄备注和改期历史",
  paymentNote: "原有付款累计备注不得改变",
  updatedAt: "2026-10-07T03:00:00.000Z",
};
source = recordPayment(source, {
  kind: "settlement",
  amount: 50,
  date: "2026-10-07",
  note: "已登记的一笔尾款",
});
source = recordPayment(source, {
  kind: "settlement",
  amount: 25,
  date: "2026-10-07",
  note: "随后撤销的重复付款",
});
source = voidPayment(
  source,
  source.paymentLedger.entries.at(-1).id,
  "付款重复录入",
);
fixture.orders = [source];
const metadata = JSON.stringify({
  lastExportedAt: "2026-10-07T00:00:00.000Z",
  lastRestoredAt: "",
  snoozedUntil: "",
});
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
// One isolated context is reused. Every scenario seeds its own test-only storage.
const context = await browser.newContext({
  viewport: { width: 1512, height: 1120 },
  timezoneId: "Asia/Shanghai",
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
await page.clock.setFixedTime(new Date(now));

const raw = (key) => page.evaluate((key) => localStorage.getItem(key), key);
const read = async (mode = "personal") =>
  JSON.parse(await raw(storageKeys[mode]));
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
const detail = () =>
  page.getByRole("dialog", { name: "派单详情", exact: true });
const progress = () =>
  detail().getByRole("region", { name: "派单进度", exact: true });
const actionDialog = (action) =>
  page.getByRole("dialog", {
    name: action === "confirm" ? "确认派单" : "标记拍摄完成",
    exact: true,
  });
const actionLabel = (action) =>
  action === "confirm" ? "确认派单" : "标记拍摄完成";
const submitLabel = (action) =>
  action === "confirm" ? "确认派单" : "确认完成";
const notice = (text) =>
  page.getByRole("status").filter({ hasText: text }).waitFor();

async function seed(orders = [source], mode = "personal") {
  const data = validateBackup({ ...fixture, orders: structuredClone(orders) });
  const other = validateBackup({
    ...fixture,
    orders: [
      {
        ...source,
        id: "status-other-space",
        title: "另一个空间不得修改的订单",
      },
    ],
  });
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
        [storageKeys.mode]: mode,
        [storageKeys.personal]: JSON.stringify(
          mode === "personal" ? data : other,
        ),
        [storageKeys.demo]: JSON.stringify(mode === "demo" ? data : other),
        [storageKeys.personalMeta]: metadata,
        [storageKeys.demoMeta]: metadata,
      },
    },
  );
  await page.goto(base + "#orders");
  await page.reload({ waitUntil: "networkidle" });
  return data;
}

async function openOrder(order = source) {
  const escaped = order.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("button", { name: new RegExp(escaped) })
    .first()
    .click();
  await detail().waitFor();
  await progress().waitFor();
}

async function openAction(action) {
  await progress()
    .getByRole("button", { name: actionLabel(action), exact: true })
    .click();
  await actionDialog(action).waitFor();
}

async function submit(action) {
  await actionDialog(action)
    .getByRole("button", { name: submitLabel(action), exact: true })
    .click();
}

async function successfulAction(action) {
  await submit(action);
  await notice(
    action === "confirm"
      ? "派单已确认"
      : /已标记拍摄完成，待结金额\s*[¥￥]\s*570/,
  );
  await detail().waitFor();
}

function assertTransition(before, after, expected) {
  assert.equal(after.dispatchStatus, expected.dispatchStatus);
  assert.equal(after.executionStatus, expected.executionStatus);
  assert.equal(after.updatedAt, now);
  const unchanged = (order) =>
    Object.fromEntries(
      Object.entries(order).filter(
        ([key]) =>
          !["dispatchStatus", "executionStatus", "updatedAt"].includes(key),
      ),
    );
  assert.deepEqual(
    unchanged(after),
    unchanged(before),
    "快捷推进只改状态与更新时间，不改费用、付款流水、备注或拍摄安排",
  );
}

async function assertActionInformation(action, order) {
  const text = await actionDialog(action).innerText();
  const partner = fixture.partners.find((p) => p.id === order.partnerId);
  for (const value of [
    order.shootDate,
    order.startTime,
    order.endTime,
    partner.name,
    order.venue,
    order.hall,
    order.travelNote,
  ]) {
    assert.ok(text.includes(value), "确认弹窗应能核对 " + value);
  }
}

async function assertTouchButton(button, width) {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  assert.ok(
    box && box.height >= 44 && box.width >= 44,
    "快捷入口与确认按钮应至少44px",
  );
  assert.ok(box.x >= -1 && box.x + box.width <= width + 1, "按钮不应超出视口");
}

async function shot(name, currentDialog) {
  const closeToast = page.getByRole("button", {
    name: "关闭提示",
    exact: true,
  });
  if (await closeToast.count()) await closeToast.click();
  await currentDialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "页面不应横向溢出",
  );
  assert.equal(
    await currentDialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
    false,
    "弹窗不应横向溢出",
  );
  const path = resolve("test-results", name + ".png");
  await page.screenshot({ path, animations: "disabled" });
  console.log("SCREENSHOT: " + path);
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
    "确认和完成前均可核对安排与车费，返回详情完全只读",
    async () => {
      for (const action of ["confirm", "complete"]) {
        const order = {
          ...source,
          dispatchStatus: action === "confirm" ? "待确认" : "已确认",
        };
        await seed([order]);
        const before = await snapshot();
        await openOrder(order);
        await openAction(action);
        await assertActionInformation(action, order);
        assert.deepEqual(await snapshot(), before, "只打开确认框不写入数据");
        await actionDialog(action)
          .getByRole("button", { name: "返回详情", exact: true })
          .click();
        await detail().waitFor();
        assert.deepEqual(
          await snapshot(),
          before,
          "返回详情不改数据和备份时间",
        );
      }
    },
  );

  for (const mode of ["personal", "demo"]) {
    await scenario(
      "在" + mode + "空间依次确认和完成，刷新保留状态且隔离另一空间",
      async () => {
        await seed([source], mode);
        const before = await snapshot();
        await openOrder();
        await openAction("confirm");
        await successfulAction("confirm");
        const confirmed = (await read(mode)).orders[0];
        assertTransition(source, confirmed, {
          dispatchStatus: "已确认",
          executionStatus: "待拍摄",
        });
        await openAction("complete");
        await successfulAction("complete");
        const finished = (await read(mode)).orders[0];
        assertTransition(confirmed, finished, {
          dispatchStatus: "已确认",
          executionStatus: "已完成",
        });
        assert.equal(finished.depositPaid + finished.settlementPaid, 350);
        assert.equal(
          finished.amount +
            finished.travelAmount -
            finished.depositPaid -
            finished.settlementPaid,
          570,
        );
        assert.equal(
          await progress()
            .getByRole("button", { name: "确认派单", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await progress()
            .getByRole("button", { name: "标记拍摄完成", exact: true })
            .count(),
          0,
        );
        const other = mode === "personal" ? "demo" : "personal";
        assert.equal(await raw(storageKeys[other]), before[storageKeys[other]]);
        for (const key of [storageKeys.personalMeta, storageKeys.demoMeta])
          assert.equal(await raw(key), before[key]);
        await page.reload({ waitUntil: "networkidle" });
        await openOrder();
        assert.match(await progress().innerText(), /已完成/);
        assert.deepEqual((await read(mode)).orders[0], finished);
        assert.match(
          await detail().locator(".detail-badges").innerText(),
          /部分结账/,
        );
        await detail()
          .getByRole("button", { name: "登记付款", exact: true })
          .click();
        const payment = page.getByRole("dialog", {
          name: "登记一笔付款",
          exact: true,
        });
        await payment.waitFor();
        await payment
          .getByRole("button", { name: "返回", exact: true })
          .click();
        await detail().waitFor();
        assert.deepEqual(
          (await read(mode)).orders[0],
          finished,
          "已完成订单仍可进入登记付款，取消不改账目",
        );
        await detail()
          .getByRole("button", { name: "关闭", exact: true })
          .click();
        await page.goto(base + "#reminders", { waitUntil: "networkidle" });
        const overdue = page
          .locator(".reminder-row")
          .filter({ hasText: source.title })
          .filter({ hasText: "拍摄已完成" });
        await overdue.waitFor();
        assert.match(await overdue.innerText(), /待结\s*[¥￥]\s*570/);
      },
    );
  }

  await scenario(
    "派单已改期和执行已改期均可重新确认，恢复待拍摄且保留历史",
    async () => {
      for (const status of [
        { dispatchStatus: "已改期", executionStatus: "已改期" },
        { dispatchStatus: "已确认", executionStatus: "已改期" },
      ]) {
        const order = { ...source, ...status };
        await seed([order]);
        await openOrder(order);
        await openAction("confirm");
        await successfulAction("confirm");
        assertTransition(order, (await read()).orders[0], {
          dispatchStatus: "已确认",
          executionStatus: "待拍摄",
        });
      }
    },
  );

  await scenario(
    "历史已有档期冲突不阻止完成，重新确认仍阻止同档期占用",
    async () => {
      const overlap = {
        ...source,
        id: "status-overlap",
        title: "同伙伴同时间的历史派单",
        dispatchStatus: "已确认",
      };
      const confirmed = {
        ...source,
        dispatchStatus: "已确认",
        shootDate: "2026-10-07",
      };
      await seed([confirmed, { ...overlap, shootDate: confirmed.shootDate }]);
      const before = await read();
      await openOrder(confirmed);
      await openAction("complete");
      await successfulAction("complete");
      const saved = await read();
      assertTransition(confirmed, saved.orders[0], {
        dispatchStatus: "已确认",
        executionStatus: "已完成",
      });
      assert.deepEqual(saved.orders[1], before.orders[1]);
      await seed([source, overlap]);
      const blockedBefore = await snapshot();
      await openOrder();
      await openAction("confirm");
      await submit("confirm");
      await notice("档期冲突");
      assert.deepEqual(
        await snapshot(),
        blockedBefore,
        "确认冲突不能修改任一订单或备份元数据",
      );
    },
  );

  await scenario(
    "未来派单允许确认但禁用完成，取消、拒绝和已完成没有快捷入口",
    async () => {
      const future = { ...source, shootDate: "2026-10-09" };
      await seed([future]);
      await openOrder(future);
      await openAction("confirm");
      await successfulAction("confirm");
      const completion = progress().getByRole("button", {
        name: "标记拍摄完成",
        exact: true,
      });
      assert.equal(
        await completion.isDisabled(),
        true,
        "未来日期不能提前标记拍摄完成",
      );
      const futureSaved = await snapshot();
      await completion.dispatchEvent("click");
      assert.equal(await actionDialog("complete").count(), 0);
      assert.deepEqual(await snapshot(), futureSaved);
      for (const status of [
        { dispatchStatus: "已取消", executionStatus: "已取消" },
        { dispatchStatus: "已拒绝", executionStatus: "待拍摄" },
        { dispatchStatus: "已确认", executionStatus: "已取消" },
        { dispatchStatus: "已确认", executionStatus: "已完成" },
        { dispatchStatus: "待确认", executionStatus: "已完成" },
      ]) {
        const order = { ...source, ...status };
        await seed([order]);
        const before = await snapshot();
        await openOrder(order);
        for (const name of ["确认派单", "标记拍摄完成"])
          assert.equal(
            await progress().getByRole("button", { name, exact: true }).count(),
            0,
          );
        assert.deepEqual(await snapshot(), before);
      }
    },
  );

  await scenario("确认和完成均阻止无storage事件的过期数据覆盖", async () => {
    for (const action of ["confirm", "complete"]) {
      const order = {
        ...source,
        dispatchStatus: action === "confirm" ? "待确认" : "已确认",
      };
      await seed([order]);
      await openOrder(order);
      await openAction(action);
      const latest = await read();
      // Keep updatedAt identical to verify the storage guard, not only a timestamp check.
      latest.orders[0].note = "确认框打开后写入的最新备注，不得丢失";
      await page.evaluate(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: storageKeys.personal, value: JSON.stringify(latest) },
      );
      const changed = await snapshot();
      await submit(action);
      await notice(/更新|变化|重新/);
      assert.deepEqual(
        await snapshot(),
        changed,
        "快捷动作不得覆盖未收到事件的最新存储",
      );
      assert.equal((await read()).orders[0].executionStatus, "待拍摄");
      assert.equal(
        (await read()).orders[0].dispatchStatus,
        order.dispatchStatus,
      );
    }
  });

  await scenario(
    "个人原始存储被删除或变为空字符串时不能写回快捷状态",
    async () => {
      for (const action of ["confirm", "complete"]) {
        for (const removed of [false, true]) {
          const order = {
            ...source,
            dispatchStatus: action === "confirm" ? "待确认" : "已确认",
          };
          await seed([order]);
          await openOrder(order);
          await openAction(action);
          await page.evaluate(
            ({ key, removed }) => {
              if (removed) localStorage.removeItem(key);
              else localStorage.setItem(key, "");
            },
            { key: storageKeys.personal, removed },
          );
          const before = await snapshot();
          await submit(action);
          await notice(removed ? "本地记录已被移除" : "本地数据无法读取");
          assert.deepEqual(await snapshot(), before);
          assert.equal(await raw(storageKeys.personal), removed ? null : "");
        }
      }
    },
  );

  await scenario(
    "桌面1512和手机390/360可操作，按钮44px且详情/确认框无横向溢出",
    async () => {
      for (const width of [1512, 390, 360]) {
        await page.setViewportSize({
          width,
          height: width === 1512 ? 1120 : 844,
        });
        await seed();
        await openOrder();
        await assertTouchButton(
          progress().getByRole("button", { name: "确认派单", exact: true }),
          width,
        );
        await shot(`order-status-${width}-detail`, detail());
        await openAction("confirm");
        await assertActionInformation("confirm", source);
        await assertTouchButton(
          actionDialog("confirm").getByRole("button", {
            name: "确认派单",
            exact: true,
          }),
          width,
        );
        await assertTouchButton(
          actionDialog("confirm").getByRole("button", {
            name: "返回详情",
            exact: true,
          }),
          width,
        );
        await shot(`order-status-${width}-confirm`, actionDialog("confirm"));
        await successfulAction("confirm");
        await assertTouchButton(
          progress().getByRole("button", { name: "标记拍摄完成", exact: true }),
          width,
        );
        await openAction("complete");
        await assertTouchButton(
          actionDialog("complete").getByRole("button", {
            name: "确认完成",
            exact: true,
          }),
          width,
        );
        await shot(`order-status-${width}-complete`, actionDialog("complete"));
        await successfulAction("complete");
        assert.equal((await read()).orders[0].executionStatus, "已完成");
        assert.deepEqual(
          (await read()).orders[0].paymentLedger,
          source.paymentLedger,
        );
      }
    },
  );

  assert.deepEqual(errors, [], "页面不应出现未捕获异常");
  console.log(
    `PASS: ${checks.length} order-status scenarios; no uncaught page errors.`,
  );
} finally {
  await browser.close();
}
