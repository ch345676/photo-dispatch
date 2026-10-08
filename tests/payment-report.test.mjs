import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  validateBackup,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
  paid,
  cents,
} from "../src/domain.mjs";
import {
  paymentRecords,
  summarizePayments,
  paymentReportCSV,
} from "../src/payment-report.mjs";

const data = demoData("2026-10-08");
const legacy = (patch = {}) => ({
  ...data.orders[0],
  id: "report-order",
  shootDate: "2026-12-21",
  communicatedDate: "2026-08-01",
  amount: 1000,
  travelAmount: 100,
  travelNote: "订单整体车费，未拆分至每笔付款",
  depositRequired: 400,
  depositPaid: 200,
  depositDate: "2026-08-28",
  settlementPaid: 100,
  settlementDate: "2026-09-02",
  paymentNote: "此前仅记录累计金额",
  ...patch,
});
const payment = (kind, amount, date, note = "") => ({
  kind,
  amount,
  date,
  note,
});
const validated = (orders, partners = data.partners) =>
  validateBackup({ ...data, orders, partners });

function historyOrder() {
  let order = recordPayment(
    legacy(),
    payment("deposit", 100, "2026-09-05", "补付定金"),
  );
  order = recordPayment(
    order,
    payment("settlement", 150, "2026-10-03", "十月付款"),
  );
  order = recordPayment(
    order,
    payment("settlement", 50, "2026-09-15", "误登记"),
  );
  order = voidPayment(order, order.paymentLedger.entries[2].id, "重复登记");
  order = revisePaymentBaseline(
    order,
    {
      depositPaid: 250,
      depositDate: "2026-08-30",
      settlementPaid: 80,
      settlementDate: "2026-09-01",
      note: "核对后的历史累计",
    },
    "原累计金额和日期有误",
  );
  return recordPayment(
    order,
    payment("settlement", 30, "2026-09-25", "晚录入的九月付款"),
  );
}

function freezeTree(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function readCSV(csv) {
  const text = csv.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && text[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

test("付款月份按实际日期归属，补录日期不被登记顺序或拍摄月份覆盖", () => {
  const order = historyOrder();
  const orders = validated([order]).orders;
  const rows = paymentRecords(orders);
  assert.equal(rows.length, 5);
  assert.equal(rows.filter((row) => row.date.startsWith("2026-12")).length, 0);
  assert.equal(
    summarizePayments(rows.filter((row) => row.date.startsWith("2026-08")))
      .total,
    250,
  );
  assert.equal(
    summarizePayments(rows.filter((row) => row.date.startsWith("2026-09")))
      .total,
    210,
  );
  assert.equal(
    summarizePayments(rows.filter((row) => row.date.startsWith("2026-10")))
      .total,
    150,
  );
  assert.deepEqual(summarizePayments(rows), {
    total: 610,
    deposit: 350,
    settlement: 260,
    baselineTotal: 330,
    entryTotal: 280,
    entryCount: 3,
    baselineCount: 2,
    orderCount: 1,
  });
  const lateEntry = rows.find((row) => row.note === "晚录入的九月付款");
  assert.equal(lateEntry.date, "2026-09-25");
  assert.equal(
    rows.some((row) => row.note === "误登记"),
    false,
  );
});

test("最新更正替换旧累计，撤销及更正记录不作为新的资金流重复相加", () => {
  let order = historyOrder();
  order = revisePaymentBaseline(
    order,
    {
      depositPaid: 0,
      depositDate: "",
      settlementPaid: 40,
      settlementDate: "2026-09-08",
      note: "再次核对后的累计",
    },
    "以最新核对结果为准",
  );
  const rows = paymentRecords(validated([order]).orders);
  assert.deepEqual(
    rows
      .filter((row) => row.source === "baseline")
      .map((row) => ({
        kind: row.kind,
        date: row.date,
        amount: row.amount,
        note: row.note,
      })),
    [
      {
        kind: "settlement",
        date: "2026-09-08",
        amount: 40,
        note: "再次核对后的累计",
      },
    ],
  );
  assert.equal(rows.length, 4);
  assert.equal(summarizePayments(rows).total, 320);
  assert.equal(summarizePayments(rows).total, paid(order));
  assert.equal(
    rows.some((row) => row.date === "2026-08-28" || row.date === "2026-08-30"),
    false,
  );
  const depositEntry = order.paymentLedger.entries.find(
    (entry) => entry.kind === "deposit",
  );
  const voided = voidPayment(order, depositEntry.id, "该笔定金记错订单");
  assert.equal(summarizePayments(paymentRecords([voided])).total, 220);
});

test("无流水旧记录按历史累计展示，兼容v1并且不虚构单笔付款", () => {
  const oldOrder = legacy();
  delete oldOrder.travelAmount;
  delete oldOrder.travelNote;
  const oldData = { ...data, version: 1, orders: [oldOrder] };
  const before = JSON.stringify(oldData);
  const restored = validateBackup(oldData);
  const rows = paymentRecords(restored.orders);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.source === "baseline"));
  assert.deepEqual(
    rows.map((row) => [row.kind, row.date, row.amount]),
    [
      ["deposit", "2026-08-28", 200],
      ["settlement", "2026-09-02", 100],
    ],
  );
  assert.deepEqual(summarizePayments(rows), {
    total: 300,
    deposit: 200,
    settlement: 100,
    baselineTotal: 300,
    entryTotal: 0,
    entryCount: 0,
    baselineCount: 2,
    orderCount: 1,
  });
  assert.equal(restored.orders[0].paymentLedger, undefined);
  assert.equal(JSON.stringify(oldData), before);
});

test("所有状态的付款均保留，全记录合计等于累计已付且不改写订单和流水", () => {
  const orders = validated([
    historyOrder(),
    legacy({
      id: "cancelled",
      dispatchStatus: "已取消",
      executionStatus: "已取消",
    }),
    legacy({ id: "rejected", dispatchStatus: "已拒绝" }),
    legacy({
      id: "unpaid",
      depositPaid: 0,
      depositDate: "",
      settlementPaid: 0,
      settlementDate: "",
    }),
  ]).orders;
  freezeTree(orders);
  const before = JSON.stringify(orders);
  const rows = paymentRecords(orders);
  assert.equal(rows.filter((row) => row.orderId === "cancelled").length, 2);
  assert.equal(rows.filter((row) => row.orderId === "rejected").length, 2);
  assert.equal(rows.filter((row) => row.orderId === "unpaid").length, 0);
  const summary = summarizePayments(rows);
  assert.equal(summary.total, 1210);
  assert.equal(
    summary.total,
    orders.reduce((total, order) => total + cents(paid(order)), 0) / 100,
  );
  assert.equal(summary.orderCount, 3);
  assert.equal(JSON.stringify(orders), before);
  assert.deepEqual(paymentRecords(orders), rows);
});

test("分币汇总同时区分历史与逐笔，空列表返回零值和仅表头CSV", () => {
  let precise = legacy({
    amount: 0.3,
    travelAmount: 0,
    depositRequired: 0.1,
    depositPaid: 0,
    depositDate: "",
    settlementPaid: 0,
    settlementDate: "",
  });
  precise = recordPayment(precise, payment("deposit", 0.1, "2026-10-01"));
  precise = recordPayment(precise, payment("settlement", 0.2, "2026-10-02"));
  const tiny = legacy({
    id: "tiny",
    amount: 0.03,
    travelAmount: 0,
    depositRequired: 0.01,
    depositPaid: 0.01,
    settlementPaid: 0.02,
  });
  const rows = paymentRecords(validated([precise, tiny]).orders);
  assert.deepEqual(summarizePayments(rows), {
    total: 0.33,
    deposit: 0.11,
    settlement: 0.22,
    baselineTotal: 0.03,
    entryTotal: 0.3,
    entryCount: 2,
    baselineCount: 2,
    orderCount: 2,
  });
  assert.deepEqual(paymentRecords([]), []);
  assert.deepEqual(summarizePayments([]), {
    total: 0,
    deposit: 0,
    settlement: 0,
    baselineTotal: 0,
    entryTotal: 0,
    entryCount: 0,
    baselineCount: 0,
    orderCount: 0,
  });
  const csv = paymentReportCSV([], [], []);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(readCSV(csv).length, 1);
  assert.equal(readCSV(csv)[0].length, 14);
});

test("记录ID不依赖排序且能区分订单与流水中带分隔符的合法ID", () => {
  const makeOrder = (id, entryId) => {
    const current = recordPayment(
      legacy({
        id,
        depositPaid: 0,
        depositDate: "",
        settlementPaid: 0,
        settlementDate: "",
      }),
      payment("settlement", 10, "2026-10-08"),
    );
    return {
      ...current,
      paymentLedger: {
        ...current.paymentLedger,
        entries: current.paymentLedger.entries.map((entry) => ({
          ...entry,
          id: entryId,
        })),
      },
    };
  };
  const orders = validated([
    makeOrder("a:entry:b", "c"),
    makeOrder("a", "b:entry:c"),
  ]).orders;
  const rows = paymentRecords(orders);
  const reversed = paymentRecords([...orders].reverse());
  assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  assert.deepEqual(
    new Map(reversed.map((row) => [row.orderId, row.id])),
    new Map(rows.map((row) => [row.orderId, row.id])),
  );
  const originals = paymentRecords([historyOrder()]);
  assert.equal(new Set(originals.map((row) => row.id)).size, originals.length);
});

test("CSV严格复用筛选行及顺序，不重复车费应付，转义公式、逗号、换行和引号", () => {
  const title = '=SUM(1,2)\n"婚礼"';
  const partnerName = '\t+摄影师,"张"';
  const city = " \t-重庆";
  const venue = "酒店,东区\n二号楼";
  const hall = '3楼"水晶厅"';
  const historyNote = '累计备注,含"引号"\n第二行';
  const entryNote = "\r\n@付款备注";
  const partners = data.partners.map((partner, index) =>
    index === 0 ? { ...partner, name: partnerName } : partner,
  );
  let current = legacy({
    title,
    city,
    venue,
    hall,
    settlementDate: "2026-10-02",
    paymentNote: historyNote,
  });
  current = recordPayment(
    current,
    payment("settlement", 50, "2026-10-05", entryNote),
  );
  const backup = freezeTree(validated([current], partners));
  const before = JSON.stringify(backup);
  const allRows = paymentRecords(backup.orders);
  const selected = freezeTree(
    allRows.filter((row) => row.date.startsWith("2026-10")).reverse(),
  );
  const selectedBefore = JSON.stringify(selected);
  const csv = paymentReportCSV(selected, backup.orders, backup.partners);
  const [headers, ...records] = readCSV(csv);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(headers, [
    "付款日期",
    "记录来源",
    "款项类型",
    "本条金额",
    "伙伴",
    "订单编号",
    "拍摄主题",
    "拍摄日期",
    "城市",
    "场地",
    "展厅",
    "派单状态",
    "执行状态",
    "付款备注",
  ]);
  assert.equal(records.length, selected.length);
  assert.deepEqual(
    records.map((row) => [row[0], Number(row[3])]),
    selected.map((row) => [row.date, row.amount]),
  );
  assert.equal(
    records.reduce((sum, row) => sum + cents(Number(row[3])), 0) / 100,
    summarizePayments(selected).total,
  );
  assert.equal(summarizePayments(selected).total, 150);
  assert.deepEqual(
    records.map((row) => row[1]),
    ["逐笔付款", "历史累计"],
  );
  for (const row of records) {
    assert.equal(row.length, 14);
    assert.equal(row[4], "'" + partnerName);
    assert.equal(row[6], "'" + title);
    assert.equal(row[8], "'" + city);
    assert.equal(row[9], venue);
    assert.equal(row[10], hall);
  }
  assert.equal(records[0][13], "'" + entryNote);
  assert.equal(records[1][13], historyNote);
  assert.equal(
    headers.some((header) => /车费|应付/.test(header)),
    false,
  );
  assert.equal(JSON.stringify(backup), before);
  assert.equal(JSON.stringify(selected), selectedBefore);
});

test("CSV防公式对四种起始符及前导空白一致生效，普通备注不被篡改", () => {
  const orders = [legacy()];
  const base = paymentRecords(orders)[0];
  for (const prefix of ["", " ", "\t", "\r\n", "\u00A0"]) {
    for (const operator of ["=", "+", "@", "-"]) {
      const note = prefix + operator + '测试,"内容"\n备注';
      const rows = [{ ...base, note }];
      assert.equal(
        readCSV(paymentReportCSV(rows, orders, data.partners))[1][13],
        "'" + note,
      );
      assert.equal(rows[0].note, note);
    }
  }
  const ordinary = "  现金付款,含车费\n收款人已确认";
  assert.equal(
    readCSV(
      paymentReportCSV([{ ...base, note: ordinary }], orders, data.partners),
    )[1][13],
    ordinary,
  );
});
