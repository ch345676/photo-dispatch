import {
  active,
  cents,
  payable,
  paid,
  balance,
  money,
  travelState,
  TRAVEL_STATES,
  conflicts,
  validateBackup,
  uid,
} from "./domain.mjs";

export const scheduleChanged = (before, after) =>
  ["shootDate", "startTime", "endTime"].some(
    (key) => before[key] !== after[key],
  );
export function withScheduleHistory(before, after, reason) {
  if (!before || !scheduleChanged(before, after)) return after;
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 500
  )
    throw new Error("请填写改期原因（最多 500 字）");
  const point = (order) => ({
    date: order.shootDate,
    start: order.startTime,
    end: order.endTime,
  });
  return {
    ...after,
    ...(active(after)
      ? { dispatchStatus: "已改期", executionStatus: "已改期" }
      : {}),
    scheduleHistory: [
      ...(before.scheduleHistory || []),
      {
        id: uid(),
        from: point(before),
        to: point(after),
        reason: reason.trim(),
        recordedAt: new Date().toISOString(),
      },
    ],
  };
}
export function moveToTrash(data, order) {
  const current = data.orders.find((o) => o.id === order.id);
  if (!current || JSON.stringify(current) !== JSON.stringify(order))
    throw new Error("订单已变化，请重新打开后删除");
  return validateBackup({
    ...data,
    orders: data.orders.filter((o) => o.id !== order.id),
    trash: [
      ...(data.trash || []),
      { order: structuredClone(current), deletedAt: new Date().toISOString() },
    ],
  });
}
export function restoreOrder(data, id) {
  const entry = (data.trash || []).find((e) => e.order.id === id);
  if (!entry) throw new Error("回收站记录已变化，请重新查看");
  if (data.orders.some((o) => o.id === id))
    throw new Error("当前订单中已有同编号记录，不能重复恢复");
  const clash = conflicts(entry.order, data.orders);
  if (clash.length)
    throw new Error(`恢复后会与「${clash[0].title}」冲突，请先调整现有档期`);
  return validateBackup({
    ...data,
    orders: [
      ...data.orders,
      { ...entry.order, updatedAt: new Date().toISOString() },
    ],
    trash: data.trash.filter((e) => e.order.id !== id),
  });
}
export function statementRows(orders, partnerId, month, onlyUnpaid = false) {
  return orders
    .filter(
      (o) =>
        o.partnerId === partnerId &&
        (!month || o.shootDate.startsWith(month)) &&
        (!onlyUnpaid || balance(o) > 0 || travelState(o) === "pending"),
    )
    .sort(
      (a, b) =>
        a.shootDate.localeCompare(b.shootDate) ||
        a.startTime.localeCompare(b.startTime),
    );
}
export function statementTotals(rows) {
  const total = (fn) => rows.reduce((sum, o) => sum + cents(fn(o)), 0) / 100;
  return {
    count: rows.length,
    amount: total((o) => o.amount),
    travel: total((o) => o.travelAmount || 0),
    payable: total(payable),
    paid: total(paid),
    balance: total(balance),
    pendingTravel: rows.filter((o) => travelState(o) === "pending").length,
  };
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function statementCSV(rows, partner) {
  const values = [
    [
      "伙伴",
      "拍摄日期",
      "主题",
      "时段",
      "城市",
      "场地",
      "宴会厅",
      "拍摄费",
      "车费",
      "车费状态",
      "应付合计",
      "已付定金",
      "已付尾款",
      "已付合计",
      "待结金额",
      "派单状态",
      "执行状态",
    ],
    ...rows.map((o) => [
      partner?.name || "",
      o.shootDate,
      o.title,
      `${o.startTime}-${o.endTime}`,
      o.city,
      o.venue,
      o.hall,
      o.amount,
      o.travelAmount || 0,
      TRAVEL_STATES[travelState(o)],
      payable(o),
      o.depositPaid,
      o.settlementPaid,
      paid(o),
      balance(o),
      o.dispatchStatus,
      o.executionStatus,
    ]),
  ];
  return (
    "\ufeff" + values.map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
export function dispatchMessage(order, partner) {
  return [
    `【摄影派单】${order.title}`,
    `伙伴：${partner?.name || "待安排"}`,
    `拍摄：${order.shootDate} ${order.startTime}–${order.endTime}`,
    `场地：${order.city} · ${order.venue} · ${order.hall}`,
    order.address && `地址：${order.address}`,
    `拍摄费：¥${money(order.amount)}`,
    `车费：${travelState(order) === "pending" ? `待补录 / 核对（已录 ¥${money(order.travelAmount || 0)}）` : travelState(order) === "none" ? "无需报销" : `¥${money(order.travelAmount || 0)}，已核对`}`,
    order.travelNote && `车费约定：${order.travelNote}`,
    `约定定金：¥${money(order.depositRequired)}`,
    `派单状态：${order.dispatchStatus} · ${order.executionStatus}`,
    order.note && `注意事项：${order.note}`,
    "请核对时间、地点和费用后回复确认。",
  ]
    .filter(Boolean)
    .join("\n");
}
export function calendarLabel(order, partners) {
  const name = partners.find((p) => p.id === order.partnerId)?.name || "待安排";
  return `${name}·${order.hall || order.venue}`;
}
