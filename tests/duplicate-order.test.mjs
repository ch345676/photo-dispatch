import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  duplicateOrder,
  today,
  shiftDate,
  payable,
  paid,
  balance,
  depositStatus,
  settlementStatus,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
  validateOrder,
  validateBackup,
  conflicts,
} from "../src/domain.mjs";

const data = demoData("2026-10-08");

function settledSource() {
  let source = {
    ...data.orders[0],
    id: "duplicate-history-source",
    title: "原品牌发布会",
    type: "活动",
    shootDate: "2026-10-21",
    communicatedDate: "2026-09-21",
    startTime: "09:30",
    endTime: "13:30",
    city: "成都",
    venue: "原活动酒店",
    hall: "3 楼水晶厅",
    address: "原活动街 18 号",
    amount: 800,
    travelAmount: 120,
    travelNote: "原活动往返打车",
    depositRequired: 200,
    depositPaid: 100,
    depositDate: "2026-09-20",
    settlementPaid: 0,
    settlementDate: "",
    dispatchStatus: "已确认",
    executionStatus: "已完成",
    note: "原活动联系人及改期说明",
    paymentNote: "原订单初始累计说明",
    updatedAt: "2026-09-21T08:00:00.000Z",
  };
  source = recordPayment(source, {
    kind: "settlement",
    amount: 50,
    date: "2026-10-21",
    note: "误登记的尾款",
  });
  source = voidPayment(
    source,
    source.paymentLedger.entries[0].id,
    "核对后发现重复登记",
  );
  source = revisePaymentBaseline(
    source,
    {
      depositPaid: 200,
      depositDate: "2026-09-20",
      settlementPaid: 0,
      settlementDate: "",
      note: "初始定金实际为 200 元",
    },
    "补正原先少记的定金",
  );
  return recordPayment(source, {
    kind: "settlement",
    amount: 720,
    date: "2026-10-22",
    note: "原订单结清，含车费",
  });
}

function freezeTree(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

test("已结且有撤销和更正历史的订单，复制后只复用拍摄报价与安排", () => {
  const source = freezeTree(settledSource());
  const before = JSON.stringify(source);
  assert.equal(validateOrder(source, data.partners), "");
  assert.equal(paid(source), 920);
  assert.equal(balance(source), 0);
  assert.equal(source.paymentLedger.revisions.length, 1);
  assert.equal(
    source.paymentLedger.entries.filter((entry) => entry.voidedAt).length,
    1,
  );

  const copy = duplicateOrder(source);
  assert.equal(copy.type, "活动");
  assert.deepEqual(
    [copy.city, copy.venue, copy.hall, copy.address],
    [source.city, source.venue, source.hall, source.address],
  );
  assert.equal(copy.amount, 800);
  assert.equal(copy.depositRequired, 200);
  assert.equal(payable(copy), 800, "原单车费不能混入新单拍摄费");
  assert.equal(paid(copy), 0);
  assert.equal(balance(copy), 800);
  assert.equal(depositStatus(copy), "未付定金");
  assert.equal(settlementStatus(copy), "未结账");
  assert.equal(copy.paymentLedger, undefined);
  assert.deepEqual(
    [
      copy.depositDate,
      copy.settlementDate,
      copy.note,
      copy.paymentNote,
      copy.travelNote,
    ],
    ["", "", "", "", ""],
    "日期、原活动备注和实际报销说明不进入新单",
  );
  assert.equal(JSON.stringify(source), before);
});

test("复制草稿必须重新填写主题和拍摄日期，沟通日期使用今天", () => {
  const source = settledSource();
  const beforeToday = today();
  const copy = duplicateOrder(source);
  assert.ok([beforeToday, today()].includes(copy.communicatedDate));
  assert.notEqual(copy.updatedAt, source.updatedAt);
  assert.ok(Number.isFinite(Date.parse(copy.updatedAt)));
  assert.equal(copy.title, "");
  assert.equal(copy.shootDate, "");
  assert.match(validateOrder(copy, data.partners), /拍摄主题/);
  copy.title = "下一场品牌发布会";
  assert.match(validateOrder(copy, data.partners), /有效的拍摄日期/);
  copy.shootDate = "2026-10-28";
  assert.equal(validateOrder(copy, data.partners), "");
  assert.equal(copy.note, "", "选择新日期不应继承或生成原单的改期备注");
});

test("连续复制生成独立新单，给其中一单登记付款不会带入原流水", () => {
  const source = freezeTree(settledSource());
  const before = JSON.stringify(source);
  const first = duplicateOrder(source);
  const second = duplicateOrder(source);
  assert.equal(new Set([source.id, first.id, second.id]).size, 3);

  first.title = "独立新活动";
  first.shootDate = "2026-10-28";
  first.note = "仅属于第一份新单";
  const paidCopy = recordPayment(first, {
    kind: "deposit",
    amount: 50,
    date: "2026-10-08",
    note: "新单第一笔定金",
  });
  assert.equal(validateOrder(paidCopy, data.partners), "");
  assert.equal(paid(paidCopy), 50);
  assert.equal(balance(paidCopy), 750);
  assert.equal(paidCopy.paymentLedger.baseline.depositPaid, 0);
  assert.equal(paidCopy.paymentLedger.baseline.settlementPaid, 0);
  assert.equal(paidCopy.paymentLedger.entries.length, 1);
  assert.equal(paidCopy.paymentLedger.revisions.length, 0);
  assert.equal(second.title, "");
  assert.equal(second.note, "");
  assert.equal(paid(second), 0);
  assert.equal(second.paymentLedger, undefined);
  assert.equal(JSON.stringify(source), before);
});

test("复制单重新选回原日期会与原单冲突，改日或相邻时段可独立安排", () => {
  const source = settledSource();
  const copy = {
    ...duplicateOrder(source),
    title: "同伙伴的新活动",
    shootDate: source.shootDate,
  };
  assert.equal(validateOrder(copy, data.partners), "");
  assert.deepEqual(
    conflicts(copy, [source]).map((order) => order.id),
    [source.id],
    "复制来源不能被当成自身而跳过冲突检查",
  );
  assert.equal(
    conflicts({ ...copy, shootDate: shiftDate(source.shootDate, 1) }, [source])
      .length,
    0,
  );
  assert.equal(
    conflicts({ ...copy, startTime: source.endTime, endTime: "18:00" }, [
      source,
    ]).length,
    0,
  );
});

test("取消、拒绝和完成的来源都恢复为待确认待拍摄，不继承免结账状态", () => {
  for (const [dispatchStatus, executionStatus] of [
    ["已取消", "已取消"],
    ["已拒绝", "待拍摄"],
    ["已确认", "已完成"],
  ]) {
    const source = {
      ...data.orders[0],
      amount: 0,
      travelAmount: 0,
      depositRequired: 0,
      depositPaid: 0,
      depositDate: "",
      settlementPaid: 0,
      settlementDate: "",
      settlementExempt: true,
      dispatchStatus,
      executionStatus,
    };
    const copy = {
      ...duplicateOrder(source),
      title: "恢复正常报价的新单",
      shootDate: shiftDate(source.shootDate, 1),
      amount: 800,
      depositRequired: 200,
    };
    assert.equal(copy.dispatchStatus, "待确认", dispatchStatus);
    assert.equal(copy.executionStatus, "待拍摄", executionStatus);
    assert.equal(copy.settlementExempt, false);
    assert.equal(validateOrder(copy, data.partners), "");
    assert.equal(balance(copy), 800);
    assert.equal(
      conflicts(copy, [{ ...copy, id: "another-active-order" }]).length,
      1,
    );
  }
});

test("没有车费字段的旧订单仍可复制，原订单结构不被补写或修改", () => {
  const legacy = {
    ...data.orders[0],
    amount: 800,
    depositRequired: 200,
    depositPaid: 200,
  };
  delete legacy.travelAmount;
  delete legacy.travelNote;
  const before = JSON.stringify(legacy);
  const copy = {
    ...duplicateOrder(freezeTree(legacy)),
    title: "旧记录复制的新活动",
    shootDate: shiftDate(legacy.shootDate, 1),
  };
  assert.equal(copy.travelAmount, 0);
  assert.equal(copy.travelNote, "");
  assert.equal(payable(copy), 800);
  assert.equal(validateOrder(copy, data.partners), "");
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(Object.hasOwn(legacy, "travelAmount"), false);
});

test("原单和新单一同备份恢复，保留原付款历史且新单仍为未付款", () => {
  const source = settledSource();
  const before = JSON.stringify(source);
  const copy = {
    ...duplicateOrder(source),
    title: "备份中的独立新单",
    shootDate: shiftDate(source.shootDate, 7),
  };
  const exported = JSON.parse(
    JSON.stringify({ ...data, orders: [source, copy] }),
  );
  const restored = validateBackup(exported);
  assert.equal(restored.orders.length, 2);
  assert.deepEqual(restored.orders[0], source);
  assert.deepEqual(restored.orders[1], copy);
  assert.equal(paid(restored.orders[0]), 920);
  assert.equal(restored.orders[0].paymentLedger.revisions.length, 1);
  assert.equal(paid(restored.orders[1]), 0);
  assert.equal(restored.orders[1].paymentLedger, undefined);
  assert.equal(balance(restored.orders[1]), 800);
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(restored))),
    restored,
  );
  assert.equal(JSON.stringify(source), before);
});
