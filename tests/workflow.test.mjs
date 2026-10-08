import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  blankOrder,
  validateBackup,
  validateOrder,
  recordPayment,
  paid,
  payable,
  balance,
  settlementStatus,
  travelState,
  reminders,
  duplicateOrder,
} from "../src/domain.mjs";
import {
  withScheduleHistory,
  moveToTrash,
  restoreOrder,
  statementRows,
  statementTotals,
  statementCSV,
  dispatchMessage,
  calendarLabel,
} from "../src/workflow.mjs";
import { parseDrafts, updateDrafts } from "../src/drafts.mjs";
import { summarizeBackup } from "../src/import-preview.mjs";
import { backupStatus } from "../src/backup.mjs";
const source = demoData("2026-10-08");
const fresh = () => ({
  ...blankOrder("2026-10-08"),
  title: "水晶厅婚礼",
  partnerId: source.partners[0].id,
  city: "重庆",
  venue: "测试酒店",
  hall: "水晶厅",
  amount: 800,
  depositRequired: 200,
  travelStatus: "pending",
});
const fixture = (o) => ({ ...source, orders: [o], trash: [] });
test("未知车费不假结清，已知金额和定金仍只计算一次", () => {
  let o = recordPayment(fresh(), {
    kind: "deposit",
    amount: 200,
    date: "2026-10-08",
    note: "",
  });
  o = recordPayment(o, {
    kind: "settlement",
    amount: 600,
    date: "2026-10-08",
    note: "",
  });
  assert.equal(balance(o), 0);
  assert.equal(paid(o), 800);
  assert.equal(settlementStatus(o), "待核车费");
  assert.ok(
    reminders(fixture(o), "2026-10-08").some((r) => r.kind === "travel"),
  );
  const checked = { ...o, travelStatus: "checked", travelAmount: 120.5 };
  assert.equal(payable(checked), 920.5);
  assert.equal(balance(checked), 120.5);
  assert.equal(paid(checked), 800);
  assert.equal(settlementStatus({ ...o, travelStatus: "none" }), "已结账");
  assert.equal(
    settlementStatus({ ...fresh(), amount: 0, depositRequired: 0 }),
    "待核车费",
  );
  assert.ok(
    validateOrder({ ...checked, travelStatus: "none" }, source.partners),
  );
});
test("旧 v1/v2 备份按已有车费解释且不改文件，v3 状态和历史往返", () => {
  for (const version of [1, 2]) {
    const original = { ...source, version };
    delete original.trash;
    const snapshot = JSON.stringify(original);
    const result = validateBackup(original);
    assert.equal(result.version, 3);
    assert.deepEqual(result.trash, []);
    assert.equal(
      travelState(result.orders[0]),
      result.orders[0].travelAmount > 0 ? "checked" : "none",
    );
    assert.equal(JSON.stringify(original), snapshot);
  }
  const o = withScheduleHistory(
    fresh(),
    { ...fresh(), shootDate: "2026-10-10" },
    "客户改期",
  );
  assert.deepEqual(validateBackup(fixture(o)).orders[0], o);
});
test("改日期和仅改时段均留痕、要求原因、重新确认且完整保留账目", () => {
  const before = recordPayment(fresh(), {
    kind: "deposit",
    amount: 200,
    date: "2026-10-08",
    note: "微信",
  });
  const snap = JSON.stringify(before);
  assert.throws(() =>
    withScheduleHistory(before, { ...before, shootDate: "2026-10-12" }, "  "),
  );
  const first = withScheduleHistory(
    before,
    { ...before, startTime: "10:00" },
    "仪式延后",
  );
  assert.equal(first.dispatchStatus, "已改期");
  assert.equal(first.executionStatus, "已改期");
  assert.equal(first.scheduleHistory[0].from.start, "09:00");
  const next = withScheduleHistory(
    first,
    { ...first, shootDate: "2026-10-12" },
    "客户改日",
  );
  assert.equal(next.scheduleHistory.length, 2);
  assert.equal(validateOrder(next, source.partners), "");
  assert.deepEqual(next.paymentLedger, before.paymentLedger);
  assert.equal(JSON.stringify(before), snap);
  assert.ok(validateOrder({ ...next, startTime: "11:00" }, source.partners));
  const corrupt = structuredClone(next);
  corrupt.scheduleHistory[1].from.date = "2026-10-09";
  assert.ok(validateOrder(corrupt, source.partners));
  assert.deepEqual(
    withScheduleHistory(before, { ...before, note: "补充备注" }, ""),
    { ...before, note: "补充备注" },
  );
});
test("取消单改期保留取消，复制不继承改期和付款历史", () => {
  const o = { ...fresh(), dispatchStatus: "已取消", executionStatus: "已取消" };
  const changed = withScheduleHistory(
    o,
    { ...o, shootDate: "2026-10-13" },
    "留存客户修改",
  );
  assert.equal(changed.dispatchStatus, "已取消");
  assert.equal(duplicateOrder(changed).scheduleHistory, undefined);
});
test("回收站删除恢复往返保留逐笔资金与改期，预览金额不计回收站", () => {
  const base = recordPayment(fresh(), {
    kind: "deposit",
    amount: 200,
    date: "2026-10-08",
    note: "测试",
  });
  const o = withScheduleHistory(
    base,
    { ...base, shootDate: "2026-10-09" },
    "日期调整",
  );
  const data = fixture(o);
  const original = JSON.stringify(data);
  const deleted = moveToTrash(data, o);
  assert.equal(deleted.orders.length, 0);
  assert.deepEqual(deleted.trash[0].order, o);
  assert.equal(JSON.stringify(data), original);
  const restored = restoreOrder(
    validateBackup(JSON.parse(JSON.stringify(deleted))),
    o.id,
  );
  assert.equal(restored.trash.length, 0);
  assert.deepEqual(restored.orders[0].paymentLedger, o.paymentLedger);
  assert.deepEqual(restored.orders[0].scheduleHistory, o.scheduleHistory);
  assert.equal(summarizeBackup(deleted).trash, 1);
  assert.equal(summarizeBackup(deleted).payable, 0);
  assert.notEqual(
    backupStatus(
      { ...deleted, partners: [], venues: [] },
      "personal",
      {},
      Date.now(),
    ).reason,
    "empty",
  );
});
test("过期删除、恢复档期冲突及重复编号被拒绝，原数据不变", () => {
  const o = fresh();
  assert.throws(() => moveToTrash(fixture(o), { ...o, note: "旧内容" }));
  const deleted = moveToTrash(fixture(o), o);
  const conflict = { ...o, id: "conflict" };
  assert.throws(
    () => restoreOrder({ ...deleted, orders: [conflict] }, o.id),
    /冲突/,
  );
  assert.throws(() => validateBackup({ ...deleted, orders: [o] }), /重复/);
  assert.throws(() =>
    validateBackup({
      ...deleted,
      trash: [{ ...deleted.trash[0], deletedAt: "bad" }],
    }),
  );
  assert.throws(() => validateBackup({ ...deleted, partners: [] }));
  assert.equal(
    restoreOrder(
      {
        ...deleted,
        orders: [
          { ...conflict, dispatchStatus: "已取消", executionStatus: "已取消" },
        ],
      },
      o.id,
    ).orders.length,
    2,
  );
});
test("伙伴对账使用拍摄月与分币，保留取消费用、待核车费、导出防公式", () => {
  const a = {
    ...fresh(),
    amount: 0.3,
    depositRequired: 0.1,
    depositPaid: 0.1,
    depositDate: "2026-10-08",
    travelAmount: 0.2,
  };
  const b = {
    ...a,
    id: "b",
    title: "=HYPERLINK(1)",
    dispatchStatus: "已取消",
    executionStatus: "已取消",
  };
  const c = { ...a, id: "c", shootDate: "2026-11-01" };
  const rows = statementRows([a, b, c], a.partnerId, "2026-10", true);
  assert.equal(rows.length, 2);
  assert.deepEqual(statementTotals(rows), {
    count: 2,
    amount: 0.6,
    travel: 0.4,
    payable: 1,
    paid: 0.2,
    balance: 0.8,
    pendingTravel: 2,
  });
  assert.match(statementCSV(rows, source.partners[0]), /"'=HYPERLINK\(1\)"/);
  assert.match(statementCSV(rows, source.partners[0]), /车费状态/);
  const zero = {
    ...a,
    id: "zero",
    settlementPaid: 0.4,
    settlementDate: "2026-10-08",
  };
  assert.equal(statementRows([zero], a.partnerId, "2026-10", true).length, 1);
  assert.equal(
    statementRows(
      [{ ...zero, travelStatus: "checked" }],
      a.partnerId,
      "2026-10",
      true,
    ).length,
    0,
  );
});
test("微信派单信息包含实际安排、定金约定和未知车费，不泄露内部结算备注", () => {
  const o = {
    ...fresh(),
    address: "测试路1号",
    note: "提前到场",
    paymentNote: "内部付款备注",
  };
  const text = dispatchMessage(o, source.partners[0]);
  for (const value of [
    "测试酒店",
    "水晶厅",
    "09:00",
    "18:00",
    "待补录",
    "¥800",
    "¥200",
    "提前到场",
  ])
    assert.ok(text.includes(value));
  assert.ok(!text.includes("内部付款备注"));
  assert.equal(
    calendarLabel(o, source.partners),
    `${source.partners[0].name}·水晶厅`,
  );
});
const draft = (o = fresh()) => ({
  order: o,
  kind: "new",
  reason: "",
  original: "",
  updatedAt: new Date().toISOString(),
});
test("草稿允许不完整表单，独立存储并可读取、更新和删除", () => {
  const item = draft({ ...blankOrder(), amount: "" });
  const raw = updateDrafts(null, null, item.order.id, item);
  assert.deepEqual(parseDrafts(raw), [item]);
  const next = { ...item, order: { ...item.order, title: "已补主题" } };
  const saved = updateDrafts(raw, raw, item.order.id, next);
  assert.equal(parseDrafts(saved)[0].order.title, "已补主题");
  assert.deepEqual(
    parseDrafts(updateDrafts(saved, saved, item.order.id, null)),
    [],
  );
});
test("草稿合并其他标签不同记录，拒绝同份覆盖、被清空、损坏和超限", () => {
  const a = draft(),
    b = draft(),
    raw = updateDrafts(null, null, a.order.id, a);
  const both = updateDrafts(raw, null, b.order.id, b);
  assert.equal(parseDrafts(both).length, 2);
  assert.throws(() => updateDrafts(both, null, a.order.id, a), /其他页面/);
  assert.throws(() => updateDrafts(null, raw, a.order.id, a), /移除/);
  for (const bad of [
    "",
    "{}",
    "null",
    JSON.stringify({
      version: 1,
      items: [{ ...a, order: { ...a.order, title: 42 } }],
    }),
  ])
    assert.throws(() => updateDrafts(bad, null, a.order.id, a));
  const full = JSON.stringify({
    version: 1,
    items: Array.from({ length: 30 }, () => draft()),
  });
  assert.throws(() => updateDrafts(full, full, a.order.id, a), /30/);
  assert.equal(parseDrafts(full).length, 30);
});
