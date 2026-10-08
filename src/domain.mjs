export const VERSION = 3;
export const TRAVEL_STATES = {
  none: "无需报销",
  pending: "待补车费",
  checked: "已核对",
};
export const travelState = (o) =>
  o.travelStatus ?? ((o.travelAmount || 0) > 0 ? "checked" : "none");
export const TYPES = ["婚庆", "活动", "其他"];
export const DISPATCH = ["待确认", "已确认", "已拒绝", "已改期", "已取消"];
export const EXECUTION = ["待拍摄", "已完成", "已取消", "已改期"];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const shiftDate = (date, days) => {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const money = (n) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(n || 0);
export const cents = (n) => Math.round(Number(n) * 100);
export const payable = (o) =>
  (cents(o.amount) + cents(o.travelAmount || 0)) / 100;
export const paid = (o) =>
  (cents(o.depositPaid) + cents(o.settlementPaid)) / 100;
export const balance = (o) =>
  o.settlementExempt
    ? 0
    : Math.max(0, (cents(payable(o)) - cents(paid(o))) / 100);
export const depositStatus = (o) =>
  !o.depositRequired
    ? "无需定金"
    : !o.depositPaid
      ? "未付定金"
      : cents(o.depositPaid) >= cents(o.depositRequired)
        ? "已付定金"
        : "部分定金";
export const settlementStatus = (o) =>
  travelState(o) === "pending" && !balance(o)
    ? "待核车费"
    : o.settlementExempt || !payable(o)
      ? "无需结账"
      : !balance(o)
        ? "已结账"
        : !o.settlementPaid
          ? "未结账"
          : "部分结账";
export const active = (o) =>
  !["已取消", "已拒绝"].includes(o.dispatchStatus) &&
  o.executionStatus !== "已取消";
export const uid = () => crypto.randomUUID();
export const emptyData = () => ({
  version: VERSION,
  orders: [],
  trash: [],
  partners: [],
  venues: [],
  settings: {
    before3: true,
    before1: true,
    unconfirmed: true,
    deposit: true,
    settlement: true,
    changes: true,
  },
});
export function blankOrder(date = today()) {
  return {
    id: uid(),
    title: "",
    type: "婚庆",
    shootDate: date,
    startTime: "09:00",
    endTime: "18:00",
    communicatedDate: today(),
    partnerId: "",
    city: "重庆",
    venue: "",
    hall: "",
    address: "",
    amount: 0,
    travelAmount: 0,
    travelNote: "",
    depositRequired: 0,
    depositPaid: 0,
    depositDate: "",
    settlementPaid: 0,
    settlementDate: "",
    settlementExempt: false,
    dispatchStatus: "待确认",
    executionStatus: "待拍摄",
    note: "",
    paymentNote: "",
    updatedAt: new Date().toISOString(),
  };
}
export function duplicateOrder(source) {
  // Start fresh so future history and payment fields cannot leak into a new job.
  return {
    ...blankOrder(""),
    type: source.type,
    startTime: source.startTime,
    endTime: source.endTime,
    partnerId: source.partnerId,
    city: source.city,
    venue: source.venue,
    hall: source.hall,
    address: source.address,
    amount: source.amount,
    depositRequired: source.depositRequired,
  };
}
const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(new Date(v + "T12:00:00")) &&
  shiftDate(v, 0) === v;
const validTime = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const validAmount = (v, max = 2e8) =>
  typeof v === "number" &&
  Number.isFinite(v) &&
  v >= 0 &&
  v <= max &&
  Math.abs(v * 100 - Math.round(v * 100)) < 0.0001;
const validStamp = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
const snapshotFields = [
  "depositPaid",
  "depositDate",
  "settlementPaid",
  "settlementDate",
  "note",
];
function baselineError(b) {
  if (
    !b ||
    !validAmount(b.depositPaid, 1e8) ||
    !validAmount(b.settlementPaid) ||
    typeof b.note !== "string" ||
    b.note.length > 2000 ||
    typeof b.depositDate !== "string" ||
    typeof b.settlementDate !== "string"
  )
    return "初始付款累计格式无效";
  if (
    (b.depositDate && !validDate(b.depositDate)) ||
    (b.settlementDate && !validDate(b.settlementDate)) ||
    (b.depositPaid > 0 && !b.depositDate) ||
    (b.settlementPaid > 0 && !b.settlementDate)
  )
    return "初始付款累计缺少有效日期";
  return "";
}
export function paymentLedger(o) {
  return (
    o.paymentLedger || {
      baseline: {
        depositPaid: o.depositPaid,
        depositDate: o.depositDate,
        settlementPaid: o.settlementPaid,
        settlementDate: o.settlementDate,
        note: o.paymentNote,
      },
      entries: [],
      revisions: [],
    }
  );
}
export const currentBaseline = (ledger) =>
  ledger.revisions.length
    ? ledger.revisions[ledger.revisions.length - 1].value
    : ledger.baseline;
export function ledgerTotals(ledger) {
  const base = currentBaseline(ledger);
  const result = {};
  for (const kind of ["deposit", "settlement"]) {
    const entries = ledger.entries.filter(
      (e) => e.kind === kind && !e.voidedAt,
    );
    const total =
      (cents(base[kind + "Paid"]) +
        entries.reduce((sum, e) => sum + cents(e.amount), 0)) /
      100;
    const dates = [
      ...(base[kind + "Paid"] > 0 ? [base[kind + "Date"]] : []),
      ...entries.map((e) => e.date),
    ];
    result[kind + "Paid"] = total;
    result[kind + "Date"] = total ? dates.sort().at(-1) || "" : "";
  }
  return result;
}
export function validateLedger(o) {
  if (o.paymentLedger === undefined) return "";
  const l = o.paymentLedger;
  if (
    !l ||
    !Array.isArray(l.entries) ||
    !Array.isArray(l.revisions) ||
    l.entries.length > 5000 ||
    l.revisions.length > 1000
  )
    return "付款流水格式或记录数量无效";
  const baseError = baselineError(l.baseline);
  if (baseError) return baseError;
  const ids = new Set();
  for (const e of [...l.entries, ...l.revisions]) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !e.id ||
      ids.has(e.id) ||
      !validStamp(e.recordedAt)
    )
      return "付款记录编号重复或记录时间无效";
    ids.add(e.id);
  }
  for (const e of l.entries) {
    if (
      !["deposit", "settlement"].includes(e.kind) ||
      !validAmount(e.amount) ||
      e.amount <= 0 ||
      !validDate(e.date) ||
      typeof e.note !== "string" ||
      e.note.length > 2000 ||
      typeof e.voidedAt !== "string" ||
      typeof e.voidReason !== "string" ||
      e.voidReason.length > 500
    )
      return "单笔付款记录无效";
    if (
      e.voidedAt
        ? !validStamp(e.voidedAt) ||
          !e.voidReason.trim() ||
          Date.parse(e.voidedAt) < Date.parse(e.recordedAt)
        : e.voidReason !== ""
    )
      return "撤销记录缺少有效时间或原因";
  }
  for (const r of l.revisions) {
    if (
      baselineError(r.value) ||
      typeof r.reason !== "string" ||
      !r.reason.trim() ||
      r.reason.length > 500
    )
      return "初始累计更正记录无效";
  }
  const totals = ledgerTotals(l);
  if (
    ["depositPaid", "settlementPaid"].some(
      (k) => cents(o[k]) !== cents(totals[k]),
    ) ||
    ["depositDate", "settlementDate"].some((k) => o[k] !== totals[k])
  )
    return "付款累计金额或日期与流水不一致，请核对备份";
  return "";
}
function withLedger(o, ledger) {
  const updated = { ...o, paymentLedger: ledger, ...ledgerTotals(ledger) };
  const error = validateLedger(updated);
  if (error) throw new Error(error);
  if (
    updated.depositPaid > updated.depositRequired ||
    cents(paid(updated)) > cents(payable(updated))
  )
    throw new Error("更正后的付款超过约定定金或应付金额");
  return updated;
}
export function recordPayment(o, input) {
  if (
    !["deposit", "settlement"].includes(input.kind) ||
    !validAmount(input.amount) ||
    input.amount <= 0 ||
    !validDate(input.date) ||
    typeof input.note !== "string" ||
    input.note.length > 2000
  )
    throw new Error("请填写有效的付款类型、金额、日期与备注");
  const available =
    input.kind === "deposit"
      ? Math.min(
          balance(o),
          (cents(o.depositRequired) - cents(o.depositPaid)) / 100,
        )
      : balance(o);
  if (cents(input.amount) > cents(available))
    throw new Error("本次付款超过剩余应付金额");
  const ledger = paymentLedger(o);
  return withLedger(o, {
    ...ledger,
    entries: [
      ...ledger.entries,
      {
        id: uid(),
        kind: input.kind,
        amount: input.amount,
        date: input.date,
        note: input.note,
        recordedAt: new Date().toISOString(),
        voidedAt: "",
        voidReason: "",
      },
    ],
  });
}
export function voidPayment(o, entryId, reason) {
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500)
    throw new Error("请填写撤销原因（最多 500 字）");
  const ledger = paymentLedger(o);
  const entry = ledger.entries.find((e) => e.id === entryId);
  if (!entry || entry.voidedAt) throw new Error("这笔付款不存在或已撤销");
  return withLedger(o, {
    ...ledger,
    entries: ledger.entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            voidedAt: new Date().toISOString(),
            voidReason: reason.trim(),
          }
        : e,
    ),
  });
}
export function revisePaymentBaseline(o, value, reason) {
  const error = baselineError(value);
  if (error) throw new Error(error);
  if (typeof reason !== "string" || !reason.trim() || reason.length > 500)
    throw new Error("请填写更正原因（最多 500 字）");
  const ledger = paymentLedger(o);
  const cleanValue = Object.fromEntries(
    snapshotFields.map((k) => [k, value[k]]),
  );
  const base = currentBaseline(ledger);
  if (snapshotFields.every((k) => base[k] === cleanValue[k]))
    throw new Error("初始累计没有变化，无需更正");
  return withLedger(o, {
    ...ledger,
    revisions: [
      ...ledger.revisions,
      {
        id: uid(),
        value: cleanValue,
        reason: reason.trim(),
        recordedAt: new Date().toISOString(),
      },
    ],
  });
}
export function validateOrder(o, partners) {
  if (!o.title?.trim()) return "请填写拍摄主题";
  if (!partners.some((p) => p.id === o.partnerId))
    return "请选择一位伙伴，或先添加伙伴";
  if (!validDate(o.shootDate) || !validDate(o.communicatedDate))
    return "请填写有效的拍摄日期和派单沟通日期";
  if (
    !validTime(o.startTime) ||
    !validTime(o.endTime) ||
    o.endTime <= o.startTime
  )
    return "结束时间应晚于开始时间；跨天拍摄请按天建单";
  if (!o.city?.trim() || !o.venue?.trim() || !o.hall?.trim())
    return "请完整填写城市、场地和展厅 / 宴会厅";
  if (
    ![o.amount, o.travelAmount ?? 0, o.depositRequired, o.depositPaid].every(
      (v) =>
        typeof v === "number" &&
        Number.isFinite(v) &&
        v >= 0 &&
        v <= 1e8 &&
        Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
    ) ||
    !validAmount(o.settlementPaid)
  )
    return "金额应为非负数，最多两位小数";
  if (cents(o.depositRequired) > cents(o.amount))
    return "约定定金不能超过派单金额";
  if (cents(o.depositPaid) > cents(o.depositRequired))
    return "已付定金不能超过约定定金";
  if (cents(paid(o)) > cents(payable(o)))
    return "已付定金与尾款合计不能超过应付金额（含车费）";
  if (o.depositPaid > 0 && !validDate(o.depositDate))
    return "请填写定金支付日期";
  if (o.settlementPaid > 0 && !validDate(o.settlementDate))
    return "请填写尾款支付日期";
  if (o.settlementExempt && payable(o) !== 0)
    return "无需结账仅用于应付金额（含车费）为 0 的订单";
  if (
    !TYPES.includes(o.type) ||
    !DISPATCH.includes(o.dispatchStatus) ||
    !EXECUTION.includes(o.executionStatus)
  )
    return "订单状态无效";
  if (o.dispatchStatus === "已取消" && o.executionStatus !== "已取消")
    return "已取消派单的执行状态也应为已取消";
  if (!Object.hasOwn(TRAVEL_STATES, travelState(o))) return "车费状态无效";
  if (travelState(o) === "none" && (o.travelAmount || 0) > 0)
    return "已有车费金额，请选择已核对或待补车费";
  if (o.scheduleHistory !== undefined) {
    if (!Array.isArray(o.scheduleHistory) || o.scheduleHistory.length > 500)
      return "改期记录格式或数量无效";
    const ids = new Set();
    let lastPoint;
    for (const h of o.scheduleHistory) {
      if (
        !h ||
        typeof h.id !== "string" ||
        !h.id ||
        ids.has(h.id) ||
        !validStamp(h.recordedAt) ||
        typeof h.reason !== "string" ||
        !h.reason.trim() ||
        h.reason.length > 500
      )
        return "改期记录缺少有效原因或时间";
      ids.add(h.id);
      for (const v of [h.from, h.to])
        if (
          !v ||
          !validDate(v.date) ||
          !validTime(v.start) ||
          !validTime(v.end) ||
          v.end <= v.start
        )
          return "改期前后日期或时间无效";
      if (
        lastPoint &&
        ["date", "start", "end"].some((k) => lastPoint[k] !== h.from[k])
      )
        return "改期记录前后不连续";
      lastPoint = h.to;
    }
    if (
      lastPoint &&
      (lastPoint.date !== o.shootDate ||
        lastPoint.start !== o.startTime ||
        lastPoint.end !== o.endTime)
    )
      return "最后一次改期与当前拍摄安排不一致";
  }
  const ledgerError = validateLedger(o);
  if (ledgerError) return ledgerError;
  return "";
}
export function conflicts(order, orders) {
  return orders.filter(
    (o) =>
      o.id !== order.id &&
      active(o) &&
      active(order) &&
      o.partnerId === order.partnerId &&
      o.shootDate === order.shootDate &&
      o.startTime < order.endTime &&
      order.startTime < o.endTime,
  );
}
export function reminders(data, date = today()) {
  const list = [];
  const s = data.settings;
  for (const o of data.orders) {
    const add = (kind, text, tone = "amber") =>
      list.push({ id: o.id + kind, order: o, kind, text, tone });
    if (active(o)) {
      if (
        s.settlement &&
        travelState(o) === "pending" &&
        (o.shootDate <= date || o.executionStatus === "已完成")
      )
        add("travel", "车费尚待补录，请在结清前核对", "amber");
      if (o.executionStatus === "待拍摄") {
        if (s.before3 && o.shootDate === shiftDate(date, 3))
          add("shoot3", "3 天后拍摄，请确认行程", "green");
        if (s.before1 && o.shootDate === shiftDate(date, 1))
          add("shoot1", "明日拍摄，请确认行程", "green");
        if (o.shootDate === date)
          add("today", "今日拍摄，请留意出发时间", "green");
      }
      if (
        s.unconfirmed &&
        o.dispatchStatus === "待确认" &&
        o.communicatedDate < date
      )
        add("confirm", "伙伴尚未确认，请跟进");
      if (s.deposit && cents(o.depositPaid) < cents(o.depositRequired))
        add(
          "deposit",
          "定金尚欠 ¥" +
            money((cents(o.depositRequired) - cents(o.depositPaid)) / 100),
        );
      if (s.settlement && o.executionStatus === "已完成" && balance(o) > 0)
        add("settlement", "拍摄已完成，待结 ¥" + money(balance(o)), "red");
    }
    if (
      s.changes &&
      (["已改期", "已取消"].includes(o.dispatchStatus) ||
        ["已改期", "已取消"].includes(o.executionStatus))
    )
      add(
        "change",
        o.dispatchStatus === "已取消" || o.executionStatus === "已取消"
          ? "订单已取消，请核对费用与安排"
          : "订单已改期，请重新确认档期",
        "gray",
      );
  }
  return list;
}
export function validateBackup(d) {
  if (
    !d ||
    ![1, 2, VERSION].includes(d.version) ||
    !Array.isArray(d.orders) ||
    !Array.isArray(d.partners) ||
    !Array.isArray(d.venues) ||
    !d.settings
  )
    throw new Error("文件不是有效的拾光派单备份（支持版本 1、2、3）");
  if (d.trash !== undefined && !Array.isArray(d.trash))
    throw new Error("回收站格式无效");
  const normalizeOrder = (o) => ({
    ...o,
    travelAmount: o?.travelAmount ?? 0,
    travelNote: o?.travelNote ?? "",
  });
  d = {
    ...d,
    orders: d.orders.map(normalizeOrder),
    trash: (d.trash || []).map((entry) => ({
      ...entry,
      order: normalizeOrder(entry?.order),
    })),
  };
  if (
    d.orders.length + d.trash.length > 10000 ||
    d.partners.length > 5000 ||
    d.venues.length > 5000
  )
    throw new Error("备份记录数量过多");
  for (const key of ["orders", "partners", "venues"]) {
    const ids = new Set();
    for (const row of d[key]) {
      if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id))
        throw new Error("备份存在无效或重复编号");
      ids.add(row.id);
    }
  }
  const orderIds = new Set(d.orders.map((o) => o.id));
  for (const entry of d.trash) {
    if (
      !entry.order.id ||
      typeof entry.order.id !== "string" ||
      orderIds.has(entry.order.id) ||
      !validStamp(entry.deletedAt)
    )
      throw new Error("回收站记录编号重复或删除时间无效");
    orderIds.add(entry.order.id);
  }
  for (const p of d.partners)
    if (
      typeof p.name !== "string" ||
      !p.name.trim() ||
      typeof p.phone !== "string" ||
      typeof p.role !== "string" ||
      typeof p.note !== "string"
    )
      throw new Error("伙伴信息不完整");
  for (const v of d.venues)
    if (
      !["city", "name", "address"].every((k) => typeof v[k] === "string") ||
      !v.name.trim() ||
      !Array.isArray(v.halls) ||
      !v.halls.every((h) => typeof h === "string")
    )
      throw new Error("场地信息不完整");
  for (const o of [...d.orders, ...d.trash.map((e) => e.order)]) {
    if (
      ![
        "title",
        "city",
        "venue",
        "hall",
        "address",
        "note",
        "paymentNote",
        "travelNote",
        "depositDate",
        "settlementDate",
        "updatedAt",
      ].every((k) => typeof o[k] === "string") ||
      typeof o.settlementExempt !== "boolean"
    )
      throw new Error("订单字段不完整");
    const err = validateOrder(o, d.partners);
    if (err) throw new Error("订单「" + o.title + "」：" + err);
  }
  for (const k of Object.keys(emptyData().settings))
    if (typeof d.settings[k] !== "boolean") throw new Error("提醒设置无效");
  return {
    version: VERSION,
    orders: d.orders,
    trash: d.trash,
    partners: d.partners,
    venues: d.venues,
    settings: d.settings,
  };
}
export function demoData(date = today()) {
  const d = emptyData();
  d.partners = [
    {
      id: "p1",
      name: "陈予安",
      phone: "13800000001",
      role: "婚礼摄影师",
      note: "擅长纪实、自然光人像",
    },
    {
      id: "p2",
      name: "林小满",
      phone: "13800000002",
      role: "活动摄影师",
      note: "商业活动、品牌发布会",
    },
    {
      id: "p3",
      name: "周一帆",
      phone: "13800000003",
      role: "摄像师",
      note: "婚礼双机位、活动摄像",
    },
    {
      id: "p4",
      name: "许知远",
      phone: "13800000004",
      role: "摄影师",
      note: "婚礼、人像与活动",
    },
  ];
  d.venues = [
    {
      id: "v1",
      city: "重庆",
      name: "重庆丽晶酒店",
      address: "江北区金沙门路 66 号",
      halls: ["3 楼 · 水晶厅", "5 楼 · 丽晶宴会厅"],
    },
    {
      id: "v2",
      city: "重庆",
      name: "江北嘴尼依格罗酒店",
      address: "江北区庆云路 1 号",
      halls: ["4 楼 · 茵园礼堂", "5 楼 · 尼依格罗宴会厅"],
    },
    {
      id: "v3",
      city: "重庆",
      name: "悦来国际会议中心",
      address: "渝北区悦来滨江大道 86 号",
      halls: ["1 楼 · 两江厅", "2 楼 · 悦来厅"],
    },
  ];
  const rows = [
    [
      "林先生 & 苏小姐婚礼",
      "婚庆",
      0,
      "09:00",
      "14:00",
      "p1",
      0,
      0,
      1800,
      500,
      500,
      0,
      "已确认",
      "待拍摄",
    ],
    [
      "秋日品牌新品发布会",
      "活动",
      0,
      "13:30",
      "18:00",
      "p2",
      2,
      0,
      2400,
      600,
      0,
      0,
      "待确认",
      "待拍摄",
    ],
    [
      "周先生 & 何小姐婚礼",
      "婚庆",
      1,
      "08:00",
      "14:00",
      "p3",
      1,
      0,
      2200,
      500,
      500,
      0,
      "已确认",
      "待拍摄",
    ],
    [
      "拾光 · 秋季婚礼跟拍",
      "婚庆",
      3,
      "09:00",
      "16:00",
      "p4",
      0,
      1,
      1600,
      400,
      200,
      0,
      "已确认",
      "待拍摄",
    ],
    [
      "城市创意生活节",
      "活动",
      5,
      "10:00",
      "18:00",
      "p2",
      2,
      1,
      2800,
      0,
      0,
      0,
      "待确认",
      "待拍摄",
    ],
    [
      "陈先生 & 许小姐婚礼",
      "婚庆",
      -2,
      "08:30",
      "14:00",
      "p1",
      1,
      1,
      1800,
      500,
      500,
      0,
      "已确认",
      "已完成",
    ],
    [
      "品牌年度答谢会",
      "活动",
      -4,
      "14:00",
      "20:00",
      "p4",
      2,
      0,
      3200,
      800,
      800,
      2400,
      "已确认",
      "已完成",
    ],
    [
      "赵先生 & 唐小姐婚礼",
      "婚庆",
      10,
      "09:00",
      "15:00",
      "p3",
      0,
      0,
      2000,
      500,
      0,
      0,
      "已改期",
      "已改期",
    ],
  ];
  d.orders = rows.map((r, i) => {
    const v = d.venues[r[6]];
    return {
      ...blankOrder(shiftDate(date, r[2])),
      id: "demo-" + i,
      title: r[0],
      type: r[1],
      startTime: r[3],
      endTime: r[4],
      partnerId: r[5],
      venue: v.name,
      hall: v.halls[r[7]],
      address: v.address,
      amount: r[8],
      depositRequired: r[9],
      depositPaid: r[10],
      depositDate: r[10] ? shiftDate(date, -8) : "",
      settlementPaid: r[11],
      settlementDate: r[11] ? shiftDate(date, -3) : "",
      dispatchStatus: r[12],
      executionStatus: r[13],
      communicatedDate: shiftDate(date, -10 + i),
      note: i === 0 ? "婚礼仪式 11:28 开始，请提前 30 分钟到场。" : "",
    };
  });
  return d;
}
