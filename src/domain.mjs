export const VERSION = 1;
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
  o.settlementExempt || !payable(o)
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
const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !isNaN(new Date(v + "T12:00:00")) &&
  shiftDate(v, 0) === v;
const validTime = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
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
    ![
      o.amount,
      o.travelAmount ?? 0,
      o.depositRequired,
      o.depositPaid,
      o.settlementPaid,
    ].every(
      (v) =>
        typeof v === "number" &&
        Number.isFinite(v) &&
        v >= 0 &&
        v <= 1e8 &&
        Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
    )
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
    d.version !== VERSION ||
    !Array.isArray(d.orders) ||
    !Array.isArray(d.partners) ||
    !Array.isArray(d.venues) ||
    !d.settings
  )
    throw new Error("文件不是有效的拾光派单备份（版本 1）");
  d = {
    ...d,
    orders: d.orders.map((o) => ({
      ...o,
      travelAmount: o?.travelAmount ?? 0,
      travelNote: o?.travelNote ?? "",
    })),
  };
  if (
    d.orders.length > 10000 ||
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
  for (const o of d.orders) {
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
