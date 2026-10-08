import { cents, paymentLedger, currentBaseline } from "./domain.mjs";

export function paymentRecords(orders) {
  const rows = [];
  for (const order of orders) {
    const ledger = paymentLedger(order);
    const baseline = currentBaseline(ledger);
    for (const kind of ["deposit", "settlement"]) {
      if (baseline[kind + "Paid"] > 0) {
        rows.push({
          id: JSON.stringify([order.id, "baseline", kind]),
          orderId: order.id,
          partnerId: order.partnerId,
          kind,
          source: "baseline",
          date: baseline[kind + "Date"],
          amount: baseline[kind + "Paid"],
          note: baseline.note,
        });
      }
    }
    for (const entry of ledger.entries) {
      if (entry.voidedAt) continue;
      rows.push({
        id: JSON.stringify([order.id, "entry", entry.id]),
        orderId: order.id,
        partnerId: order.partnerId,
        kind: entry.kind,
        source: "entry",
        date: entry.date,
        amount: entry.amount,
        note: entry.note,
      });
    }
  }
  return rows;
}

export function summarizePayments(rows) {
  let total = 0;
  let deposit = 0;
  let settlement = 0;
  let baselineTotal = 0;
  let entryTotal = 0;
  let entryCount = 0;
  let baselineCount = 0;
  const orderIds = new Set();
  for (const row of rows) {
    const amount = cents(row.amount);
    total += amount;
    if (row.kind === "deposit") deposit += amount;
    else settlement += amount;
    if (row.source === "baseline") {
      baselineTotal += amount;
      baselineCount += 1;
    } else {
      entryTotal += amount;
      entryCount += 1;
    }
    orderIds.add(row.orderId);
  }
  return {
    total: total / 100,
    deposit: deposit / 100,
    settlement: settlement / 100,
    baselineTotal: baselineTotal / 100,
    entryTotal: entryTotal / 100,
    entryCount,
    baselineCount,
    orderCount: orderIds.size,
  };
}

export function paymentReportCSV(rows, orders, partners) {
  const orderMap = new Map(orders.map((order) => [order.id, order]));
  const partnerMap = new Map(partners.map((partner) => [partner.id, partner]));
  const headers = [
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
  ];
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const records = rows.map((row) => {
    const order = orderMap.get(row.orderId);
    return [
      row.date,
      row.source === "baseline" ? "历史累计" : "逐笔付款",
      row.kind === "deposit" ? "定金" : "尾款",
      row.amount,
      partnerMap.get(row.partnerId)?.name,
      row.orderId,
      order?.title,
      order?.shootDate,
      order?.city,
      order?.venue,
      order?.hall,
      order?.dispatchStatus,
      order?.executionStatus,
      row.note,
    ];
  });
  return (
    "\uFEFF" +
    [headers, ...records].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
