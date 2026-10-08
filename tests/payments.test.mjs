import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  paid,
  payable,
  balance,
  settlementStatus,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
  currentBaseline,
  validateOrder,
  validateBackup,
  validateLedger,
} from "../src/domain.mjs";

const data = demoData("2026-10-08");
const legacy = {
  ...data.orders[0],
  amount: 800,
  travelAmount: 120,
  depositRequired: 300,
  depositPaid: 200,
  depositDate: "2026-10-02",
  settlementPaid: 100,
  settlementDate: "2026-10-03",
  paymentNote: "此前的累计付款",
};
const entry = (kind, amount, date = "2026-10-08", note = "") => ({
  kind,
  amount,
  date,
  note,
});

test("v1 到 v3 迁移确定且幂等，旧累计不会被伪造为流水", () => {
  const old = { ...data, version: 1, orders: [legacy] };
  const restored = validateBackup(old);
  assert.equal(restored.version, 3);
  assert.equal(restored.orders[0].paymentLedger, undefined);
  assert.deepEqual(validateBackup(restored), restored);
  assert.equal(old.version, 1);
  const o = recordPayment(restored.orders[0], entry("deposit", 50));
  assert.equal(o.depositPaid, 250);
  assert.equal(o.settlementPaid, 100);
  assert.equal(o.paymentLedger.baseline.depositPaid, 200);
  assert.equal(o.paymentLedger.baseline.settlementPaid, 100);
  assert.equal(o.paymentLedger.entries.length, 1);
  assert.equal(o.paymentLedger.entries[0].amount, 50);
  assert.equal(o.paymentLedger.baseline.note, "此前的累计付款");
  assert.deepEqual(validateBackup({ ...restored, orders: [o] }).orders[0], o);
});
test("定金尾款及车费分币计算，阻止超付且不修改原订单", () => {
  const o = {
    ...legacy,
    amount: 800.1,
    travelAmount: 20.2,
    depositRequired: 200.1,
    depositPaid: 200.1,
    settlementPaid: 0,
    settlementDate: "",
  };
  const final = recordPayment(o, entry("settlement", 620.2));
  assert.equal(payable(final), 820.3);
  assert.equal(paid(final), 820.3);
  assert.equal(balance(final), 0);
  assert.equal(settlementStatus(final), "已结账");
  assert.throws(() => recordPayment(final, entry("settlement", 0.01)), /超过/);
  assert.equal(final.paymentLedger.entries.length, 1);
  assert.equal(o.paymentLedger, undefined);
});
test("补录付款不把最后支付日期改早，撤销后正确回退", () => {
  let o = recordPayment(legacy, entry("deposit", 50, "2026-10-10", "第一次"));
  o = recordPayment(o, entry("deposit", 25, "2026-10-05", "补录"));
  assert.equal(o.depositDate, "2026-10-10");
  assert.equal(o.depositPaid, 275);
  const first = o.paymentLedger.entries[0].id,
    second = o.paymentLedger.entries[1].id;
  o = voidPayment(o, first, "重复登记");
  assert.equal(o.depositPaid, 225);
  assert.equal(o.depositDate, "2026-10-05");
  assert.throws(() => voidPayment(o, first, "再次撤销"), /已撤销/);
  assert.throws(() => voidPayment(o, second, " "), /原因/);
  o = voidPayment(o, second, "核对后修正");
  assert.equal(o.depositPaid, 200);
  assert.equal(o.depositDate, "2026-10-02");
  assert.equal(o.paymentLedger.entries.length, 2);
  assert.ok(o.paymentLedger.entries.every((e) => e.voidedAt));
  const again = recordPayment(o, entry("deposit", 20));
  assert.equal(again.depositPaid, 220);
  assert.equal(again.paymentLedger.baseline.depositPaid, 200);
});
test("无基线付款撤销至零后日期清空，保留已撤销记录", () => {
  const initial = {
    ...legacy,
    depositPaid: 0,
    depositDate: "",
    settlementPaid: 0,
    settlementDate: "",
  };
  let o = recordPayment(initial, entry("settlement", 100));
  o = voidPayment(o, o.paymentLedger.entries[0].id, "录错订单");
  assert.equal(o.settlementPaid, 0);
  assert.equal(o.settlementDate, "");
  assert.equal(o.paymentLedger.entries.length, 1);
});
test("初始累计更正留存原值及原因，不覆盖后续逐笔付款", () => {
  const o = recordPayment(legacy, entry("settlement", 300));
  const corrected = revisePaymentBaseline(
    o,
    { ...currentBaseline(o.paymentLedger), depositPaid: 150 },
    "原定金多填 50 元",
  );
  assert.equal(corrected.depositPaid, 150);
  assert.equal(corrected.settlementPaid, 400);
  assert.equal(corrected.paymentLedger.baseline.depositPaid, 200);
  assert.equal(corrected.paymentLedger.revisions[0].value.depositPaid, 150);
  assert.equal(corrected.paymentLedger.entries[0].amount, 300);
  assert.equal(balance(corrected), 370);
  assert.throws(
    () =>
      revisePaymentBaseline(
        corrected,
        currentBaseline(corrected.paymentLedger),
        "未变化",
      ),
    /没有变化/,
  );
  assert.throws(
    () =>
      revisePaymentBaseline(
        corrected,
        { ...currentBaseline(corrected.paymentLedger), settlementPaid: 900 },
        "超额",
      ),
    /超过/,
  );
  assert.throws(
    () =>
      revisePaymentBaseline(
        corrected,
        { ...currentBaseline(corrected.paymentLedger), depositPaid: 140 },
        "",
      ),
    /原因/,
  );
  assert.equal(validateOrder(corrected, data.partners), "");
});
test("损坏或不一致流水备份原子拒绝，不静默修正合计", () => {
  const good = recordPayment(legacy, entry("settlement", 300));
  const mutations = [
    (o) => {
      o.settlementPaid++;
    },
    (o) => {
      o.settlementDate = "2026-10-09";
    },
    (o) => {
      o.paymentLedger.entries.push({ ...o.paymentLedger.entries[0] });
    },
    (o) => {
      o.paymentLedger.entries[0].kind = "unknown";
    },
    (o) => {
      o.paymentLedger.entries[0].amount = 0;
    },
    (o) => {
      o.paymentLedger.entries[0].amount = -1;
    },
    (o) => {
      o.paymentLedger.entries[0].amount = 1.001;
    },
    (o) => {
      o.paymentLedger.entries[0].voidedAt = new Date().toISOString();
    },
    (o) => {
      o.paymentLedger.entries[0].date = "2026-02-30";
    },
    (o) => {
      o.paymentLedger.revisions = null;
    },
    (o) => {
      o.paymentLedger.entries[0].recordedAt = "bad";
    },
  ];
  for (const mutate of mutations) {
    const o = structuredClone(good);
    mutate(o);
    const before = JSON.stringify(o);
    assert.throws(() => validateBackup({ ...data, orders: [o] }));
    assert.equal(JSON.stringify(o), before);
  }
  assert.equal(validateLedger(good), "");
  assert.equal(good.settlementPaid, 400);
});
test("取消派单保留付款流水和余额", () => {
  const o = {
    ...recordPayment(legacy, entry("settlement", 300)),
    dispatchStatus: "已取消",
    executionStatus: "已取消",
  };
  assert.equal(o.paymentLedger.entries.length, 1);
  assert.equal(paid(o), 600);
  assert.equal(balance(o), 320);
  assert.equal(validateOrder(o, data.partners), "");
});
test("无效付款与部分定金余额会被拦截", () => {
  for (const e of [
    entry("deposit", 0),
    entry("deposit", -1),
    entry("deposit", NaN),
    entry("deposit", 1.111),
    entry("settlement", 10, "2026-02-30"),
    entry("invalid", 10),
  ])
    assert.throws(() => recordPayment(legacy, e));
  assert.throws(() => recordPayment(legacy, entry("deposit", 100.01)), /超过/);
  const o = { ...legacy, amount: 300, travelAmount: 0, settlementPaid: 90 };
  assert.throws(() => recordPayment(o, entry("deposit", 11)), /超过/);
});
