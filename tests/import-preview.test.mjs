import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  emptyData,
  validateBackup,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
} from "../src/domain.mjs";
import { summarizeBackup } from "../src/import-preview.mjs";

const source = demoData("2026-10-08");
const order = (patch = {}) => ({
  ...source.orders[0],
  id: "preview-order",
  amount: 800,
  travelAmount: 120,
  depositRequired: 300,
  depositPaid: 200,
  depositDate: "2026-10-02",
  settlementPaid: 0,
  settlementDate: "",
  paymentNote: "历史累计说明",
  ...patch,
});
const validated = (orders) => validateBackup({ ...source, orders });
const payment = (amount) => ({
  kind: "settlement",
  amount,
  date: "2026-10-08",
  note: "本次尾款",
});

function freezeTree(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

test("预览按分汇总车费和累计付款一次，日期范围覆盖全部拍摄日", () => {
  const data = validated([
    order({
      shootDate: "2026-10-21",
      settlementPaid: 300,
      settlementDate: "2026-10-08",
    }),
    order({
      id: "small-order",
      shootDate: "2025-11-03",
      amount: 0.3,
      travelAmount: 0.2,
      depositRequired: 0.1,
      depositPaid: 0.1,
      settlementPaid: 0.1,
      settlementDate: "2025-11-03",
    }),
  ]);
  assert.deepEqual(summarizeBackup(data), {
    trash: 0,
    orders: 2,
    partners: 4,
    venues: 3,
    amount: 800.3,
    travelAmount: 120.2,
    payable: 920.5,
    depositPaid: 200.1,
    settlementPaid: 300.1,
    paid: 500.2,
    balance: 420.3,
    unsettledOrders: 2,
    dateFrom: "2025-11-03",
    dateTo: "2026-10-21",
  });
});

test("带撤销和初始累计更正的流水只计当前汇总，预览不修改任何历史", () => {
  let current = order({ settlementPaid: 100, settlementDate: "2026-10-03" });
  current = recordPayment(current, payment(300));
  current = voidPayment(
    current,
    current.paymentLedger.entries[0].id,
    "重复登记",
  );
  current = revisePaymentBaseline(
    current,
    {
      depositPaid: 250,
      depositDate: "2026-10-02",
      settlementPaid: 50,
      settlementDate: "2026-10-03",
      note: "核对初始定金和尾款分类",
    },
    "原累计分类有误",
  );
  current = recordPayment(current, payment(200));
  const data = freezeTree(validated([current]));
  const before = JSON.stringify(data);
  const summary = summarizeBackup(data);
  assert.equal(summary.depositPaid, 250);
  assert.equal(summary.settlementPaid, 250);
  assert.equal(summary.paid, 500);
  assert.equal(summary.payable, 920);
  assert.equal(summary.balance, 420);
  assert.equal(summary.unsettledOrders, 1);
  assert.equal(data.orders[0].paymentLedger.entries.length, 2);
  assert.equal(data.orders[0].paymentLedger.revisions.length, 1);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(summarizeBackup(data), summary);
});

test("取消和拒绝订单的实际应付、已付与欠款都保留在导入预览", () => {
  const data = validated([
    order({
      id: "cancelled",
      shootDate: "2026-09-01",
      amount: 300,
      travelAmount: 0,
      depositRequired: 100,
      depositPaid: 100,
      dispatchStatus: "已取消",
      executionStatus: "已取消",
    }),
    order({
      id: "rejected",
      shootDate: "2026-11-01",
      amount: 500,
      travelAmount: 50,
      depositRequired: 50,
      depositPaid: 50,
      settlementPaid: 100,
      settlementDate: "2026-10-08",
      dispatchStatus: "已拒绝",
    }),
  ]);
  const summary = summarizeBackup(data);
  assert.equal(summary.orders, 2);
  assert.equal(summary.payable, 850);
  assert.equal(summary.paid, 250);
  assert.equal(summary.balance, 600);
  assert.equal(summary.unsettledOrders, 2);
  assert.equal(summary.dateFrom, "2026-09-01");
  assert.equal(summary.dateTo, "2026-11-01");
});

test("空备份、仅联系人资料和零元免结订单的预览口径明确", () => {
  assert.deepEqual(summarizeBackup(validateBackup(emptyData())), {
    trash: 0,
    orders: 0,
    partners: 0,
    venues: 0,
    amount: 0,
    travelAmount: 0,
    payable: 0,
    depositPaid: 0,
    settlementPaid: 0,
    paid: 0,
    balance: 0,
    unsettledOrders: 0,
    dateFrom: "",
    dateTo: "",
  });
  const contacts = summarizeBackup(validated([]));
  assert.equal(contacts.orders, 0);
  assert.equal(contacts.partners, 4);
  assert.equal(contacts.venues, 3);
  assert.equal(contacts.dateFrom, "");
  assert.equal(contacts.dateTo, "");

  const zero = summarizeBackup(
    validated([
      order({
        amount: 0,
        travelAmount: 0,
        depositRequired: 0,
        depositPaid: 0,
        depositDate: "",
        settlementExempt: true,
      }),
    ]),
  );
  assert.equal(zero.orders, 1);
  assert.equal(zero.payable, 0);
  assert.equal(zero.paid, 0);
  assert.equal(zero.balance, 0);
  assert.equal(zero.unsettledOrders, 0);
  assert.equal(zero.dateFrom, "2026-10-08");
  assert.equal(zero.dateTo, "2026-10-08");
});

test("v1 备份先恢复默认车费后可汇总，原文件和累计付款不被重写", () => {
  const legacyOrder = order();
  delete legacyOrder.travelAmount;
  delete legacyOrder.travelNote;
  const legacy = { ...source, version: 1, orders: [legacyOrder] };
  const before = JSON.stringify(legacy);
  const restored = validateBackup(legacy);
  const restoredBefore = JSON.stringify(restored);
  const summary = summarizeBackup(restored);
  assert.equal(summary.amount, 800);
  assert.equal(summary.travelAmount, 0);
  assert.equal(summary.payable, 800);
  assert.equal(summary.paid, 200);
  assert.equal(summary.balance, 600);
  assert.equal(restored.orders[0].paymentLedger, undefined);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(JSON.stringify(restored), restoredBefore);
});

test("一万条极端有效金额仍按分精确汇总，不漏掉每单一分钱欠款", () => {
  const rows = Array.from({ length: 10000 }, (_, index) =>
    order({
      id: "maximum-" + index,
      amount: 100000000,
      travelAmount: 100000000,
      depositRequired: 100000000,
      depositPaid: 99999999.99,
      settlementPaid: 100000000,
      settlementDate: "2026-10-08",
    }),
  );
  const summary = summarizeBackup(validated(rows));
  assert.equal(summary.orders, 10000);
  assert.equal(summary.amount, 1000000000000);
  assert.equal(summary.travelAmount, 1000000000000);
  assert.equal(summary.payable, 2000000000000);
  assert.equal(summary.depositPaid, 999999999900);
  assert.equal(summary.settlementPaid, 1000000000000);
  assert.equal(summary.paid, 1999999999900);
  assert.equal(summary.balance, 100);
  assert.equal(summary.unsettledOrders, 10000);
});
