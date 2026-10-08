import { useState } from "react";
import {
  Download,
  Copy,
  Archive,
  RotateCcw,
  Trash2,
  FileText,
  Plus,
  Wallet,
  CarFront,
} from "lucide-react";
import {
  money,
  payable,
  paid,
  balance,
  travelState,
  TRAVEL_STATES,
  validateOrder,
} from "./domain.mjs";
import {
  statementRows,
  statementTotals,
  statementCSV,
  dispatchMessage,
} from "./workflow.mjs";

export function PartnerStatement({
  data,
  month,
  initialPartner = "",
  onOpen,
  onDownload,
  onCopy,
}) {
  const [partnerId, setPartnerId] = useState(
    initialPartner || data.partners[0]?.id || "",
  );
  const [allMonths, setAllMonths] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const partner = data.partners.find((p) => p.id === partnerId);
  const rows = statementRows(
    data.orders,
    partnerId,
    allMonths ? "" : month,
    unpaidOnly,
  );
  const totals = statementTotals(rows);
  const period = allMonths ? "全部月份" : month;
  const text = [
    `【${partner?.name || "伙伴"}对账单】${period}${unpaidOnly ? " · 待结 / 待补车费" : ""}`,
    ...rows.map(
      (o) =>
        `${o.shootDate} ${o.title}\n拍摄 ¥${money(o.amount)} + 车费 ¥${money(o.travelAmount || 0)}（${TRAVEL_STATES[travelState(o)]}），已付 ¥${money(paid(o))}，待结 ¥${money(balance(o))}`,
    ),
    `合计 ${totals.count} 场：应付 ¥${money(totals.payable)}，已付 ¥${money(totals.paid)}，待结 ¥${money(totals.balance)}`,
    totals.pendingTravel
      ? `其中 ${totals.pendingTravel} 场车费待补录 / 核对，金额尚未最终确定。`
      : "",
    "请核对以上费用，如有差异请告知。",
  ]
    .filter(Boolean)
    .join("\n\n");
  return (
    <section className="panel partner-statement" aria-label="伙伴对账单">
      <div className="section-header">
        <h2>
          <Wallet size={19} />
          伙伴对账
        </h2>
        <span className="count-chip">{totals.count} 场</span>
      </div>
      <div className="statement-filters">
        <label>
          伙伴
          <select
            aria-label="对账伙伴"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            <option value="">请选择伙伴</option>
            {data.partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          拍摄范围
          <select
            aria-label="对账月份范围"
            value={allMonths ? "all" : "month"}
            onChange={(e) => setAllMonths(e.target.value === "all")}
          >
            <option value="month">{month} 拍摄</option>
            <option value="all">全部月份</option>
          </select>
        </label>
        <label className="statement-check">
          <input
            type="checkbox"
            checked={unpaidOnly}
            onChange={(e) => setUnpaidOnly(e.target.checked)}
          />
          只看待结 / 待补车费
        </label>
      </div>
      <div className="statement-summary">
        {[
          ["拍摄费用", totals.amount],
          ["报销车费", totals.travel],
          ["已付合计", totals.paid],
          ["待结合计", totals.balance],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>¥ {money(value)}</strong>
          </div>
        ))}
      </div>
      {totals.pendingTravel > 0 && (
        <div className="travel-warning">
          <CarFront size={18} />
          {totals.pendingTravel} 场车费待补录 / 核对，以上金额尚未最终确定。
        </div>
      )}
      <div className="statement-actions">
        <button
          className="button"
          disabled={!partner}
          onClick={() =>
            onDownload(
              statementCSV(rows, partner),
              `拾光对账-${partner.name}-${period}.csv`,
              "text/csv;charset=utf-8",
            )
          }
        >
          <Download size={16} />
          导出对账 CSV
        </button>
        <button
          className="button"
          disabled={!partner}
          onClick={() => onCopy(text, "对账文字")}
        >
          <Copy size={16} />
          复制对账文字
        </button>
      </div>
      <div className="statement-list">
        {rows.map((o) => (
          <button
            key={o.id}
            className="statement-order"
            onClick={() => onOpen(o)}
          >
            <span>
              <small>
                {o.shootDate} · {o.startTime}–{o.endTime}
              </small>
              <strong>{o.title}</strong>
              <small>
                {o.venue} · {o.hall}
              </small>
              <em>
                {o.dispatchStatus} · {TRAVEL_STATES[travelState(o)]}
              </em>
            </span>
            <span>
              <small>
                拍摄 ¥{money(o.amount)} + 车费 ¥{money(o.travelAmount || 0)}
              </small>
              <small>已付 ¥{money(paid(o))}</small>
              <strong>待结 ¥{money(balance(o))}</strong>
            </span>
          </button>
        ))}
        {!rows.length && (
          <div className="agenda-empty">
            <FileText size={30} />
            <h3>{partner ? "这个范围没有对账记录" : "先选择或添加一位伙伴"}</h3>
          </div>
        )}
      </div>
      <p className="workflow-note">
        按拍摄月份核对每单当前累计，取消 /
        拒绝订单的实际费用也保留。实际付款月份请查看「按付款月份」。
      </p>
    </section>
  );
}
export function RecycleBin({
  entries,
  partners,
  onRestore,
  onRemove,
  onExport,
}) {
  return (
    <section className="panel workflow-list-panel" aria-label="回收站">
      <div className="section-header">
        <h2>
          <Archive size={19} />
          订单回收站
        </h2>
        <span className="count-chip">{entries.length} 场</span>
      </div>
      <p className="workflow-note">
        删除的订单及付款、改期历史保留在这里，可恢复，也会随完整备份导出。回收站不计入当前日历与账单，不自动清空。
      </p>
      {entries.length > 0 && (
        <button className="button recycle-backup" onClick={onExport}>
          <Download size={16} />
          先导出完整备份
        </button>
      )}
      {entries.map((entry) => (
        <article className="workflow-list-row" key={entry.order.id}>
          <div>
            <h3>{entry.order.title}</h3>
            <p>
              {entry.order.shootDate} ·{" "}
              {partners.find((p) => p.id === entry.order.partnerId)?.name} ·{" "}
              {entry.order.venue}
            </p>
            <p>
              应付 ¥{money(payable(entry.order))} · 已付 ¥
              {money(paid(entry.order))} · 待结 ¥{money(balance(entry.order))}
            </p>
            <small>
              移入时间{" "}
              {new Date(entry.deletedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </small>
          </div>
          <div className="workflow-row-actions">
            <button className="button" onClick={() => onRestore(entry)}>
              <RotateCcw size={16} />
              恢复订单
            </button>
            <button
              className="text-button danger-text"
              onClick={() => onRemove(entry)}
            >
              <Trash2 size={15} />
              永久删除
            </button>
          </div>
        </article>
      ))}
      {!entries.length && (
        <div className="agenda-empty">
          <Archive size={32} />
          <h3>回收站是空的</h3>
          <p>误删订单后，可以来这里恢复。</p>
        </div>
      )}
    </section>
  );
}
export function DraftList({ drafts, error, onResume, onRemove, onRaw }) {
  return (
    <section className="panel workflow-list-panel" aria-label="派单草稿">
      <div className="section-header">
        <h2>
          <FileText size={19} />
          派单草稿
        </h2>
        <span className="count-chip">{drafts.length} 份</span>
      </div>
      <p className="workflow-note">
        个人与演示空间独立。草稿不会占用档期或计入费用；正式保存后才进入订单与完整备份。
      </p>
      {error && <div className="error-banner">{error}</div>}
      {(error || drafts.length > 0) && (
        <button className="button recycle-backup" onClick={onRaw}>
          <Download size={16} />
          下载草稿原文
        </button>
      )}
      {drafts.map((d) => (
        <article className="workflow-list-row" key={d.order.id}>
          <div>
            <h3>{d.order.title || "未命名派单"}</h3>
            <p>
              {d.kind === "edit" ? "编辑中的订单" : "新派单"} ·{" "}
              {d.order.shootDate || "未选拍摄日期"} ·{" "}
              {d.order.venue || "未填场地"}
            </p>
            <small>
              {new Date(d.updatedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}{" "}
              暂存
            </small>
          </div>
          <div className="workflow-row-actions">
            <button className="button" onClick={() => onResume(d)}>
              <FileText size={16} />
              继续填写
            </button>
            <button
              className="text-button danger-text"
              onClick={() => onRemove(d)}
            >
              <Trash2 size={15} />
              删除草稿
            </button>
          </div>
        </article>
      ))}
      {!drafts.length && !error && (
        <div className="agenda-empty">
          <FileText size={32} />
          <h3>还没有草稿</h3>
          <p>填写派单时会自动暂存，随时回来继续。</p>
        </div>
      )}
    </section>
  );
}
export function DispatchCopy({ Modal, order, partner, onClose, onCopy }) {
  const text = dispatchMessage(order, partner);
  return (
    <Modal
      title="微信派单信息"
      subtitle="核对内容后复制，粘贴到与伙伴的聊天中。"
      onClose={onClose}
    >
      <div className="form-body">
        <textarea
          className="share-message"
          aria-label="派单信息文案"
          readOnly
          value={text}
          rows={13}
        />
      </div>
      <div className="modal-footer">
        <button className="button" onClick={onClose}>
          返回详情
        </button>
        <button
          className="button primary"
          onClick={() => onCopy(text, "派单信息")}
        >
          <Copy size={16} />
          复制派单信息
        </button>
      </div>
    </Modal>
  );
}
export function TravelForm({ Modal, Field, order, partners, onClose, onSave }) {
  const [status, setStatus] = useState(travelState(order));
  const [amount, setAmount] = useState(order.travelAmount || 0);
  const [note, setNote] = useState(order.travelNote || "");
  const [error, setError] = useState("");
  return (
    <Modal title="核对报销车费" subtitle={order.title} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const next = {
            ...order,
            travelStatus: status,
            travelAmount: status === "none" ? 0 : amount,
            travelNote: note,
          };
          const err = validateOrder(next, partners);
          if (err) {
            setError(err);
            return;
          }
          onSave(next);
        }}
      >
        <div className="form-body">
          <div className="form-grid">
            {error && (
              <div className="error-banner span2" role="alert">
                {error}
              </div>
            )}
            <Field label="车费状态" span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {Object.entries(TRAVEL_STATES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            {status !== "none" && (
              <Field label="报销车费" span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max="100000000"
                  value={amount}
                  onChange={(e) =>
                    setAmount(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                />
              </Field>
            )}
            <Field label="车费说明" span>
              <textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <p className="workflow-note span2">
              车费计入订单应付一次，已付定金和尾款继续保留。核对金额不代表已经付款。
            </p>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            返回详情
          </button>
          <button type="submit" className="button primary">
            保存车费
          </button>
        </div>
      </form>
    </Modal>
  );
}
