import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Download, Info, Search, Wallet } from "lucide-react";
import { money } from "./domain.mjs";
import {
  paymentRecords,
  summarizePayments,
  paymentReportCSV,
} from "./payment-report.mjs";
import "./payment-report.css";

export default function PaymentReport({ data, month, onOpenOrder, onExport }) {
  const [partnerId, setPartnerId] = useState("");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(100);
  const orders = useMemo(
    () => new Map(data.orders.map((order) => [order.id, order])),
    [data.orders],
  );
  const partners = useMemo(
    () => new Map(data.partners.map((partner) => [partner.id, partner])),
    [data.partners],
  );
  const records = useMemo(() => paymentRecords(data.orders), [data.orders]);
  const rows = useMemo(
    () =>
      records
        .filter((row) => {
          const order = orders.get(row.orderId);
          const partner = partners.get(row.partnerId);
          const search = [
            order.title,
            partner?.name,
            partner?.phone,
            order.city,
            order.venue,
            order.hall,
            row.note,
          ]
            .join(" ")
            .toLowerCase();
          return (
            row.date.startsWith(month) &&
            (!partnerId || row.partnerId === partnerId) &&
            (!kind || row.kind === kind) &&
            search.includes(query.trim().toLowerCase())
          );
        })
        .sort(
          (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
        ),
    [records, month, partnerId, kind, query, orders, partners],
  );
  const totals = summarizePayments(rows);
  useEffect(() => setLimit(100), [month, partnerId, kind, query]);
  const hasFilters = !!(partnerId || kind || query);

  return (
    <section className="payment-report" aria-label="付款月份报表">
      <div className="payment-report-heading">
        <div>
          <span className="eyebrow">PAYMENT ACTIVITY</span>
          <h2>{month.replace("-", " 年 ")} 月付款</h2>
          <p>按支付日期查看定金、尾款与相关拍摄。</p>
        </div>
        <button
          className="button"
          disabled={!rows.length}
          onClick={() =>
            onExport(
              paymentReportCSV(rows, data.orders, data.partners),
              `拾光付款明细-${month}.csv`,
            )
          }
        >
          <Download size={16} />
          导出付款明细
        </button>
      </div>
      <div className="payment-report-filters">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索付款记录"
            placeholder="搜索伙伴、拍摄主题、场地或付款备注"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span>合作伙伴</span>
          <select
            aria-label="付款伙伴"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            <option value="">全部伙伴</option>
            {data.partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>款项类型</span>
          <select
            aria-label="款项类型"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">全部款项</option>
            <option value="deposit">定金</option>
            <option value="settlement">尾款</option>
          </select>
        </label>
        {hasFilters && (
          <button
            className="text-button"
            onClick={() => {
              setPartnerId("");
              setKind("");
              setQuery("");
            }}
          >
            清空付款筛选
          </button>
        )}
      </div>
      <div className="payment-report-stats">
        {[
          [
            "本月支出",
            totals.total,
            `含历史累计 ¥ ${money(totals.baselineTotal)}`,
          ],
          ["定金支出", totals.deposit, "按已记录的定金支付日期"],
          ["尾款支出", totals.settlement, "按已记录的尾款支付日期"],
          [
            "涉及订单",
            totals.orderCount,
            `${totals.entryCount} 条逐笔付款 · ${totals.baselineCount} 项历史累计`,
          ],
        ].map(([label, value, description], index) => (
          <article
            key={label}
            className={
              index === 0
                ? "payment-report-stat highlighted"
                : "payment-report-stat"
            }
          >
            <span>{label}</span>
            <strong
              className={
                String(Math.floor(value)).length >= 8
                  ? "large-payment-total"
                  : ""
              }
            >
              {index === 3 ? value : `¥ ${money(value)}`}
            </strong>
            <small>{description}</small>
          </article>
        ))}
      </div>
      <div className="payment-report-note">
        <Info size={18} />
        <div>
          <p>
            统计与明细均按当前月份及筛选条件，包含取消、拒绝订单中的付款，已撤销的记录不计入。
          </p>
          <p>
            历史累计按已记录的支付日期归月，无法还原原来的每一笔付款；更正累计会重算对应月份。车费已计入订单应付，付款可能包含车费，未按用途拆分，这里只累计实际付款。
          </p>
        </div>
      </div>
      <section className="panel payment-records" aria-label="付款记录列表">
        <div className="section-header">
          <h2>
            <Wallet size={18} />
            付款记录
          </h2>
          <span className="muted">共 {rows.length} 条记录 · 当前筛选</span>
        </div>
        {rows.length ? (
          rows.slice(0, limit).map((row) => {
            const order = orders.get(row.orderId);
            const partner = partners.get(row.partnerId);
            return (
              <article className="payment-record" key={row.id}>
                <div className="payment-record-date">
                  <time dateTime={row.date}>{row.date}</time>
                  <span
                    className={
                      row.source === "baseline"
                        ? "payment-source historical"
                        : "payment-source"
                    }
                  >
                    {row.source === "baseline" ? "历史累计" : "逐笔付款"}
                  </span>
                </div>
                <div className="payment-record-job">
                  <strong>
                    {partner?.name || "未命名伙伴"}
                    <span>{row.kind === "deposit" ? "定金" : "尾款"}</span>
                  </strong>
                  <p>{order.title}</p>
                  <small>
                    拍摄 {order.shootDate} · {order.city} · {order.venue} ·{" "}
                    {order.hall}
                  </small>
                  {row.note && (
                    <p className="payment-record-note">{row.note}</p>
                  )}
                </div>
                <div className="payment-record-amount">
                  <strong>¥ {money(row.amount)}</strong>
                  <button
                    className="text-button"
                    aria-label={`查看派单：${order.title}`}
                    onClick={() => onOpenOrder(order)}
                  >
                    查看派单
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="payment-report-empty">
            <Wallet size={30} />
            <h3>
              {hasFilters ? "没有符合筛选的付款记录" : "这个月还没有付款记录"}
            </h3>
            <p>
              {hasFilters
                ? "可清空筛选，或切换统计月份继续核对。"
                : "登记定金或尾款后，会按支付日期显示在这里。"}
            </p>
          </div>
        )}
        {rows.length > limit && (
          <div className="payment-report-more">
            <span>
              已显示 {limit} / {rows.length} 条，导出包含当前筛选的全部记录
            </span>
            <button className="button" onClick={() => setLimit(limit + 100)}>
              显示更多付款
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
