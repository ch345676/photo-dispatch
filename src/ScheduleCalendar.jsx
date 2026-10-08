import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Users,
  ArrowRight,
} from "lucide-react";
import { active, shiftDate, today } from "./domain.mjs";
import "./schedule-calendar.css";

export default function ScheduleCalendar({
  orders,
  selected,
  month,
  setMonth,
  field,
  setField,
  onSelect,
  onNew,
}) {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5));
  const first = month + "-01";
  const offset = (new Date(first + "T12:00:00").getDay() + 6) % 7;
  const days = new Date(year, monthNumber, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((days + offset) / 7) * 7 },
    (_, i) => shiftDate(first, i - offset),
  );
  const visibleOrders = orders
    .filter(active)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const monthCount = visibleOrders.filter((o) =>
    o[field].startsWith(month),
  ).length;
  function moveMonth(delta) {
    const next = new Date(year, monthNumber - 1 + delta, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return (
    <section className="schedule-home" aria-label="派单日历">
      <div className="schedule-heading">
        <div>
          <span className="eyebrow">YOUR DAYS, IN FOCUS</span>
          <h1>日程概览</h1>
          <p>
            本月 {monthCount} 场{field === "shootDate" ? "拍摄" : "派单沟通"} ·
            点击日期展开安排
          </p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={18} />
          新建派单
        </button>
      </div>
      <div className="month-sheet">
        <div className="month-sheet-tools">
          <label className="schedule-month">
            <CalendarDays size={19} />
            <input
              type="month"
              aria-label="日历月份"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <div className="month-arrows">
            <button
              className="icon-button"
              aria-label="上个月"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft size={20} />
            </button>
            <button
              className="schedule-today"
              onClick={() => {
                setMonth(today().slice(0, 7));
                onSelect(today());
              }}
            >
              今天
            </button>
            <button
              className="icon-button"
              aria-label="下个月"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <div className="schedule-view">
          <div className="segmented" role="group" aria-label="日历日期类型">
            <button
              className={field === "shootDate" ? "selected" : ""}
              aria-pressed={field === "shootDate"}
              onClick={() => setField("shootDate")}
            >
              按拍摄日期
            </button>
            <button
              className={field === "communicatedDate" ? "selected" : ""}
              aria-pressed={field === "communicatedDate"}
              onClick={() => setField("communicatedDate")}
            >
              按沟通日期
            </button>
          </div>
          <span>每一格，都是值得记录的一天</span>
        </div>
        <div
          className="month-sheet-grid"
          style={{ "--week-count": cells.length / 7 }}
        >
          {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
            <div className="month-weekday" key={day}>
              周{day}
            </div>
          ))}
          {cells.map((date) => {
            const items = visibleOrders.filter((o) => o[field] === date);
            return (
              <button
                key={date}
                className={
                  "month-day" +
                  (date.slice(0, 7) !== month ? " outside" : "") +
                  (date === selected ? " selected" : "") +
                  (date === today() ? " today" : "")
                }
                aria-label={`${date}，${items.length} ${field === "shootDate" ? "场拍摄" : "次沟通"}`}
                aria-pressed={date === selected}
                aria-haspopup="dialog"
                onClick={() => {
                  if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7));
                  onSelect(date);
                }}
              >
                <span className="month-day-number">
                  {Number(date.slice(-2))}
                </span>
                <span className="month-day-events">
                  {items.slice(0, 2).map((order) => (
                    <span
                      key={order.id}
                      className={order.type === "婚庆" ? "wedding" : "event"}
                      title={`${order.startTime} ${order.title}`}
                    >
                      {order.title}
                    </span>
                  ))}
                  {items.length > 2 && <small>+{items.length - 2} 场</small>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="month-sheet-foot">
          <div className="calendar-legend">
            <span>
              <i className="wedding" />
              婚庆
            </span>
            <span>
              <i className="event" />
              活动 / 其他
            </span>
          </div>
          <span>点击日期查看详情</span>
        </div>
      </div>
    </section>
  );
}

export function DayAgenda({ orders, partners, field, onOpen, onNew }) {
  return (
    <>
      <div className="day-agenda-list">
        {orders.length ? (
          orders.map((order) => (
            <button
              className="agenda-order"
              key={order.id}
              onClick={() => onOpen(order)}
            >
              <span className="agenda-time">
                <strong>{order.startTime}</strong>
                <small>{order.endTime}</small>
              </span>
              <span className="agenda-content">
                <span className="agenda-title">
                  <span
                    className={
                      "agenda-type " +
                      (order.type === "婚庆" ? "wedding" : "event")
                    }
                  >
                    {order.type}
                  </span>
                  <strong>{order.title}</strong>
                </span>
                {field === "communicatedDate" && (
                  <span className="agenda-shoot-date">
                    拍摄日期 {order.shootDate}
                  </span>
                )}
                <span>
                  <MapPin size={14} />
                  {order.city} · {order.venue} · {order.hall}
                </span>
                <span>
                  <Users size={14} />
                  {partners.find((p) => p.id === order.partnerId)?.name ||
                    "待安排"}
                  <em>
                    {order.dispatchStatus} · {order.executionStatus}
                  </em>
                </span>
              </span>
              <ArrowRight className="agenda-arrow" size={17} />
            </button>
          ))
        ) : (
          <div className="agenda-empty">
            <CalendarDays size={34} />
            <h3>
              {field === "shootDate"
                ? "当天没有拍摄安排"
                : "当天没有派单沟通记录"}
            </h3>
            <p>可以从这里记录一场新的安排。</p>
          </div>
        )}
      </div>
      <div className="agenda-footer">
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          {field === "shootDate" ? "为当天新建派单" : "记录当天沟通"}
        </button>
      </div>
    </>
  );
}
