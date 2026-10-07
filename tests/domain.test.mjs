import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  blankOrder,
  payable,
  paid,
  balance,
  depositStatus,
  settlementStatus,
  validateOrder,
  validateBackup,
  reminders,
  conflicts,
  shiftDate,
} from "../src/domain.mjs";
const data = demoData("2026-10-08");
const order = {
  ...data.orders[0],
  amount: 800,
  depositRequired: 200,
  depositPaid: 200,
  settlementPaid: 0,
};
test("定金与尾款分账且不重复计入", () => {
  assert.equal(paid(order), 200);
  assert.equal(balance(order), 600);
  assert.equal(depositStatus(order), "已付定金");
  assert.equal(settlementStatus(order), "未结账");
  const partial = { ...order, settlementPaid: 300 };
  assert.equal(balance(partial), 300);
  assert.equal(settlementStatus(partial), "部分结账");
  assert.equal(settlementStatus({ ...order, settlementPaid: 600 }), "已结账");
});
test("分币运算、零元订单与全额定金", () => {
  const o = {
    ...order,
    amount: 0.3,
    depositRequired: 0.1,
    depositPaid: 0.1,
    settlementPaid: 0.2,
  };
  assert.equal(paid(o), 0.3);
  assert.equal(balance(o), 0);
  assert.equal(settlementStatus({ ...order, amount: 200 }), "已结账");
  assert.equal(
    settlementStatus({
      ...order,
      amount: 0,
      depositPaid: 0,
      depositRequired: 0,
    }),
    "无需结账",
  );
});
test("金额越界与必要付款日期会阻止保存", () => {
  for (const patch of [
    { amount: -1 },
    { amount: NaN },
    { amount: 800.001 },
    { amount: 100 },
    { depositPaid: 201 },
    { settlementPaid: 601 },
    { depositDate: "" },
    { settlementPaid: 1, settlementDate: "" },
  ])
    assert.ok(validateOrder({ ...order, ...patch }, data.partners));
  assert.equal(validateOrder(order, data.partners), "");
});
test("日期与时段严格校验且支持跨月", () => {
  assert.equal(shiftDate("2026-10-31", 1), "2026-11-01");
  for (const patch of [
    { shootDate: "2026-02-30" },
    { startTime: "24:00" },
    { endTime: "08:00" },
  ])
    assert.ok(validateOrder({ ...order, ...patch }, data.partners));
});
test("同伙伴时间重叠被识别，相邻时段允许", () => {
  assert.equal(conflicts({ ...order, id: "new" }, [order]).length, 1);
  assert.equal(
    conflicts(
      { ...order, id: "new", startTime: order.endTime, endTime: "19:00" },
      [order],
    ).length,
    0,
  );
  assert.equal(
    conflicts({ ...order, id: "new", partnerId: "p2" }, [order]).length,
    0,
  );
  assert.equal(
    conflicts({ ...order, id: "new" }, [
      { ...order, dispatchStatus: "已取消", executionStatus: "已取消" },
    ]).length,
    0,
  );
});
test("取消保留金额且不发拍摄与款项催办", () => {
  const o = { ...order, dispatchStatus: "已取消", executionStatus: "已取消" };
  assert.equal(balance(o), 600);
  const r = reminders({ ...data, orders: [o] }, "2026-10-08");
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, "change");
});
test("提醒随拍摄日期更新且不改沟通日期", () => {
  const o = { ...order, shootDate: "2026-10-09" };
  assert.ok(
    reminders({ ...data, orders: [o] }, "2026-10-08").some(
      (r) => r.kind === "shoot1",
    ),
  );
  assert.ok(
    !reminders(
      { ...data, orders: [{ ...o, shootDate: "2026-10-28" }] },
      "2026-10-08",
    ).some((r) => r.kind === "shoot1"),
  );
  assert.equal(o.communicatedDate, order.communicatedDate);
});
test("备份往返保留记录且拒绝损坏或重复记录", () => {
  const raw = JSON.parse(JSON.stringify(data));
  assert.deepEqual(validateBackup(raw), data);
  assert.throws(() => validateBackup({ ...raw, version: 3 }));
  assert.throws(() =>
    validateBackup({ ...raw, orders: [...raw.orders, raw.orders[0]] }),
  );
  assert.throws(() => validateBackup({ ...raw, partners: [] }));
  assert.throws(() =>
    validateBackup({ ...raw, orders: [{ ...raw.orders[0], amount: -1 }] }),
  );
  assert.throws(() =>
    validateBackup({ ...raw, orders: [{ ...raw.orders[0], depositDate: 42 }] }),
  );
});
test("车费单列并只计入应付一次", () => {
  const o = { ...order, travelAmount: 120, travelNote: "往返打车" };
  assert.equal(payable(o), 920);
  assert.equal(balance(o), 720);
  assert.equal(
    validateOrder(
      { ...o, settlementPaid: 720, settlementDate: "2026-10-08" },
      data.partners,
    ),
    "",
  );
  assert.equal(settlementStatus({ ...o, settlementPaid: 600 }), "部分结账");
  assert.equal(settlementStatus({ ...o, settlementPaid: 720 }), "已结账");
  assert.ok(validateOrder({ ...o, travelAmount: -1 }, data.partners));
});
test("无车费字段的旧备份自动兼容为零，不修改原文件", () => {
  const d = JSON.parse(JSON.stringify(data));
  for (const o of d.orders) {
    delete o.travelAmount;
    delete o.travelNote;
  }
  const restored = validateBackup(d);
  assert.equal(restored.orders[0].travelAmount, 0);
  assert.equal(restored.orders[0].travelNote, "");
  assert.equal(d.orders[0].travelAmount, undefined);
});
