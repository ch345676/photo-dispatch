import test from "node:test";
import assert from "node:assert/strict";
import {
  DISPATCH,
  EXECUTION,
  demoData,
  today,
  shiftDate,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
  validateBackup,
  validateOrder,
  paid,
  balance,
} from "../src/domain.mjs";
import {
  orderStatusActions,
  transitionOrderStatus,
} from "../src/order-status.mjs";

const DATE = "2026-10-08";
const data = demoData(DATE);
const fixture = (patch = {}) => ({
  ...data.orders[0],
  id: "status-order",
  title: "快捷状态验收拍摄",
  shootDate: DATE,
  communicatedDate: "2026-09-21",
  dispatchStatus: "待确认",
  executionStatus: "待拍摄",
  updatedAt: "2026-09-21T08:00:00.000Z",
  ...patch,
});
const options = (orders = [], date = DATE) => ({
  partners: data.partners,
  orders,
  date,
});
const confirmPairs = new Set([
  "待确认/待拍摄",
  "待确认/已改期",
  "已改期/待拍摄",
  "已改期/已改期",
  "已确认/已改期",
]);

function freezeTree(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

test("状态组合只开放约定动作，取消、拒绝和执行取消均不能快捷重启", () => {
  for (const dispatchStatus of DISPATCH) {
    for (const executionStatus of EXECUTION) {
      const order = freezeTree(fixture({ dispatchStatus, executionStatus }));
      const pair = `${dispatchStatus}/${executionStatus}`;
      const expected = {
        confirm: confirmPairs.has(pair),
        complete: pair === "已确认/待拍摄",
      };
      assert.deepEqual(orderStatusActions(order, DATE), expected, pair);
      for (const action of ["confirm", "complete"]) {
        if (!expected[action]) {
          assert.throws(
            () => transitionOrderStatus(order, action, options()),
            Error,
            `${pair} 不应允许 ${action}`,
          );
        }
      }
    }
  }
});

test("待确认和改期订单可确认当前日期，确认不改期、不更改沟通日期和原版本", () => {
  for (const pair of confirmPairs) {
    const [dispatchStatus, executionStatus] = pair.split("/");
    const order = freezeTree(
      fixture({
        dispatchStatus,
        executionStatus,
        shootDate: shiftDate(DATE, 7),
        note: "改期记录已由原编辑流程保存",
      }),
    );
    const next = transitionOrderStatus(order, "confirm", options([order]));
    assert.notEqual(next, order);
    assert.deepEqual(next, {
      ...order,
      dispatchStatus: "已确认",
      executionStatus: "待拍摄",
    });
    assert.equal(next.updatedAt, order.updatedAt);
    assert.equal(validateOrder(next, data.partners), "");
    assert.throws(
      () => transitionOrderStatus(next, "confirm", options()),
      /当前状态/,
    );
  }
});

test("完成允许当天和过去的已确认拍摄，未来日期及重复完成均被拒绝", () => {
  for (const shootDate of [shiftDate(DATE, -1), DATE]) {
    const order = fixture({ dispatchStatus: "已确认", shootDate });
    assert.equal(orderStatusActions(order, DATE).complete, true);
    const next = transitionOrderStatus(order, "complete", options());
    assert.deepEqual(next, { ...order, executionStatus: "已完成" });
    assert.deepEqual(orderStatusActions(next, DATE), {
      confirm: false,
      complete: false,
    });
    assert.throws(
      () => transitionOrderStatus(next, "complete", options()),
      /当前状态/,
    );
  }
  const future = fixture({
    dispatchStatus: "已确认",
    shootDate: shiftDate(DATE, 1),
  });
  assert.equal(orderStatusActions(future, DATE).complete, false);
  assert.throws(
    () => transitionOrderStatus(future, "complete", options()),
    /尚未到拍摄日期/,
  );
  assert.throws(
    () => transitionOrderStatus(future, "cancel", options()),
    /不支持/,
  );

  const currentDay = fixture({ dispatchStatus: "已确认", shootDate: today() });
  assert.equal(orderStatusActions(currentDay).complete, true);
  assert.equal(
    transitionOrderStatus(currentDay, "complete", {
      partners: data.partners,
      orders: [],
    }).executionStatus,
    "已完成",
  );
});

test("确认会拒绝档期冲突，历史重叠记录仍可标记完成", () => {
  const pending = freezeTree(fixture());
  const overlapping = fixture({
    id: "overlap",
    title: "已安排的另一场拍摄",
    startTime: "10:00",
    endTime: "16:00",
    dispatchStatus: "已确认",
  });
  const before = JSON.stringify(pending);
  assert.throws(
    () =>
      transitionOrderStatus(
        pending,
        "confirm",
        options([pending, overlapping]),
      ),
    /档期冲突.*另一场拍摄/,
  );
  assert.throws(
    () =>
      transitionOrderStatus(
        { ...pending, dispatchStatus: "已确认", executionStatus: "已改期" },
        "confirm",
        options([overlapping]),
      ),
    /档期冲突/,
  );
  assert.equal(JSON.stringify(pending), before);

  const historical = { ...pending, dispatchStatus: "已确认" };
  const completed = transitionOrderStatus(
    historical,
    "complete",
    options([historical, overlapping]),
  );
  assert.equal(completed.executionStatus, "已完成");
  assert.equal(completed.updatedAt, historical.updatedAt);

  for (const other of [
    { ...overlapping, startTime: pending.endTime, endTime: "18:00" },
    { ...overlapping, dispatchStatus: "已取消", executionStatus: "已取消" },
    { ...overlapping, dispatchStatus: "已拒绝" },
    { ...overlapping, partnerId: "p2" },
  ]) {
    assert.equal(
      transitionOrderStatus(pending, "confirm", options([pending, other]))
        .dispatchStatus,
      "已确认",
    );
  }
});

test("确认再完成深度保留付款、更正和撤销历史，不改变金额或原订单", () => {
  let order = fixture({
    amount: 800,
    travelAmount: 120,
    travelNote: "往返车费",
    depositRequired: 300,
    depositPaid: 200,
    depositDate: "2026-10-02",
    settlementPaid: 100,
    settlementDate: "2026-10-03",
    note: "客户联系人和拍摄要求",
    paymentNote: "独立结算备注",
  });
  const payment = (amount) => ({
    kind: "settlement",
    amount,
    date: DATE,
    note: "逐笔说明",
  });
  order = recordPayment(order, payment(100));
  order = recordPayment(order, payment(50));
  order = voidPayment(order, order.paymentLedger.entries[1].id, "多录一笔");
  order = revisePaymentBaseline(
    order,
    {
      depositPaid: 150,
      depositDate: "2026-10-02",
      settlementPaid: 50,
      settlementDate: "2026-10-03",
      note: "已核对初始累计",
    },
    "修正原累计",
  );
  freezeTree(order);
  const before = JSON.stringify(order);
  const confirmed = transitionOrderStatus(order, "confirm", options([order]));
  const completed = transitionOrderStatus(
    confirmed,
    "complete",
    options([confirmed]),
  );
  assert.deepEqual(completed, {
    ...order,
    dispatchStatus: "已确认",
    executionStatus: "已完成",
  });
  assert.equal(paid(completed), 300);
  assert.equal(balance(completed), 620);
  assert.deepEqual(completed.paymentLedger, order.paymentLedger);
  assert.equal(completed.updatedAt, order.updatedAt);
  assert.equal(JSON.stringify(order), before);
  assert.equal(confirmed.executionStatus, "待拍摄");
});

test("两种快捷动作均遵守订单有效性校验，失败不修写原记录", () => {
  for (const [action, dispatchStatus] of [
    ["confirm", "待确认"],
    ["complete", "已确认"],
  ]) {
    for (const patch of [
      { amount: -1 },
      { shootDate: "2026-02-30" },
      { endTime: "08:00" },
      { depositDate: "" },
      { partnerId: "missing-partner" },
    ]) {
      const order = freezeTree(fixture({ dispatchStatus, ...patch }));
      const before = JSON.stringify(order);
      assert.throws(
        () => transitionOrderStatus(order, action, options()),
        Error,
      );
      assert.equal(JSON.stringify(order), before);
    }
  }
});

test("旧版无车费和流水记录可确认及完成，不添加字段或更改备份版本", () => {
  const legacy = fixture();
  delete legacy.travelAmount;
  delete legacy.travelNote;
  const before = JSON.stringify(legacy);
  const confirmed = transitionOrderStatus(legacy, "confirm", options([legacy]));
  const completed = transitionOrderStatus(
    confirmed,
    "complete",
    options([confirmed]),
  );
  assert.equal(Object.hasOwn(completed, "travelAmount"), false);
  assert.equal(Object.hasOwn(completed, "paymentLedger"), false);
  assert.deepEqual(Object.keys(completed), Object.keys(legacy));
  assert.equal(JSON.stringify(legacy), before);

  const restored = validateBackup({ ...data, version: 1, orders: [legacy] });
  const restoredOrder = transitionOrderStatus(
    restored.orders[0],
    "confirm",
    options(restored.orders),
  );
  const roundTrip = validateBackup({ ...restored, orders: [restoredOrder] });
  assert.equal(roundTrip.version, restored.version);
  assert.equal(roundTrip.orders[0].paymentLedger, undefined);
  assert.equal(roundTrip.orders[0].depositPaid, legacy.depositPaid);
  assert.equal(roundTrip.orders[0].updatedAt, legacy.updatedAt);
});
