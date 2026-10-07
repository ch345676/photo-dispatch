import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  Wallet,
  MapPin,
  Bell,
  Settings,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  Clock,
  Download,
  Upload,
  X,
  Menu,
  Sun,
  SlidersHorizontal,
  MoreHorizontal,
  Trash2,
  Pencil,
  Phone,
  Building2,
  Info,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  FileText,
  CheckSquare,
  Archive,
  RefreshCw,
  Copy,
} from "lucide-react";
import {
  today,
  shiftDate,
  money,
  payable,
  paid,
  balance,
  depositStatus,
  settlementStatus,
  active,
  uid,
  emptyData,
  demoData,
  blankOrder,
  duplicateOrder,
  validateOrder,
  validateBackup,
  reminders,
  conflicts,
  TYPES,
  DISPATCH,
  EXECUTION,
  paymentLedger,
  currentBaseline,
  recordPayment,
  voidPayment,
  revisePaymentBaseline,
} from "./domain.mjs";
import {
  normalizeBackupMeta,
  nextBackupReminder,
  backupStatus,
} from "./backup.mjs";

const NAV = [
  ["overview", "工作台", LayoutDashboard],
  ["calendar", "派单日历", CalendarDays],
  ["orders", "全部订单", ClipboardList],
  ["partners", "合作伙伴", Users],
  ["finance", "费用结算", Wallet],
  ["venues", "场地管理", MapPin],
];
const STORAGE = "shiguang-photo-v1-";
const backupKey = (mode) => STORAGE + "backup-" + mode;
function readBackupMeta(mode) {
  try {
    return normalizeBackupMeta(
      JSON.parse(localStorage.getItem(backupKey(mode))),
    );
  } catch {
    return normalizeBackupMeta(null);
  }
}
const backupCopy = {
  empty: [
    "还没有需要备份的业务记录",
    "添加订单、伙伴或场地后，会在这里提醒你定期导出。",
  ],
  demo: [
    "当前为演示空间",
    "演示备份和个人备份分别记录，演示操作不会影响个人提醒。",
  ],
  never: [
    "给本地记录留一份备份",
    "本机尚无完整备份导出记录。将订单、付款流水、伙伴和场地一起保存到文件。",
  ],
  restored: [
    "恢复后的数据，建议重新备份",
    "最近恢复了备份，请为当前空间再导出一份完整文件。",
  ],
  stale: [
    "该更新你的备份了",
    "距上次导出已满 7 天，建议保存一份最新的完整备份。",
  ],
  recent: [
    "近期已发起备份导出",
    "新增或修改的记录不会自动写入之前的备份，可随时再次导出。",
  ],
};
function backupTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function readInitial() {
  let mode = "demo";
  try {
    mode =
      localStorage.getItem(STORAGE + "mode") === "personal"
        ? "personal"
        : "demo";
    const raw = localStorage.getItem(STORAGE + mode);
    return {
      mode,
      data: raw
        ? validateBackup(JSON.parse(raw))
        : mode === "demo"
          ? demoData()
          : emptyData(),
      error: "",
    };
  } catch {
    return {
      mode,
      data: emptyData(),
      error:
        "本地数据读取失败。原数据未覆盖，请先在设置中下载原始数据备份，再恢复备份。",
    };
  }
}
function Badge({ children, tone }) {
  const cls =
    tone ||
    (/未付|未结|待确认|部分/.test(children)
      ? "amber"
      : /取消|拒绝|改期|无需/.test(children)
        ? "gray"
        : "green");
  return (
    <span className={"badge " + cls}>
      <i />
      {children}
    </span>
  );
}
function Toast({ message, onClose, modal }) {
  const [target, setTarget] = useState(document.body);
  useEffect(() => {
    setTarget(document.querySelector("dialog[open]") || document.body);
  }, [message, modal]);
  return createPortal(
    <div className="toast" role="status">
      <Info size={18} />
      {message}
      <button aria-label="关闭提示" onClick={onClose}>
        <X size={15} />
      </button>
    </div>,
    target,
  );
}
function Avatar({ name, small = false }) {
  const colors = ["olive", "blue", "sand", "rose"];
  let n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span className={"avatar " + colors[n % 4] + (small ? " small" : "")}>
      {name.slice(-2)}
    </span>
  );
}
function Empty({ text = "暂时没有记录", onAdd, action = "新建派单" }) {
  return (
    <div className="empty">
      <Camera size={30} />
      <h3>{text}</h3>
      <p>把下一次拍摄安排在这里，让每一件事井井有条。</p>
      {onAdd && (
        <button className="button primary" onClick={onAdd}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Field({ label, children, span = false }) {
  return (
    <label className={"field " + (span ? "span2" : "")}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function download(content, name, type = "application/json") {
  const u = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  try {
    a.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
}
function Calendar({
  orders,
  selected,
  onSelect,
  month,
  setMonth,
  field = "shootDate",
  large = false,
}) {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5, 7));
  const first = `${month}-01`;
  const offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((count + offset) / 7) * 7 },
    (_, i) => shiftDate(first, i - offset),
  );
  function move(n) {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <div className={"calendar " + (large ? "large" : "")}>
      <div className="calendar-title">
        <h3>
          {y} 年 {m} 月
        </h3>
        <div className="button-row">
          <button
            className="text-button"
            onClick={() => {
              setMonth(today().slice(0, 7));
              onSelect(today());
            }}
          >
            今天
          </button>
          <button
            className="icon-button"
            onClick={() => move(-1)}
            aria-label="上个月"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            onClick={() => move(1)}
            aria-label="下个月"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <div key={w} className="weekday">
            {w}
          </div>
        ))}
        {cells.map((date) => {
          const dayOrders = orders.filter(
            (o) => o[field] === date && active(o),
          );
          return (
            <button
              key={date}
              aria-label={`${date}，${dayOrders.length} 场拍摄`}
              aria-pressed={date === selected}
              className={
                "calendar-day " +
                (date.slice(0, 7) !== month ? "outside " : "") +
                (date === selected ? "selected " : "") +
                (date === today() ? "today" : "")
              }
              onClick={() => onSelect(date)}
            >
              <span>{Number(date.slice(-2))}</span>
              {large ? (
                <div className="calendar-events">
                  {dayOrders.slice(0, 2).map((o) => (
                    <div
                      className={o.type === "婚庆" ? "wedding" : "event"}
                      key={o.id}
                    >
                      {o.startTime} {o.title}
                    </div>
                  ))}
                  {dayOrders.length > 2 && (
                    <small>另 {dayOrders.length - 2} 场</small>
                  )}
                </div>
              ) : (
                <div className="day-dots">
                  {dayOrders.slice(0, 3).map((o) => (
                    <i
                      className={o.type === "婚庆" ? "wedding" : "event"}
                      key={o.id}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="wedding" />
          婚庆拍摄
        </span>
        <span>
          <i className="event" />
          活动 / 其他
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [initial] = useState(readInitial),
    [mode, setMode] = useState(initial.mode),
    [data, setData] = useState(initial.data),
    [storageError, setStorageError] = useState(initial.error);
  const [backupMeta, setBackupMeta] = useState(() =>
    readBackupMeta(initial.mode),
  );
  const [backupNow, setBackupNow] = useState(Date.now);
  const backup = backupStatus(data, mode, backupMeta, backupNow);
  const [page, setPage] = useState(() =>
    NAV.some((n) => n[0] === location.hash.slice(1)) ||
    ["reminders", "settings"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "overview",
  );
  const [mobileMenu, setMobileMenu] = useState(false),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(today()),
    [month, setMonth] = useState(today().slice(0, 7)),
    [dateField, setDateField] = useState("shootDate");
  const [filters, setFilters] = useState({
      from: "",
      to: "",
      partner: "",
      venue: "",
      hall: "",
      type: "",
      deposit: "",
      settlement: "",
    }),
    [showFilters, setShowFilters] = useState(false),
    [tab, setTab] = useState("all"),
    [partnerView, setPartnerView] = useState("");
  const importRef = useRef(null);
  const importRequest = useRef(0);
  function notify(s) {
    setToast(s);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const h = () => {
      const p = location.hash.slice(1);
      if (NAV.some((n) => n[0] === p) || ["settings", "reminders"].includes(p))
        setPage(p);
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    const refresh = () => setBackupNow(Date.now());
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === backupKey(mode)) {
        setBackupMeta(readBackupMeta(mode));
        setBackupNow(Date.now());
      }
      if (e.key === STORAGE + mode && e.newValue) {
        try {
          setData(validateBackup(JSON.parse(e.newValue)));
          setModal(null);
          notify("数据已与另一标签页同步，请重新打开要编辑的记录");
        } catch {
          setStorageError("另一标签页的数据无法读取，请先备份。");
        }
      }
    };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, [mode]);
  function saveBackupMeta(patch) {
    const next = normalizeBackupMeta({ ...readBackupMeta(mode), ...patch });
    setBackupMeta(next);
    setBackupNow(Date.now());
    try {
      localStorage.setItem(backupKey(mode), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }
  function snoozeBackup() {
    if (!saveBackupMeta({ snoozedUntil: nextBackupReminder() }))
      notify("本次已暂缓提醒，但浏览器未保存提醒时间；重新打开后可能再次显示");
  }
  function persist(next, force = false) {
    if (storageError && !force) {
      notify("请先在数据设置中导出原始数据并恢复备份");
      return false;
    }
    try {
      const stored = localStorage.getItem(STORAGE + mode);
      if (stored && !force) {
        const latest = validateBackup(JSON.parse(stored));
        if (JSON.stringify(latest) !== JSON.stringify(data)) {
          setData(latest);
          setModal(null);
          notify("数据已在其他页面更新，请重新打开记录再修改");
          return false;
        }
      }
      localStorage.setItem(STORAGE + mode, JSON.stringify(next));
      setData(next);
      setStorageError("");
      return true;
    } catch {
      notify("保存失败：浏览器存储空间不足或不可用，请先导出备份");
      return false;
    }
  }
  function navigate(p) {
    setPage(p);
    location.hash = p;
    setMobileMenu(false);
    setQuery("");
    setTab("all");
    setPartnerView("");
  }
  function switchMode(next) {
    try {
      const raw = localStorage.getItem(STORAGE + next);
      const nextData = raw
        ? validateBackup(JSON.parse(raw))
        : next === "demo"
          ? demoData()
          : emptyData();
      localStorage.setItem(STORAGE + "mode", next);
      importRequest.current++;
      setData(nextData);
      setMode(next);
      setBackupMeta(readBackupMeta(next));
      setBackupNow(Date.now());
      setStorageError("");
      setModal(null);
      notify(
        next === "personal"
          ? "已进入个人空间，开始记录你的第一场拍摄吧"
          : "已切换到演示空间",
      );
    } catch {
      notify("无法切换：目标空间数据读取失败，请先下载原始备份");
    }
  }
  const partner = (id) => data.partners.find((p) => p.id === id);
  const alerts = reminders(data);
  const monthOrders = data.orders.filter(
    (o) => active(o) && o.shootDate.startsWith(month),
  );
  const sum = (rows, fn) =>
    rows.reduce((n, o) => n + Math.round(fn(o) * 100), 0) / 100;
  const monthAmount = sum(monthOrders, payable),
    monthPaid = sum(monthOrders, paid),
    monthBalance = sum(monthOrders, balance);
  const selectedOrders = data.orders
    .filter(
      (o) =>
        o[page === "overview" ? "shootDate" : dateField] === selected &&
        active(o),
    )
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dueOrders = data.orders.filter((o) => balance(o) > 0 && active(o));
  function newOrder(date = selected) {
    if (!data.partners.length) {
      setModal({ type: "partner", nextOrder: true });
      return;
    }
    setModal({ type: "order", value: blankOrder(date) });
  }
  function filteredOrders() {
    return data.orders
      .filter((o) => {
        const p = partner(o.partnerId);
        const match = [
          o.title,
          p?.name,
          p?.phone,
          o.venue,
          o.hall,
          o.city,
          o.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
        return (
          match &&
          (!filters.from || o[dateField] >= filters.from) &&
          (!filters.to || o[dateField] <= filters.to) &&
          (!filters.partner || o.partnerId === filters.partner) &&
          (!filters.venue || o.venue === filters.venue) &&
          (!filters.hall || o.hall === filters.hall) &&
          (!filters.type || o.type === filters.type) &&
          (!filters.deposit || depositStatus(o) === filters.deposit) &&
          (!filters.settlement || settlementStatus(o) === filters.settlement) &&
          (tab === "all" ||
            (tab === "pending" && o.dispatchStatus === "待确认") ||
            (tab === "upcoming" &&
              active(o) &&
              o.executionStatus === "待拍摄") ||
            (tab === "finished" && o.executionStatus === "已完成") ||
            (tab === "unpaid" && balance(o) > 0) ||
            (tab === "settled" && balance(o) === 0))
        );
      })
      .sort(
        (a, b) =>
          b[dateField].localeCompare(a[dateField]) ||
          a.startTime.localeCompare(b.startTime),
      );
  }
  function exportData() {
    if (storageError) {
      notify("数据读取异常，请先下载原始存储文件，再恢复有效备份");
      return;
    }
    try {
      // Read at export time so another tab's newer payment is included.
      const raw = localStorage.getItem(STORAGE + mode);
      if (
        raw === null &&
        mode === "personal" &&
        (data.orders.length || data.partners.length || data.venues.length)
      ) {
        notify(
          "本地存储记录已被移除，暂不导出空备份。页面中的记录仍保留，请先核对浏览器存储情况",
        );
        return;
      }
      const latest = validateBackup(
        raw !== null ? JSON.parse(raw) : mode === "demo" ? data : emptyData(),
      );
      const exportedAt = new Date().toISOString();
      download(
        JSON.stringify({ ...latest, exportedAt, space: mode }, null, 2),
        `拾光派单-${mode === "demo" ? "演示" : "个人"}备份-${today()}.json`,
      );
      const recorded = saveBackupMeta({
        lastExportedAt: exportedAt,
        lastRestoredAt: "",
        snoozedUntil: "",
      });
      notify(
        recorded
          ? "已发起备份下载，请确认文件已保存到设备"
          : "已发起备份下载，但导出时间未能保存；请确认文件已保存到设备",
      );
    } catch {
      notify(
        "完整备份导出失败，未更新导出记录。请检查浏览器下载设置；若数据损坏，请先下载原始存储文件",
      );
    }
  }
  function exportCSV(rows) {
    const cols = [
      "拍摄主题",
      "类型",
      "拍摄日期",
      "开始时间",
      "结束时间",
      "沟通日期",
      "伙伴",
      "联系方式",
      "城市",
      "场地",
      "展厅",
      "地址",
      "拍摄费用",
      "报销车费",
      "应付合计",
      "车费说明",
      "约定定金",
      "已付定金",
      "定金支付日期",
      "已付尾款",
      "尾款支付日期",
      "已付合计",
      "待结金额",
      "定金状态",
      "结算状态",
      "派单状态",
      "执行状态",
      "备注",
      "结算备注",
    ];
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const content = [
      cols,
      ...rows.map((o) => [
        o.title,
        o.type,
        o.shootDate,
        o.startTime,
        o.endTime,
        o.communicatedDate,
        partner(o.partnerId)?.name,
        partner(o.partnerId)?.phone,
        o.city,
        o.venue,
        o.hall,
        o.address,
        o.amount,
        o.travelAmount || 0,
        payable(o),
        o.travelNote || "",
        o.depositRequired,
        o.depositPaid,
        o.depositDate,
        o.settlementPaid,
        o.settlementDate,
        paid(o),
        balance(o),
        depositStatus(o),
        settlementStatus(o),
        o.dispatchStatus,
        o.executionStatus,
        o.note,
        o.paymentNote,
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    download(
      "\uFEFF" + content,
      `拾光派单明细-${today()}.csv`,
      "text/csv;charset=utf-8",
    );
    notify("当前筛选结果已导出");
  }
  async function importFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const request = ++importRequest.current;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("备份文件不能超过 10 MB");
      const contents = await file.text();
      if (request !== importRequest.current) return;
      const d = validateBackup(JSON.parse(contents));
      setModal({
        type: "confirm",
        title: "恢复备份",
        message: `将用备份中的 ${d.orders.length} 场订单、${d.partners.length} 位伙伴替换当前${mode === "demo" ? "演示" : "个人"}空间。建议先导出当前数据。`,
        action: "确认恢复",
        onConfirm: () => {
          if (request !== importRequest.current) return;
          if (persist(d, true)) {
            setModal(null);
            const recorded = saveBackupMeta({
              lastRestoredAt: new Date().toISOString(),
              snoozedUntil: "",
            });
            notify(
              recorded
                ? "备份已恢复，建议为当前数据重新导出备份"
                : "备份已恢复；提醒时间未能保存，建议立即导出备份",
            );
          }
        },
      });
    } catch (err) {
      if (request !== importRequest.current) return;
      notify("导入失败：" + err.message);
    }
  }
  function saveOrder(o, intent = "edit") {
    const current = data.orders.find((v) => v.id === o.id);
    if (current && current.updatedAt !== o.updatedAt) {
      notify("这场派单已被更新，请重新打开后编辑");
      return false;
    }
    if (
      current?.paymentLedger &&
      intent === "edit" &&
      JSON.stringify(current.paymentLedger) !== JSON.stringify(o.paymentLedger)
    ) {
      notify("付款记录请通过登记、撤销或更正初始累计修改");
      return false;
    }
    const err = validateOrder(o, data.partners);
    if (err) {
      notify(err);
      return false;
    }
    const scheduleChanged =
      !current ||
      [
        "partnerId",
        "shootDate",
        "startTime",
        "endTime",
        "dispatchStatus",
        "executionStatus",
      ].some((k) => current[k] !== o[k]);
    const clash = scheduleChanged ? conflicts(o, data.orders) : [];
    if (clash.length) {
      notify(
        "档期冲突：" +
          partner(o.partnerId)?.name +
          " 同时段已有「" +
          clash[0].title +
          "」",
      );
      return false;
    }
    if (current && current.shootDate !== o.shootDate)
      o = {
        ...o,
        note: [
          o.note,
          "改期记录：" +
            current.shootDate +
            " → " +
            o.shootDate +
            "（记录于 " +
            today() +
            "）",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    const saved = { ...o, updatedAt: new Date().toISOString() };
    const next = {
      ...data,
      orders: current
        ? data.orders.map((v) => (v.id === o.id ? saved : v))
        : [...data.orders, saved],
    };
    if (persist(next)) {
      setModal(null);
      notify("派单已保存");
      return true;
    }
    return false;
  }
  function deleteOrder(o) {
    setModal({
      type: "confirm",
      title: "删除这场派单？",
      message: `「${o.title}」及其付款记录将被删除，此操作无法撤销。`,
      action: "确认删除",
      danger: true,
      onConfirm: () => {
        if (
          persist({ ...data, orders: data.orders.filter((v) => v.id !== o.id) })
        ) {
          setModal(null);
          notify("派单已删除");
        }
      },
    });
  }
  function orderCard(o) {
    const p = partner(o.partnerId);
    return (
      <button
        className="shoot-card"
        key={o.id}
        onClick={() => setModal({ type: "detail", value: o })}
      >
        <div className="shoot-time">
          <strong>{o.startTime}</strong>
          <span>{o.endTime}</span>
        </div>
        <div className="shoot-info">
          <div className="shoot-line">
            <span
              className={
                "type-label " + (o.type === "婚庆" ? "wedding" : "event")
              }
            >
              {o.type}
            </span>
            <h4>{o.title}</h4>
          </div>
          <p>
            <MapPin size={13} />
            {o.venue} · {o.hall}
          </p>
          <div className="shoot-meta">
            <span>
              <Avatar name={p?.name || "待安排"} small />
              {p?.name}
            </span>
            <Badge>{o.dispatchStatus}</Badge>
          </div>
        </div>
        <ChevronRight className="shoot-arrow" size={17} />
      </button>
    );
  }
  function orderTable(rows, compact = false) {
    return !rows.length ? (
      <Empty text="没有符合条件的派单" onAdd={() => newOrder()} />
    ) : (
      <>
        <div className="table-wrap desktop-order-table">
          <table>
            <thead>
              <tr>
                <th>拍摄任务 / 场地</th>
                <th>拍摄日期</th>
                <th>合作伙伴</th>
                <th>应付金额</th>
                {!compact && <th>定金状态</th>}
                <th>结算状态</th>
                <th>派单状态</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <button
                      className="table-title"
                      onClick={() => setModal({ type: "detail", value: o })}
                    >
                      <span>{o.title}</span>
                      <small>
                        {o.venue} · {o.hall}
                      </small>
                    </button>
                  </td>
                  <td>
                    <span className="date-cell">
                      {o.shootDate.slice(5).replace("-", "月")}日
                    </span>
                    <small className="cell-sub">
                      {o.startTime} – {o.endTime}
                    </small>
                  </td>
                  <td>
                    <button
                      className="partner-inline"
                      onClick={() => {
                        navigate("partners");
                        setPartnerView(o.partnerId);
                      }}
                    >
                      <Avatar
                        name={partner(o.partnerId)?.name || "伙伴"}
                        small
                      />
                      {partner(o.partnerId)?.name}
                    </button>
                  </td>
                  <td className="amount">¥ {money(payable(o))}</td>
                  {!compact && (
                    <td>
                      <Badge>{depositStatus(o)}</Badge>
                    </td>
                  )}
                  <td>
                    <Badge>{settlementStatus(o)}</Badge>
                  </td>
                  <td>
                    <Badge>{o.dispatchStatus}</Badge>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"查看" + o.title}
                      onClick={() => setModal({ type: "detail", value: o })}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mobile-order-list" aria-label="派单记录">
          {rows.map((o) => {
            const p = partner(o.partnerId);
            return (
              <li key={o.id}>
                <article className="order-list-card" aria-label={o.title}>
                  <div className="order-list-heading">
                    <span
                      className={
                        "type-label " +
                        (o.type === "婚庆" ? "wedding" : "event")
                      }
                    >
                      {o.type}
                    </span>
                    <Badge>{o.dispatchStatus}</Badge>
                  </div>
                  <h3>{o.title}</h3>
                  <div className="order-list-time">
                    <CalendarDays size={15} />
                    <time dateTime={o.shootDate}>{o.shootDate}</time>
                    <span>
                      {o.startTime} – {o.endTime}
                    </span>
                  </div>
                  <div className="order-list-place">
                    <MapPin size={15} />
                    <div>
                      <span>
                        {o.city} · {o.venue}
                      </span>
                      <strong>{o.hall}</strong>
                    </div>
                  </div>
                  <div className="order-list-partner">
                    <button
                      className="order-partner-button"
                      onClick={() => {
                        navigate("partners");
                        setPartnerView(o.partnerId);
                      }}
                      aria-label={"查看" + (p?.name || "伙伴") + "的全部派单"}
                    >
                      <Avatar name={p?.name || "伙伴"} small />
                      <span>{p?.name || "伙伴"}</span>
                      <ChevronRight size={13} />
                    </button>
                    <Badge>{o.executionStatus}</Badge>
                  </div>
                  <div
                    className={
                      "order-list-payment" +
                      (money(payable(o)).length > 10 ? " large-money" : "")
                    }
                  >
                    <div>
                      <span>应付合计</span>
                      <strong>¥ {money(payable(o))}</strong>
                    </div>
                    <div className="order-list-balance">
                      <span>待结金额</span>
                      <strong>¥ {money(balance(o))}</strong>
                    </div>
                    <p>
                      已付 ¥ {money(paid(o))}
                      {o.travelAmount > 0 && (
                        <span> · 应付含车费 ¥ {money(o.travelAmount)}</span>
                      )}
                    </p>
                  </div>
                  <div className="order-list-status">
                    <Badge>{depositStatus(o)}</Badge>
                    <Badge>{settlementStatus(o)}</Badge>
                  </div>
                  <div className="order-list-communication">
                    沟通于{" "}
                    <time dateTime={o.communicatedDate}>
                      {o.communicatedDate}
                    </time>
                  </div>
                  <div className="order-list-actions">
                    <button
                      className="button"
                      onClick={() => setModal({ type: "detail", value: o })}
                      aria-label={"查看" + o.title + "详情"}
                    >
                      查看详情 <ArrowUpRight size={15} />
                    </button>
                    {balance(o) > 0 && (
                      <button
                        className="button soft"
                        onClick={() => setModal({ type: "payment", value: o })}
                        aria-label={"为" + o.title + "登记付款"}
                      >
                        <Wallet size={15} />
                        登记付款
                      </button>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </>
    );
  }
  function stats() {
    return (
      <div className="stats-grid">
        <div className="stat-card blue-stat">
          <div className="stat-label">
            本月拍摄单量{" "}
            <span>
              <Camera size={19} />
            </span>
          </div>
          <div className="stat-value">
            {monthOrders.length}
            <small>场</small>
          </div>
          <div className="stat-foot">
            <span className="white-pill">
              {monthOrders.filter((o) => o.executionStatus === "待拍摄").length}{" "}
              场待拍摄
            </span>
            <span>{Number(month.slice(5))} 月拍摄安排</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            本月应付金额
            <span>
              <Wallet size={19} />
            </span>
          </div>
          <div
            className={
              "stat-value" +
              (money(monthAmount).length > 8 ? " long-value" : "")
            }
          >
            <small>¥</small>
            <span className="stat-number">{money(monthAmount)}</span>
          </div>
          <div className="stat-foot">
            <span>按拍摄月份统计</span>
            <span className="stat-dot blue" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            本月已付金额
            <span className="green-icon">
              <CheckCheck size={19} />
            </span>
          </div>
          <div
            className={
              "stat-value" + (money(monthPaid).length > 8 ? " long-value" : "")
            }
          >
            <small>¥</small>
            <span className="stat-number">{money(monthPaid)}</span>
          </div>
          <div className="stat-foot">
            <span>含已付定金与尾款</span>
            <span className="stat-dot green" />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            本月待结金额
            <span className="amber-icon">
              <Clock size={19} />
            </span>
          </div>
          <div
            className={
              "stat-value" +
              (money(monthBalance).length > 8 ? " long-value" : "")
            }
          >
            <small>¥</small>
            <span className="stat-number">{money(monthBalance)}</span>
          </div>
          <div className="stat-foot">
            <span>
              {monthOrders.filter((o) => balance(o) > 0).length} 场订单待结清
            </span>
            <button
              className="text-button"
              onClick={() => {
                navigate("finance");
                setTab("unpaid");
              }}
            >
              去结算 <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }
  const title =
    page === "overview"
      ? "工作台"
      : NAV.find((n) => n[0] === page)?.[1] ||
        { settings: "数据与设置", reminders: "提醒中心" }[page];
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileMenu ? "open" : "")}>
        <a
          className="brand"
          href="#overview"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            <Camera size={24} />
          </span>
          <span>
            <strong>
              拾光派单<span className="brand-dot">.</span>
            </strong>
            <small>SHIGUANG STUDIO</small>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="workspace-icon">
            <Camera size={15} />
          </span>
          <div>
            <strong>我的摄影工作室</strong>
            <small>让每一场拍摄，有序发生</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <div className="nav-label">
          工作空间 <span>WORKSPACE</span>
        </div>
        <nav>
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={"nav-item " + (page === id ? "active" : "")}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "orders" && <small>{data.orders.length}</small>}
              {id === "overview" && page === id && (
                <span className="active-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <button
          className={"nav-item " + (page === "reminders" ? "active" : "")}
          onClick={() => navigate("reminders")}
        >
          <Bell size={19} />
          <span>提醒中心</span>
          {alerts.length > 0 && (
            <small className="alert-count">{alerts.length}</small>
          )}
        </button>
        <button
          className={"nav-item " + (page === "settings" ? "active" : "")}
          onClick={() => navigate("settings")}
        >
          <Settings size={19} />
          <span>数据与设置</span>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Sun size={21} />
            </span>
            <p>
              专注镜头里的美好，
              <br />
              琐碎的安排，交给拾光。
            </p>
            <div className="note-rule" />
            <span>每一次快门，都值得被认真对待。</span>
          </div>
          <div className="local-profile">
            <span className="profile-avatar">拾</span>
            <div>
              <strong>摄影工作室</strong>
              <small>
                <i />
                {mode === "demo" ? "演示空间" : "个人本地空间"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="打开数据设置"
              onClick={() => navigate("settings")}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-overlay"
          aria-label="关闭导航"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="打开导航"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>我的工作室</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="save-status">
              <i />
              {mode === "demo" ? "演示数据" : "本地保存"}
            </span>
            <span className="topbar-divider" />
            <button
              className="notification-button icon-button"
              aria-label={`提醒中心，${alerts.length} 条提醒`}
              onClick={() => navigate("reminders")}
            >
              <Bell size={19} />
              {alerts.length > 0 && <i />}
            </button>
            <span className="profile-avatar small-profile">拾</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "overview"
                  ? "YOUR CREATIVE WORK, IN ORDER"
                  : "SHIGUANG · " +
                    {
                      calendar: "SHOOTING CALENDAR",
                      orders: "ASSIGNMENTS",
                      partners: "CREATIVE PARTNERS",
                      finance: "PAYMENTS",
                      venues: "LOCATIONS",
                      reminders: "REMINDERS",
                      settings: "YOUR WORKSPACE",
                    }[page]}
              </div>
              <h1>
                {page === "overview" ? "把每一次拍摄，安排妥当。" : title}
              </h1>
              <p>
                {page === "overview"
                  ? `${new Date(today() + "T12:00:00").toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}，今天也要拍出好作品。`
                  : {
                      calendar: "拍摄与派单沟通，两个日期维度，一眼掌握。",
                      orders: "从第一次沟通，到最后一笔结清。",
                      partners: "好的作品，来自默契的合作。",
                      finance: "每一笔定金、每一次结算，都有迹可循。",
                      venues: "记录每个目的地，细化到每一间宴会厅。",
                      reminders: "那些需要多留意一下的事情，都在这里。",
                      settings: "数据留在你的浏览器，工作节奏由你掌握。",
                    }[page]}
              </p>
            </div>
            <div className="heading-actions">
              {["overview", "calendar", "finance"].includes(page) && (
                <label className="month-control">
                  <CalendarDays size={16} />
                  <input
                    aria-label="统计月份"
                    type="month"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                </label>
              )}
              {!["settings", "reminders", "partners", "venues"].includes(
                page,
              ) && (
                <button className="button primary" onClick={() => newOrder()}>
                  <Plus size={18} />
                  新建派单
                </button>
              )}
              {page === "partners" && (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "partner" })}
                >
                  <Plus size={18} />
                  添加伙伴
                </button>
              )}
              {page === "venues" && (
                <button
                  className="button primary"
                  onClick={() => setModal({ type: "venue" })}
                >
                  <Plus size={18} />
                  添加场地
                </button>
              )}
            </div>
          </div>
          {mode === "demo" && (
            <div className="demo-banner">
              <span>
                <Info size={15} />
                你正在查看演示数据，可以自由体验所有功能。
              </span>
              <button onClick={() => switchMode("personal")}>
                进入个人空间 <ArrowRight size={14} />
              </button>
            </div>
          )}
          {storageError && (
            <div className="error-banner" role="alert">
              {storageError}
            </div>
          )}
          {page === "overview" && backup.show && !storageError && (
            <section className="backup-reminder" aria-label="备份提醒">
              <span className="backup-reminder-icon">
                <HardDrive size={22} />
              </span>
              <div className="backup-reminder-copy">
                <h2>{backupCopy[backup.reason][0]}</h2>
                <p>{backupCopy[backup.reason][1]}</p>
              </div>
              <div className="backup-reminder-actions">
                <button className="button primary" onClick={exportData}>
                  <Download size={16} />
                  导出完整备份
                </button>
                <button className="text-button" onClick={snoozeBackup}>
                  明天提醒
                </button>
              </div>
            </section>
          )}
          {page === "overview" && (
            <>
              {stats()}
              <div className="overview-grid">
                <section className="panel calendar-panel">
                  <div className="section-header">
                    <h2>
                      <CalendarDays size={18} />
                      拍摄日历
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("calendar")}
                    >
                      完整日历 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <Calendar
                    orders={data.orders}
                    selected={selected}
                    onSelect={setSelected}
                    month={month}
                    setMonth={setMonth}
                  />
                </section>
                <section className="panel schedule-panel">
                  <div className="section-header">
                    <h2>
                      {selected === today()
                        ? "今日拍摄"
                        : `${Number(selected.slice(5, 7))} 月 ${Number(selected.slice(8))} 日拍摄`}
                      <span className="count-chip">
                        {selectedOrders.length} 场
                      </span>
                    </h2>
                    <span className="muted">
                      {selected.slice(5).replace("-", " / ")}
                    </span>
                  </div>
                  <div className="day-schedule">
                    {selectedOrders.length ? (
                      selectedOrders.map(orderCard)
                    ) : (
                      <Empty
                        text="这一天暂无拍摄"
                        onAdd={() => newOrder(selected)}
                      />
                    )}
                  </div>
                  <button
                    className="schedule-add"
                    onClick={() => newOrder(selected)}
                  >
                    <Plus size={16} />
                    安排一场新的拍摄
                  </button>
                </section>
                <section className="panel attention-panel">
                  <div className="section-header">
                    <h2>
                      <span className="bell-icon">
                        <Bell size={17} />
                      </span>
                      待办提醒
                    </h2>
                    <span className="count-chip">{alerts.length}</span>
                  </div>
                  <div className="attention-list">
                    {alerts.slice(0, 3).map((a) => (
                      <button
                        className="attention-item"
                        key={a.id}
                        onClick={() =>
                          setModal({ type: "detail", value: a.order })
                        }
                      >
                        <span className={"attention-dot " + a.tone} />
                        <div>
                          <strong>{a.text}</strong>
                          <p>{a.order.title}</p>
                        </div>
                        <ChevronRight size={14} />
                      </button>
                    ))}
                    {!alerts.length && (
                      <div className="all-clear">
                        <CheckCircle2 size={28} />
                        <p>安排妥当，暂无待办</p>
                      </div>
                    )}
                  </div>
                  <button
                    className="attention-all"
                    onClick={() => navigate("reminders")}
                  >
                    查看全部提醒 <ArrowRight size={14} />
                  </button>
                  <div className="quote">
                    <Camera size={23} />
                    <p>
                      记录美好，
                      <br />
                      从有序的每一天开始。
                    </p>
                    <span>A LITTLE ORDER. A LOT OF INSPIRATION.</span>
                  </div>
                </section>
              </div>
              <section className="panel recent-panel">
                <div className="section-header">
                  <h2>
                    近期派单{" "}
                    <span className="subheading">每一次合作，都心中有数</span>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("orders")}
                  >
                    查看全部 <ArrowRight size={14} />
                  </button>
                </div>
                {orderTable(
                  [...data.orders]
                    .sort((a, b) =>
                      b.communicatedDate.localeCompare(a.communicatedDate),
                    )
                    .slice(0, 4),
                  true,
                )}
              </section>
            </>
          )}
          {page === "calendar" && (
            <>
              <div className="view-bar">
                <div className="segmented">
                  <button
                    className={dateField === "shootDate" ? "selected" : ""}
                    onClick={() => setDateField("shootDate")}
                  >
                    按拍摄日期
                  </button>
                  <button
                    className={
                      dateField === "communicatedDate" ? "selected" : ""
                    }
                    onClick={() => setDateField("communicatedDate")}
                  >
                    按沟通日期
                  </button>
                </div>
                <span className="muted">点击日期查看当天安排</span>
              </div>
              <div className="calendar-page-grid">
                <section className="panel">
                  <Calendar
                    large
                    orders={data.orders}
                    selected={selected}
                    onSelect={setSelected}
                    month={month}
                    setMonth={setMonth}
                    field={dateField}
                  />
                </section>
                <section className="panel">
                  <div className="section-header">
                    <h2>
                      {Number(selected.slice(5, 7))} 月{" "}
                      {Number(selected.slice(8))} 日
                    </h2>
                    <span className="count-chip">
                      {selectedOrders.length} 场
                    </span>
                  </div>
                  <div className="calendar-side-list">
                    {selectedOrders.length ? (
                      selectedOrders.map(orderCard)
                    ) : (
                      <Empty
                        text={
                          dateField === "shootDate"
                            ? "当天没有拍摄安排"
                            : "当天没有派单沟通记录"
                        }
                        onAdd={() => newOrder(selected)}
                      />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
          {["orders", "finance"].includes(page) && (
            <>
              {page === "finance" && (
                <>
                  {stats()}
                  <div className="info-strip">
                    <Info size={16} />
                    已付金额 = 已付定金 + 已付尾款；待结金额 = 拍摄费用 +
                    报销车费 −
                    已付金额。月度汇总不含取消、拒绝订单；其未付费用仍列入待结账。
                  </div>
                </>
              )}
              <section className="panel orders-panel">
                <div className="orders-toolbar">
                  <div className="tabs">
                    {(page === "finance"
                      ? [
                          ["all", "全部账单"],
                          ["unpaid", "待结账"],
                          ["settled", "已结清"],
                        ]
                      : [
                          ["all", "全部订单"],
                          ["pending", "待确认"],
                          ["upcoming", "待拍摄"],
                          ["finished", "已完成"],
                        ]
                    ).map(([id, label]) => (
                      <button
                        className={tab === id ? "active" : ""}
                        onClick={() => setTab(id)}
                        key={id}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="button subtle"
                    onClick={() => exportCSV(filteredOrders())}
                  >
                    <Download size={15} />
                    导出明细
                  </button>
                </div>
                <div className="filter-toolbar">
                  <label className="search-field">
                    <Search size={17} />
                    <input
                      aria-label="搜索订单"
                      placeholder="搜索拍摄主题、伙伴、场地…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="筛选日期类型"
                    value={dateField}
                    onChange={(e) => setDateField(e.target.value)}
                  >
                    <option value="shootDate">拍摄日期</option>
                    <option value="communicatedDate">沟通日期</option>
                  </select>
                  <button
                    className={"button " + (showFilters ? "soft" : "subtle")}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <SlidersHorizontal size={16} />
                    筛选 {Object.values(filters).filter(Boolean).length || ""}
                  </button>
                </div>
                {showFilters && (
                  <div className="filter-grid">
                    <Field label="开始日期">
                      <input
                        type="date"
                        value={filters.from}
                        onChange={(e) =>
                          setFilters({ ...filters, from: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="结束日期">
                      <input
                        type="date"
                        value={filters.to}
                        min={filters.from}
                        onChange={(e) =>
                          setFilters({ ...filters, to: e.target.value })
                        }
                      />
                    </Field>
                    {[
                      [
                        "partner",
                        "合作伙伴",
                        data.partners.map((p) => [p.id, p.name]),
                      ],
                      [
                        "venue",
                        "场地",
                        [...new Set(data.orders.map((o) => o.venue))].map(
                          (v) => [v, v],
                        ),
                      ],
                      [
                        "hall",
                        "展厅 / 宴会厅",
                        [
                          ...new Set(
                            data.orders
                              .filter(
                                (o) =>
                                  !filters.venue || o.venue === filters.venue,
                              )
                              .map((o) => o.hall),
                          ),
                        ].map((v) => [v, v]),
                      ],
                      ["type", "单子类型", TYPES.map((v) => [v, v])],
                      [
                        "deposit",
                        "定金状态",
                        ["未付定金", "部分定金", "已付定金", "无需定金"].map(
                          (v) => [v, v],
                        ),
                      ],
                      [
                        "settlement",
                        "结算状态",
                        ["未结账", "部分结账", "已结账", "无需结账"].map(
                          (v) => [v, v],
                        ),
                      ],
                    ].map(([key, label, values]) => (
                      <Field label={label} key={key}>
                        <select
                          value={filters[key]}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              [key]: e.target.value,
                              ...(key === "venue" ? { hall: "" } : {}),
                            })
                          }
                        >
                          <option value="">全部</option>
                          {values.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                    <button
                      className="text-button"
                      onClick={() =>
                        setFilters({
                          from: "",
                          to: "",
                          partner: "",
                          venue: "",
                          hall: "",
                          type: "",
                          deposit: "",
                          settlement: "",
                        })
                      }
                    >
                      清空筛选
                    </button>
                  </div>
                )}
                {orderTable(filteredOrders())}
                <div className="table-footer">
                  <span>共 {filteredOrders().length} 场订单</span>
                  <span>
                    应付 ¥ {money(sum(filteredOrders(), payable))} · 待结 ¥{" "}
                    {money(sum(filteredOrders(), balance))}
                  </span>
                </div>
              </section>
              {page === "finance" && (
                <section className="panel partner-summary">
                  <div className="section-header">
                    <h2>伙伴本月结算</h2>
                    <span className="muted">按当前统计月份</span>
                  </div>
                  {data.partners.map((p) => {
                    const rows = monthOrders.filter(
                      (o) => o.partnerId === p.id,
                    );
                    return (
                      <div className="summary-row" key={p.id}>
                        <Avatar name={p.name} />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{rows.length} 场拍摄</small>
                        </div>
                        <div className="summary-amount">
                          <span>已付 ¥ {money(sum(rows, paid))}</span>
                          <strong>待结 ¥ {money(sum(rows, balance))}</strong>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}
            </>
          )}
          {page === "partners" && (
            <>
              {partnerView ? (
                <section className="panel">
                  <div className="section-header">
                    <h2>
                      <Avatar name={partner(partnerView)?.name || "伙伴"} />
                      {partner(partnerView)?.name}的全部派单
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => setPartnerView("")}
                    >
                      返回伙伴列表
                    </button>
                  </div>
                  {orderTable(
                    data.orders.filter((o) => o.partnerId === partnerView),
                  )}
                </section>
              ) : (
                <div className="partner-grid">
                  {data.partners.map((p) => {
                    const rows = data.orders.filter(
                      (o) => o.partnerId === p.id,
                    );
                    return (
                      <article className="panel partner-card" key={p.id}>
                        <div className="partner-card-head">
                          <Avatar name={p.name} />
                          <button
                            className="icon-button"
                            aria-label={"编辑" + p.name}
                            onClick={() =>
                              setModal({ type: "partner", value: p })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                        <h2>{p.name}</h2>
                        <span className="muted">{p.role || "摄影伙伴"}</span>
                        <p className="partner-phone">
                          <Phone size={14} />
                          {p.phone || "暂未填写联系方式"}
                        </p>
                        <p className="partner-note">
                          {p.note || "期待下一次默契合作。"}
                        </p>
                        <div className="partner-numbers">
                          <div>
                            <strong>
                              {rows.length}
                              <small> 场</small>
                            </strong>
                            <span>累计接单</span>
                          </div>
                          <div>
                            <strong>¥ {money(sum(rows, balance))}</strong>
                            <span>待结金额</span>
                          </div>
                        </div>
                        <button
                          className="partner-open"
                          onClick={() => setPartnerView(p.id)}
                        >
                          查看全部派单 <ArrowUpRight size={16} />
                        </button>
                      </article>
                    );
                  })}
                  {!data.partners.length && (
                    <div className="panel">
                      <Empty
                        text="添加第一位合作伙伴"
                        onAdd={() => setModal({ type: "partner" })}
                        action="添加伙伴"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {page === "venues" && (
            <div className="venue-grid">
              {data.venues.map((v) => (
                <article className="panel venue-card" key={v.id}>
                  <div className="venue-top">
                    <span className="venue-icon">
                      <Building2 size={24} />
                    </span>
                    <button
                      className="icon-button"
                      aria-label={"编辑" + v.name}
                      onClick={() => setModal({ type: "venue", value: v })}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  <span className="eyebrow">{v.city}</span>
                  <h2>{v.name}</h2>
                  <p>
                    <MapPin size={14} />
                    {v.address || "暂未填写详细地址"}
                  </p>
                  <div className="hall-label">
                    展厅 / 宴会厅 <span>{v.halls.length}</span>
                  </div>
                  <div className="hall-list">
                    {v.halls.map((h, i) => (
                      <span key={i}>{h}</span>
                    ))}
                  </div>
                </article>
              ))}
              {!data.venues.length && (
                <div className="panel">
                  <Empty
                    text="记录你的第一个拍摄场地"
                    onAdd={() => setModal({ type: "venue" })}
                    action="添加场地"
                  />
                </div>
              )}
            </div>
          )}
          {page === "reminders" && (
            <>
              <div className="reminder-summary">
                <div>
                  <Bell size={24} />
                  <strong>{alerts.length}</strong>
                  <span>条待办提醒</span>
                </div>
                <button className="button" onClick={() => navigate("settings")}>
                  <Settings size={15} />
                  提醒设置
                </button>
              </div>
              <section className="panel reminder-list">
                {alerts.length ? (
                  alerts.map((a) => (
                    <button
                      key={a.id}
                      className="reminder-row"
                      onClick={() =>
                        setModal({ type: "detail", value: a.order })
                      }
                    >
                      <span className={"reminder-symbol " + a.tone}>
                        {a.kind === "settlement" || a.kind === "deposit" ? (
                          <Wallet size={20} />
                        ) : a.kind === "change" ? (
                          <RefreshCw size={20} />
                        ) : (
                          <CalendarDays size={20} />
                        )}
                      </span>
                      <div>
                        <h3>{a.text}</h3>
                        <p>
                          {a.order.title} · {partner(a.order.partnerId)?.name} ·{" "}
                          {a.order.shootDate}
                        </p>
                      </div>
                      <span className="text-button">
                        处理 <ArrowRight size={15} />
                      </span>
                    </button>
                  ))
                ) : (
                  <Empty text="一切安排妥当，暂无待办" />
                )}
              </section>
            </>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <div className="section-header">
                  <h2>
                    <HardDrive size={19} />
                    数据备份
                  </h2>
                  <Badge tone="blue">
                    {mode === "demo" ? "演示空间" : "个人空间"}
                  </Badge>
                </div>
                <p>
                  数据只保存在当前设备的当前浏览器中。清理浏览器数据会删除记录，请定期导出备份。导入可将数据迁移到另一台设备。
                </p>
                <div className="storage-facts">
                  <span>
                    <strong>{data.orders.length}</strong> 场订单
                  </span>
                  <span>
                    <strong>{data.partners.length}</strong> 位伙伴
                  </span>
                  <span>
                    <strong>{data.venues.length}</strong> 处场地
                  </span>
                </div>
                <div
                  className={"backup-summary " + (backup.due ? "due" : "")}
                  aria-label="备份记录"
                >
                  <h3>
                    {storageError
                      ? "请先保留原始存储文件"
                      : backupCopy[backup.reason][0]}
                  </h3>
                  {!storageError && <p>{backupCopy[backup.reason][1]}</p>}
                  <p>
                    最近发起导出：
                    {backup.lastExportedAt
                      ? backupTime(backup.lastExportedAt)
                      : "本机暂无记录"}
                  </p>
                  <small>
                    网页只能记录发起下载的时间，请确认文件已保存。CSV
                    和原始存储下载不计为完整备份。
                  </small>
                  {backup.due && !backup.show && (
                    <p>
                      已暂缓至 {backupTime(backup.snoozedUntil)}{" "}
                      再提醒，仍可随时导出。
                    </p>
                  )}
                </div>
                <div className="button-row">
                  <button className="button primary" onClick={exportData}>
                    <Download size={16} />
                    导出完整备份
                  </button>
                  <button
                    className="button"
                    onClick={() => importRef.current.click()}
                  >
                    <Upload size={16} />
                    导入备份
                  </button>
                </div>
                <button
                  className="text-button raw-backup"
                  onClick={() => {
                    let raw;
                    try {
                      raw = localStorage.getItem(STORAGE + mode) || "{}";
                    } catch {
                      notify("浏览器禁止读取存储");
                      return;
                    }
                    download(raw, `拾光原始数据-${today()}.json`);
                  }}
                >
                  下载原始存储文件
                </button>
              </section>
              <section className="panel settings-card">
                <div className="section-header">
                  <h2>
                    <Bell size={19} />
                    提醒设置
                  </h2>
                </div>
                <p>
                  每次打开工具时自动检查，提醒显示在工作台与提醒中心。关闭网页后不会发送手机推送。
                </p>
                {[
                  ["before3", "拍摄前 3 天提醒"],
                  ["before1", "拍摄前 1 天提醒"],
                  ["unconfirmed", "派单隔日仍未确认"],
                  ["deposit", "未付或部分定金"],
                  ["settlement", "拍摄完成后未结清"],
                  ["changes", "改期、取消记录提醒"],
                ].map(([key, label]) => (
                  <label className="switch-row" key={key}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={data.settings[key]}
                      onChange={(e) =>
                        persist({
                          ...data,
                          settings: {
                            ...data.settings,
                            [key]: e.target.checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </section>
              <section className="panel settings-card">
                <div className="section-header">
                  <h2>
                    <Camera size={19} />
                    工作空间
                  </h2>
                </div>
                <p>
                  演示数据和个人数据独立保存，切换空间不会覆盖你的派单记录。演示中的姓名、号码与订单仅用于功能体验。
                </p>
                <button
                  className="button soft"
                  onClick={() =>
                    switchMode(mode === "demo" ? "personal" : "demo")
                  }
                >
                  {mode === "demo" ? "进入个人空间" : "查看演示空间"}
                  <ArrowRight size={16} />
                </button>
              </section>
              <section className="panel settings-card">
                <div className="section-header">
                  <h2>
                    <Info size={19} />
                    金额与日期说明
                  </h2>
                </div>
                <p>
                  待结金额包含报销车费，并扣除已付定金和尾款。仅付定金时结算状态仍为未结账。无需结账仅适用于应付合计为零的订单。取消、拒绝不会抹去付款记录，请按实际费用编辑应付金额。
                </p>
                <p>
                  日期按北京时间显示。同一伙伴同一天的拍摄时间不能重叠；改期时请同时更新拍摄日期和确认状态。
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Camera size={13} />
              拾光派单 · 让创作有序，让合作安心
            </span>
            <span>个人使用版 · 数据保存在本机</span>
          </footer>
        </main>
      </div>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={importFile}
      />
      {modal?.type === "order" && (
        <OrderForm
          order={modal.value}
          copySource={modal.copySource}
          data={data}
          onSave={saveOrder}
          onClose={() => {
            const source = data.orders.find(
              (o) => o.id === modal.copySource?.id,
            );
            setModal(source ? { type: "detail", value: source } : null);
          }}
          onAddPartner={(draft) =>
            setModal({
              type: "partner",
              pendingOrder: draft,
              copySource: modal.copySource,
            })
          }
        />
      )}
      {modal?.type === "detail" && (
        <OrderDetail
          order={
            data.orders.find((o) => o.id === modal.value.id) || modal.value
          }
          partner={partner(modal.value.partnerId)}
          onClose={() => setModal(null)}
          onEdit={() =>
            setModal({
              type: "order",
              value:
                data.orders.find((o) => o.id === modal.value.id) || modal.value,
            })
          }
          onDelete={() => deleteOrder(modal.value)}
          onCopy={() => {
            const source = data.orders.find((o) => o.id === modal.value.id);
            if (source)
              setModal({
                type: "order",
                value: duplicateOrder(source),
                copySource: { id: source.id, title: source.title },
              });
          }}
          onPay={() =>
            setModal({
              type: "payment",
              value:
                data.orders.find((o) => o.id === modal.value.id) || modal.value,
            })
          }
          onVoid={(entryId) =>
            setModal({
              type: "void-payment",
              value:
                data.orders.find((o) => o.id === modal.value.id) || modal.value,
              entryId,
            })
          }
          onBaseline={() =>
            setModal({
              type: "payment-baseline",
              value:
                data.orders.find((o) => o.id === modal.value.id) || modal.value,
            })
          }
        />
      )}
      {modal?.type === "payment" && (
        <PaymentForm
          order={modal.value}
          onClose={() => setModal({ type: "detail", value: modal.value })}
          onSave={(o) => saveOrder(o, "payment")}
        />
      )}
      {modal?.type === "void-payment" && (
        <VoidPaymentForm
          order={modal.value}
          entryId={modal.entryId}
          onSave={(o) => saveOrder(o, "payment")}
          onClose={() => setModal({ type: "detail", value: modal.value })}
        />
      )}
      {modal?.type === "payment-baseline" && (
        <BaselineForm
          order={modal.value}
          onSave={(o) => saveOrder(o, "payment")}
          onClose={() => setModal({ type: "detail", value: modal.value })}
        />
      )}
      {modal?.type === "partner" && (
        <PartnerForm
          value={modal.value}
          onClose={() =>
            setModal(
              modal.pendingOrder
                ? {
                    type: "order",
                    value: modal.pendingOrder,
                    copySource: modal.copySource,
                  }
                : null,
            )
          }
          onSave={(p) => {
            if (
              persist({
                ...data,
                partners: modal.value
                  ? data.partners.map((v) => (v.id === p.id ? p : v))
                  : [...data.partners, p],
              })
            ) {
              setModal(
                modal.nextOrder || modal.pendingOrder
                  ? {
                      type: "order",
                      copySource: modal.copySource,
                      value: {
                        ...(modal.pendingOrder || blankOrder(selected)),
                        partnerId: p.id,
                      },
                    }
                  : null,
              );
              notify("伙伴信息已保存");
            }
          }}
          onDelete={
            modal.value
              ? () => {
                  const p = modal.value;
                  if (data.orders.some((o) => o.partnerId === p.id)) {
                    notify("该伙伴已有派单记录，不能删除");
                    return;
                  }
                  setModal({
                    type: "confirm",
                    title: "删除合作伙伴？",
                    message: `删除「${p.name}」的联系信息。`,
                    action: "确认删除",
                    danger: true,
                    onConfirm: () => {
                      if (
                        persist({
                          ...data,
                          partners: data.partners.filter((v) => v.id !== p.id),
                        })
                      )
                        setModal(null);
                    },
                  });
                }
              : null
          }
        />
      )}
      {modal?.type === "venue" && (
        <VenueForm
          value={modal.value}
          onClose={() => setModal(null)}
          onSave={(v) => {
            if (
              persist({
                ...data,
                venues: modal.value
                  ? data.venues.map((x) => (x.id === v.id ? v : x))
                  : [...data.venues, v],
              })
            ) {
              setModal(null);
              notify("场地已保存；历史订单中的地址保持原记录");
            }
          }}
          onDelete={
            modal.value
              ? () => {
                  const v = modal.value;
                  setModal({
                    type: "confirm",
                    title: "删除常用场地？",
                    message: "历史派单中的场地和展厅信息仍会保留。",
                    action: "确认删除",
                    danger: true,
                    onConfirm: () => {
                      if (
                        persist({
                          ...data,
                          venues: data.venues.filter((x) => x.id !== v.id),
                        })
                      )
                        setModal(null);
                    },
                  });
                }
              : null
          }
        />
      )}
      {modal?.type === "confirm" && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <div className="confirm-body">
            <AlertCircle size={28} />
            <p>{modal.message}</p>
          </div>
          <div className="modal-footer">
            <button className="button" onClick={() => setModal(null)}>
              取消
            </button>
            <button
              className={"button " + (modal.danger ? "danger" : "primary")}
              onClick={modal.onConfirm}
            >
              {modal.action}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <Toast message={toast} modal={modal} onClose={() => setToast("")} />
      )}
    </div>
  );
}

function OrderForm({ order, copySource, data, onSave, onClose, onAddPartner }) {
  const [o, setO] = useState({ ...order });
  const set = (k, v) =>
    setO((prev) => ({
      ...prev,
      [k]: v,
      ...(k === "dispatchStatus" && v === "已取消"
        ? { executionStatus: "已取消" }
        : {}),
    }));
  const venue = data.venues.find(
    (v) => v.city === o.city && v.name === o.venue,
  );
  const p = data.partners.find((p) => p.id === o.partnerId);
  return (
    <Modal
      title={
        copySource
          ? "复制为新派单"
          : data.orders.some((x) => x.id === o.id)
            ? "编辑派单"
            : "安排一场新的拍摄"
      }
      subtitle="从沟通到交付，把重要的细节记下来。"
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(o);
        }}
      >
        <div className="form-body">
          {copySource && (
            <div className="info-strip copy-order-hint">
              <strong>
                沿用「{copySource.title}」的伙伴、地点、时段和费用约定
              </strong>
              <p>
                请填写新主题和拍摄日期，并核对沟通日期。车费、付款与历史备注已清空，状态重置为待确认、待拍摄。
              </p>
            </div>
          )}
          <div className="form-section-title">
            <span>01</span>拍摄与派单
          </div>
          <div className="form-grid">
            <Field label="拍摄主题 *" span>
              <input
                required
                maxLength={120}
                value={o.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="例如：林先生 & 苏小姐婚礼"
              />
            </Field>
            <Field label="单子类型">
              <select
                value={o.type}
                onChange={(e) => set("type", e.target.value)}
              >
                {TYPES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="拍摄日期 *">
              <input
                required
                type="date"
                value={o.shootDate}
                onChange={(e) => set("shootDate", e.target.value)}
              />
            </Field>
            <Field label="开始时间 *">
              <input
                required
                type="time"
                value={o.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
            <Field label="结束时间 *">
              <input
                required
                type="time"
                value={o.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>
            <Field label="派单沟通日期 *">
              <input
                required
                type="date"
                value={o.communicatedDate}
                onChange={(e) => set("communicatedDate", e.target.value)}
              />
            </Field>
            <Field label="合作伙伴 *">
              <select
                required
                value={o.partnerId}
                onChange={(e) => set("partnerId", e.target.value)}
              >
                <option value="">请选择伙伴</option>
                {data.partners.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </Field>
            <div className="field span2">
              <div className="partner-form-hint">
                <span>
                  <Phone size={13} />
                  {p?.phone || "选择伙伴后显示联系方式"}
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onAddPartner(o)}
                >
                  <Plus size={13} />
                  添加伙伴
                </button>
              </div>
            </div>
          </div>
          <div className="form-section-title">
            <span>02</span>拍摄地点
          </div>
          <div className="form-grid">
            <Field label="城市 *">
              <input
                required
                value={o.city}
                maxLength={40}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="酒店 / 场地 *">
              <input
                list="venues"
                required
                value={o.venue}
                maxLength={100}
                onChange={(e) => {
                  const v = data.venues.find(
                    (v) => v.city === o.city && v.name === e.target.value,
                  );
                  setO({
                    ...o,
                    venue: e.target.value,
                    ...(v
                      ? { city: v.city, address: v.address, hall: "" }
                      : {}),
                  });
                }}
                placeholder="选择或填写场地"
              />
              <datalist id="venues">
                {data.venues
                  .filter((v) => v.city === o.city)
                  .map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.city}
                    </option>
                  ))}
              </datalist>
            </Field>
            <Field label="展厅 / 宴会厅 *">
              <input
                list="halls"
                required
                value={o.hall}
                maxLength={100}
                onChange={(e) => set("hall", e.target.value)}
                placeholder="例如：3 楼 · 水晶厅"
              />
              <datalist id="halls">
                {venue?.halls.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </datalist>
            </Field>
            <Field label="详细地址">
              <input
                value={o.address}
                maxLength={240}
                onChange={(e) => set("address", e.target.value)}
                placeholder="详细到门牌号"
              />
            </Field>
          </div>
          <div className="form-section-title">
            <span>03</span>费用与付款 <small>单位：元</small>
          </div>
          <div className="form-grid">
            {[
              ["amount", "拍摄费用 *"],
              ["travelAmount", "报销车费（无需填 0）"],
              ["depositRequired", "约定定金（0 表示无需）"],
              ["depositPaid", "已付定金"],
              ["settlementPaid", "已付尾款（不含定金）"],
            ].map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  type="number"
                  required
                  min="0"
                  max={key === "settlementPaid" ? "200000000" : "100000000"}
                  step="0.01"
                  readOnly={
                    !!o.paymentLedger &&
                    ["depositPaid", "settlementPaid"].includes(key)
                  }
                  value={o[key]}
                  onChange={(e) =>
                    set(
                      key,
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </Field>
            ))}
            <Field label="车费说明" span>
              <input
                value={o.travelNote || ""}
                maxLength={500}
                onChange={(e) => set("travelNote", e.target.value)}
                placeholder="例如：往返打车 120 元，已核对车票"
              />
            </Field>
            <Field label="定金支付日期">
              <input
                type="date"
                required={o.depositPaid > 0}
                readOnly={!!o.paymentLedger}
                value={o.depositDate}
                onChange={(e) => set("depositDate", e.target.value)}
              />
            </Field>
            <Field label="尾款支付日期">
              <input
                type="date"
                required={o.settlementPaid > 0}
                readOnly={!!o.paymentLedger}
                value={o.settlementDate}
                onChange={(e) => set("settlementDate", e.target.value)}
              />
            </Field>
          </div>
          {o.paymentLedger && (
            <div className="info-strip ledger-edit-hint">
              <Info size={15} />
              已付金额及日期由付款记录自动汇总。新增付款、撤销或更正初始累计，请返回派单详情操作。
            </div>
          )}
          <div className="form-total">
            <span>
              应付合计 <strong>¥ {money(payable(o))}</strong>
            </span>
            <span>
              已付合计 <strong>¥ {money(paid(o))}</strong>
            </span>
            <span>
              待结金额 <strong>¥ {money(balance(o))}</strong>
            </span>
          </div>
          <div className="form-section-title">
            <span>04</span>状态与备注
          </div>
          <div className="form-grid">
            <Field label="派单状态">
              <select
                value={o.dispatchStatus}
                onChange={(e) => set("dispatchStatus", e.target.value)}
              >
                {DISPATCH.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="执行状态">
              <select
                value={o.executionStatus}
                onChange={(e) => set("executionStatus", e.target.value)}
              >
                {EXECUTION.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="拍摄备注" span>
              <textarea
                rows={2}
                value={o.note}
                maxLength={2000}
                onChange={(e) => set("note", e.target.value)}
                placeholder="到场时间、机位要求、联系人等"
              />
            </Field>
            <Field label="结算备注" span>
              <textarea
                rows={2}
                value={o.paymentNote}
                maxLength={2000}
                onChange={(e) => set("paymentNote", e.target.value)}
                placeholder="付款方式、收款确认等"
              />
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="button primary">
            <Check size={16} />
            保存派单
          </button>
        </div>
      </form>
    </Modal>
  );
}

function OrderDetail({
  order: o,
  partner: p,
  onClose,
  onEdit,
  onCopy,
  onDelete,
  onPay,
  onVoid,
  onBaseline,
}) {
  return (
    <Modal
      title="派单详情"
      subtitle={`沟通于 ${o.communicatedDate}`}
      onClose={onClose}
      wide
    >
      <div className="detail-body">
        <div className="detail-title">
          <span
            className={
              "type-label " + (o.type === "婚庆" ? "wedding" : "event")
            }
          >
            {o.type}
          </span>
          <h2>{o.title}</h2>
        </div>
        <div className="detail-tools">
          <div className="detail-badges">
            <Badge>{o.dispatchStatus}</Badge>
            <Badge>{o.executionStatus}</Badge>
            <Badge>{depositStatus(o)}</Badge>
            <Badge>{settlementStatus(o)}</Badge>
          </div>
          <button className="button copy-order-button" onClick={onCopy}>
            <Copy size={15} />
            复制派单
          </button>
        </div>
        <div className="detail-block">
          <div>
            <CalendarDays size={19} />
            <span>拍摄时间</span>
            <strong>
              {o.shootDate}　{o.startTime} – {o.endTime}
            </strong>
          </div>
          <div>
            <Users size={19} />
            <span>合作伙伴</span>
            <strong>
              {p?.name}　{p?.phone}
            </strong>
          </div>
          <div>
            <MapPin size={19} />
            <span>拍摄地点</span>
            <strong>
              {o.city} · {o.venue}
              <small>
                {o.hall}　{o.address}
              </small>
            </strong>
          </div>
        </div>
        <div className="payment-overview">
          <div>
            <span>应付合计（含车费）</span>
            <strong>¥ {money(payable(o))}</strong>
          </div>
          <div>
            <span>已付合计</span>
            <strong>¥ {money(paid(o))}</strong>
          </div>
          <div>
            <span>待结金额</span>
            <strong>¥ {money(balance(o))}</strong>
          </div>
        </div>
        <div className="payment-lines">
          <p>
            <span>拍摄费用</span>
            <strong>¥ {money(o.amount)}</strong>
            <small>派单基础费用</small>
          </p>
          <p>
            <span>报销车费</span>
            <strong>¥ {money(o.travelAmount || 0)}</strong>
            <small>{o.travelNote || "无车费说明"}</small>
          </p>
          <p>
            <span>定金 / 约定定金</span>
            <strong>
              ¥ {money(o.depositPaid)} / ¥ {money(o.depositRequired)}
            </strong>
            <small>{o.depositDate || "尚无付款日期"}</small>
          </p>
          <p>
            <span>已付尾款</span>
            <strong>¥ {money(o.settlementPaid)}</strong>
            <small>{o.settlementDate || "尚无付款日期"}</small>
          </p>
        </div>
        <PaymentHistory order={o} onVoid={onVoid} onBaseline={onBaseline} />
        {o.note && (
          <div className="detail-note">
            <h4>拍摄备注</h4>
            <p>{o.note}</p>
          </div>
        )}
        {o.paymentNote && (
          <div className="detail-note">
            <h4>结算备注</h4>
            <p>{o.paymentNote}</p>
          </div>
        )}
      </div>
      <div className="modal-footer spread">
        <button
          className="icon-button delete-button"
          aria-label="删除派单"
          onClick={onDelete}
        >
          <Trash2 size={18} />
        </button>
        <div className="button-row">
          <button className="button" onClick={onEdit}>
            <Pencil size={15} />
            编辑派单
          </button>
          <button className="button primary" onClick={onPay}>
            <Wallet size={16} />
            登记付款
          </button>
        </div>
      </div>
    </Modal>
  );
}
function PaymentHistory({ order, onVoid, onBaseline }) {
  const ledger = paymentLedger(order);
  const base = currentBaseline(ledger);
  const records = [
    ...ledger.entries.map((e) => ({ ...e, recordType: "payment" })),
    ...ledger.revisions.map((e) => ({ ...e, recordType: "revision" })),
  ].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const stamp = (value) =>
    new Date(value).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section className="payment-history" aria-label="付款流水">
      <div className="payment-history-heading">
        <h3>
          <Wallet size={17} />
          付款流水{" "}
          <span className="count-chip">
            {ledger.entries.filter((e) => !e.voidedAt).length} 笔有效
          </span>
        </h3>
        <button className="text-button" onClick={onBaseline}>
          更正初始累计
        </button>
      </div>
      <div className="ledger-baseline">
        <div>
          <strong>历史 / 初始累计</strong>
          <span>
            定金 ¥ {money(base.depositPaid)} · 尾款 ¥{" "}
            {money(base.settlementPaid)}
          </span>
        </div>
        <p>原有记录为累计金额，未拆分为单笔付款。</p>
        {(base.depositPaid > 0 || base.settlementPaid > 0) && (
          <p>
            {base.depositPaid > 0 && <>原定金日期 {base.depositDate}</>}
            {base.depositPaid > 0 && base.settlementPaid > 0 && " · "}
            {base.settlementPaid > 0 && <>原尾款日期 {base.settlementDate}</>}
          </p>
        )}
        {base.note && <p className="ledger-note">{base.note}</p>}
        {ledger.revisions.length > 0 && (
          <details>
            <summary>查看首次保留的累计记录</summary>
            <p>
              定金 ¥ {money(ledger.baseline.depositPaid)}（
              {ledger.baseline.depositDate || "未记录日期"}） · 尾款 ¥{" "}
              {money(ledger.baseline.settlementPaid)}（
              {ledger.baseline.settlementDate || "未记录日期"}）
            </p>
            {ledger.baseline.note && (
              <p className="ledger-note">{ledger.baseline.note}</p>
            )}
          </details>
        )}
      </div>
      {!records.length && (
        <p className="ledger-empty">
          还没有逐笔记录。下一次登记付款会保留在这里。
        </p>
      )}
      <ol className="ledger-list">
        {records.map((e) => (
          <li
            key={e.id}
            className={"ledger-row " + (e.voidedAt ? "voided" : "")}
          >
            <div className="ledger-row-heading">
              <div>
                <span className="ledger-symbol">
                  {e.recordType === "revision" ? (
                    <Pencil size={16} />
                  ) : (
                    <Wallet size={16} />
                  )}
                </span>
                <strong>
                  {e.recordType === "revision"
                    ? "更正初始累计"
                    : e.kind === "deposit"
                      ? "支付定金"
                      : "支付尾款"}
                </strong>
                {e.voidedAt && <Badge tone="gray">已撤销</Badge>}
              </div>
              {e.recordType === "payment" && (
                <strong className="ledger-amount">¥ {money(e.amount)}</strong>
              )}
            </div>
            {e.recordType === "payment" ? (
              <>
                <p className="ledger-row-meta">
                  付款日期 <time dateTime={e.date}>{e.date}</time>
                  <span>登记于 {stamp(e.recordedAt)}</span>
                </p>
                {e.note && <p className="ledger-note">{e.note}</p>}
                {e.voidedAt ? (
                  <p className="ledger-void-reason">
                    撤销原因：{e.voidReason}
                    <span>撤销于 {stamp(e.voidedAt)}</span>
                  </p>
                ) : (
                  <button
                    className="text-button ledger-void-button"
                    onClick={() => onVoid(e.id)}
                    aria-label={
                      "撤销" +
                      (e.kind === "deposit" ? "定金" : "尾款") +
                      "付款 " +
                      money(e.amount) +
                      " 元"
                    }
                  >
                    撤销这笔记录
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="ledger-row-meta">
                  更正后：定金 ¥ {money(e.value.depositPaid)} · 尾款 ¥{" "}
                  {money(e.value.settlementPaid)}
                </p>
                <p className="ledger-note">更正原因：{e.reason}</p>
                <p className="ledger-row-meta">{stamp(e.recordedAt)}</p>
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
function VoidPaymentForm({ order, entryId, onSave, onClose }) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const entry = paymentLedger(order).entries.find((e) => e.id === entryId);
  return (
    <Modal title="撤销付款记录" subtitle={order.title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(voidPayment(order, entryId, reason));
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="form-body">
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="info-strip">
            {entry?.date} · {entry?.kind === "deposit" ? "定金" : "尾款"} ¥{" "}
            {money(entry?.amount)}
            。撤销后，这笔金额不再计入已付，原记录和原因会保留。请同时核对实际款项。
          </div>
          <Field label="撤销原因 *">
            <textarea
              required
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：重复登记，实际只支付了一次"
            />
          </Field>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            返回
          </button>
          <button type="submit" className="button danger">
            确认撤销记录
          </button>
        </div>
      </form>
    </Modal>
  );
}
function BaselineForm({ order, onSave, onClose }) {
  const [value, setValue] = useState({
      ...currentBaseline(paymentLedger(order)),
    }),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const change = (key, next) => {
    setValue({ ...value, [key]: next });
    setError("");
  };
  return (
    <Modal title="更正初始累计" subtitle={order.title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(revisePaymentBaseline(order, value, reason));
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="form-body">
          <div className="info-strip">
            填写开始使用逐笔记录时的累计金额。更正原因会留档，后续逐笔付款仍自动计入总额。
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="form-grid">
            <Field label="初始已付定金 *">
              <input
                required
                type="number"
                min="0"
                max="100000000"
                step="0.01"
                value={value.depositPaid}
                onChange={(e) =>
                  change(
                    "depositPaid",
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="初始定金日期">
              <input
                required={value.depositPaid > 0}
                type="date"
                value={value.depositDate}
                onChange={(e) => change("depositDate", e.target.value)}
              />
            </Field>
            <Field label="初始已付尾款 *">
              <input
                required
                type="number"
                min="0"
                max="200000000"
                step="0.01"
                value={value.settlementPaid}
                onChange={(e) =>
                  change(
                    "settlementPaid",
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="初始尾款日期">
              <input
                required={value.settlementPaid > 0}
                type="date"
                value={value.settlementDate}
                onChange={(e) => change("settlementDate", e.target.value)}
              />
            </Field>
            <Field label="初始累计说明" span>
              <textarea
                rows={2}
                maxLength={2000}
                value={value.note}
                onChange={(e) => change("note", e.target.value)}
              />
            </Field>
            <Field label="更正原因 *" span>
              <textarea
                required
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="说明原记录哪里填错了"
              />
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            返回
          </button>
          <button type="submit" className="button primary">
            确认更正
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PaymentForm({ order, onSave, onClose }) {
  const [kind, setKind] = useState(
      order.depositPaid < order.depositRequired ? "deposit" : "settlement",
    ),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(today()),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const remaining =
    kind === "deposit"
      ? Math.min(
          balance(order),
          Math.round((order.depositRequired - order.depositPaid) * 100) / 100,
        )
      : balance(order);
  return (
    <Modal title="登记一笔付款" subtitle={order.title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amount);
          if (!Number.isFinite(n) || n <= 0 || n > remaining) return;
          try {
            onSave(recordPayment(order, { kind, amount: n, date, note }));
          } catch (err) {
            setError(err.message);
          }
        }}
      >
        <div className="form-body">
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="form-grid">
            <Field label="付款类型" span>
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setAmount("");
                }}
              >
                <option value="deposit">支付定金</option>
                <option value="settlement">支付尾款</option>
              </select>
            </Field>
            <div className="info-strip span2">
              {kind === "deposit" ? "未付定金" : "剩余应付"} ¥{" "}
              {money(remaining)}，本次付款会单独留存，自动累计到已付金额。
            </div>
            <Field label="本次付款金额 *">
              <input
                autoFocus
                type="number"
                min="0.01"
                max={remaining}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="付款日期 *">
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="text-button"
              onClick={() => setAmount(String(remaining))}
            >
              填入剩余金额 ¥ {money(remaining)}
            </button>
            <Field label="本次付款备注" span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={2000}
                placeholder="例如：已通过微信转账，伙伴已确认"
              />
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            返回
          </button>
          <button
            type="submit"
            disabled={remaining <= 0}
            className="button primary"
          >
            确认登记
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PartnerForm({ value, onSave, onClose, onDelete }) {
  const [p, setP] = useState(
    value || { id: uid(), name: "", phone: "", role: "摄影师", note: "" },
  );
  return (
    <Modal
      title={value ? "编辑合作伙伴" : "添加合作伙伴"}
      subtitle="先认识这位伙伴，再安排下一场拍摄。"
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (p.name.trim()) onSave({ ...p, name: p.name.trim() });
        }}
      >
        <div className="form-body form-grid">
          <Field label="伙伴姓名 *">
            <input
              required
              maxLength={40}
              value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })}
            />
          </Field>
          <Field label="联系方式">
            <input
              type="tel"
              maxLength={40}
              value={p.phone}
              onChange={(e) => setP({ ...p, phone: e.target.value })}
              placeholder="手机号 / 微信号"
            />
          </Field>
          <Field label="合作角色" span>
            <input
              maxLength={60}
              value={p.role}
              onChange={(e) => setP({ ...p, role: e.target.value })}
              placeholder="摄影师、摄像师等"
            />
          </Field>
          <Field label="备注" span>
            <textarea
              rows={3}
              maxLength={1000}
              value={p.note}
              onChange={(e) => setP({ ...p, note: e.target.value })}
            />
          </Field>
        </div>
        <div className="modal-footer spread">
          {onDelete ? (
            <button
              type="button"
              className="icon-button delete-button"
              aria-label="删除伙伴"
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <span />
          )}
          <div className="button-row">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button primary">
              保存伙伴
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
function VenueForm({ value, onSave, onClose, onDelete }) {
  const [v, setV] = useState(
      value || { id: uid(), city: "重庆", name: "", address: "", halls: [] },
    ),
    [halls, setHalls] = useState(value?.halls.join("\n") || "");
  return (
    <Modal title={value ? "编辑场地" : "添加常用场地"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.city.trim() && v.name.trim())
            onSave({
              ...v,
              city: v.city.trim(),
              name: v.name.trim(),
              halls: [
                ...new Set(
                  halls
                    .split("\n")
                    .map((h) => h.trim())
                    .filter(Boolean),
                ),
              ],
            });
        }}
      >
        <div className="form-body form-grid">
          <Field label="城市 *">
            <input
              required
              value={v.city}
              maxLength={40}
              onChange={(e) => setV({ ...v, city: e.target.value })}
            />
          </Field>
          <Field label="场地名称 *">
            <input
              required
              value={v.name}
              maxLength={100}
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="详细地址" span>
            <input
              value={v.address}
              maxLength={240}
              onChange={(e) => setV({ ...v, address: e.target.value })}
            />
          </Field>
          <Field label="展厅 / 宴会厅（每行一个）" span>
            <textarea
              required
              rows={5}
              value={halls}
              maxLength={2000}
              onChange={(e) => setHalls(e.target.value)}
              placeholder={"3 楼 · 水晶厅\n5 楼 · 宴会厅"}
            />
          </Field>
        </div>
        <div className="modal-footer spread">
          {onDelete ? (
            <button
              type="button"
              className="icon-button delete-button"
              aria-label="删除场地"
              onClick={onDelete}
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <span />
          )}
          <div className="button-row">
            <button type="button" className="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button primary">
              保存场地
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
