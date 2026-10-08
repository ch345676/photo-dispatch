import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Save, Info } from "lucide-react";
import {
  TYPES,
  DISPATCH,
  EXECUTION,
  payable,
  paid,
  balance,
  money,
  travelState,
  TRAVEL_STATES,
  validateOrder,
} from "./domain.mjs";
import { scheduleChanged } from "./workflow.mjs";

export default function QuickOrderForm({
  Modal,
  Field,
  order,
  copySource,
  data,
  onSave,
  onClose,
  onAddPartner,
  onDraft,
  onDraftExport,
  draftReason = "",
}) {
  const current = data.orders.find((x) => x.id === order.id);
  const [o, setO] = useState(() => ({
    ...order,
    travelStatus:
      order.travelStatus ?? (current ? travelState(order) : "pending"),
  }));
  const [reason, setReason] = useState(draftReason);
  const initial = useRef(JSON.stringify([o, draftReason]));
  const [financeOpen, setFinanceOpen] = useState(
    !!current || !!o.depositRequired || !!o.depositPaid || !!o.settlementPaid,
  );
  const [moreOpen, setMoreOpen] = useState(!!current);
  const [travelOpen, setTravelOpen] = useState(
    travelState(o) === "checked" || (o.travelAmount || 0) > 0,
  );
  const [error, setError] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftFailed, setDraftFailed] = useState(false);
  const [discardAsked, setDiscardAsked] = useState(false);
  const callback = useRef(onDraft);
  callback.current = onDraft;
  const original = useRef(current ? JSON.stringify(current) : "");
  function draftItem() {
    return {
      order: o,
      reason,
      copySource,
      kind: current ? "edit" : "new",
      original: original.current,
    };
  }
  function saveDraft() {
    const result = callback.current(draftItem());
    setDraftFailed(result !== true);
    return result;
  }
  function closeForm(force = false) {
    if (force || JSON.stringify([o, reason]) !== initial.current) {
      const result = saveDraft();
      if (result !== true) {
        setError(result);
        setDraftStatus(result);
        return;
      }
    }
    onClose();
  }
  useEffect(() => {
    if (JSON.stringify([o, reason]) === initial.current) return;
    const result = saveDraft();
    setDraftStatus(result === true ? "草稿已保存在当前空间" : result);
  }, [o, reason]);
  const set = (key, value) => {
    setError("");
    setO((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "dispatchStatus" && value === "已取消"
        ? { executionStatus: "已取消" }
        : {}),
    }));
  };
  const number = (key) => (e) =>
    set(key, e.target.value === "" ? "" : Number(e.target.value));
  const moneyInput = (key, label) => (
    <Field key={key} label={label}>
      <input
        type="number"
        min="0"
        step="0.01"
        max={key === "settlementPaid" ? "200000000" : "100000000"}
        value={o[key]}
        readOnly={
          !!o.paymentLedger && ["depositPaid", "settlementPaid"].includes(key)
        }
        onChange={number(key)}
      />
    </Field>
  );
  const venue = data.venues.find(
    (v) => v.city === o.city && v.name === o.venue,
  );
  const moved = current && scheduleChanged(current, o);
  return (
    <Modal
      title={
        copySource ? "复制为新派单" : current ? "编辑派单" : "安排一场新的拍摄"
      }
      subtitle="先填拍摄安排，其余信息按需展开。"
      onClose={() => closeForm()}
      wide
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const err = validateOrder(o, data.partners);
          if (err || (moved && !reason.trim())) {
            setError(err || "请填写改期原因");
            setFinanceOpen(true);
            setMoreOpen(true);
            return;
          }
          onSave(o, reason);
        }}
      >
        <div className="form-body quick-order-form">
          <div className="draft-save-state" role="status">
            <Save size={14} />
            {draftStatus || "修改后自动暂存草稿，关闭后可从派单栏继续"}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {copySource && (
            <div className="info-strip copy-order-hint">
              沿用「{copySource.title}
              」的拍摄安排和报价，请填写新的主题与拍摄日期。付款与历史记录已清空。
            </div>
          )}
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
            <Field label="拍摄日期 *">
              <input
                required
                type="date"
                value={o.shootDate}
                onChange={(e) => set("shootDate", e.target.value)}
              />
            </Field>
            <Field label="合作伙伴 *">
              <select
                value={o.partnerId}
                onChange={(e) => set("partnerId", e.target.value)}
              >
                <option value="">请选择伙伴</option>
                {data.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="开始时间 *">
              <input
                type="time"
                value={o.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
            <Field label="结束时间 *">
              <input
                type="time"
                value={o.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>
            <div className="span2 quick-partner-row">
              <span>
                {data.partners.find((p) => p.id === o.partnerId)?.phone ||
                  "选择伙伴后显示联系方式"}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => onAddPartner(o, reason)}
              >
                <Plus size={14} />
                添加伙伴
              </button>
            </div>
            <Field label="城市 *">
              <input
                value={o.city}
                maxLength={40}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="酒店 / 场地 *">
              <input
                list="quick-venues"
                value={o.venue}
                maxLength={100}
                placeholder="选择或填写场地"
                onChange={(e) => {
                  const v = data.venues.find(
                    (v) => v.city === o.city && v.name === e.target.value,
                  );
                  setO({
                    ...o,
                    venue: e.target.value,
                    ...(v ? { address: v.address, hall: "" } : {}),
                  });
                }}
              />
              <datalist id="quick-venues">
                {data.venues
                  .filter((v) => v.city === o.city)
                  .map((v) => (
                    <option key={v.id} value={v.name} />
                  ))}
              </datalist>
            </Field>
            <Field label="展厅 / 宴会厅 *">
              <input
                list="quick-halls"
                maxLength={100}
                value={o.hall}
                onChange={(e) => set("hall", e.target.value)}
                placeholder="例如：3 楼 · 水晶厅"
              />
              <datalist id="quick-halls">
                {venue?.halls.map((h) => (
                  <option key={h} value={h} />
                ))}
              </datalist>
            </Field>
            {moneyInput("amount", "拍摄费用 *")}
          </div>
          {moved && (
            <div className="reschedule-reason">
              <p>
                原安排：{current.shootDate} {current.startTime}–
                {current.endTime}。保存后需重新确认档期。
              </p>
              <Field label="改期原因 *">
                <input
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="例如：客户将仪式调整到下午"
                />
              </Field>
            </div>
          )}
          <section className="quick-form-section">
            <h3>车费安排</h3>
            <div className="travel-options" role="group" aria-label="车费状态">
              {Object.entries(TRAVEL_STATES).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={travelState(o) === value}
                  className={travelState(o) === value ? "selected" : ""}
                  onClick={() => {
                    setO({
                      ...o,
                      travelStatus: value,
                      ...(value === "none" ? { travelAmount: 0 } : {}),
                    });
                    setTravelOpen(value === "checked");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {travelState(o) === "pending" && (
              <p className="travel-hint">
                车费还未确定，结清前会提醒补录。
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTravelOpen(!travelOpen)}
                >
                  {travelOpen ? "收起金额" : "填写车费"}
                </button>
              </p>
            )}
            {travelOpen && travelState(o) !== "none" && (
              <div className="form-grid fold-content">
                {moneyInput("travelAmount", "报销车费")}
                <Field label="车费说明">
                  <input
                    maxLength={500}
                    value={o.travelNote || ""}
                    onChange={(e) => set("travelNote", e.target.value)}
                    placeholder="往返打车、车票核对等"
                  />
                </Field>
              </div>
            )}
          </section>
          <section className="quick-form-section">
            <button
              type="button"
              className="form-fold-toggle"
              aria-expanded={financeOpen}
              onClick={() => setFinanceOpen(!financeOpen)}
            >
              定金与已有付款 <ChevronDown size={18} />
            </button>
            {financeOpen && (
              <div className="fold-content">
                <div className="form-grid">
                  {moneyInput("depositRequired", "约定定金（0 表示无需）")}
                  {moneyInput("depositPaid", "已付定金")}
                  {moneyInput("settlementPaid", "已付尾款（不含定金）")}
                  <Field label="定金支付日期">
                    <input
                      type="date"
                      readOnly={!!o.paymentLedger}
                      value={o.depositDate}
                      onChange={(e) => set("depositDate", e.target.value)}
                    />
                  </Field>
                  <Field label="尾款支付日期">
                    <input
                      type="date"
                      readOnly={!!o.paymentLedger}
                      value={o.settlementDate}
                      onChange={(e) => set("settlementDate", e.target.value)}
                    />
                  </Field>
                </div>
                {o.paymentLedger && (
                  <p className="travel-hint">
                    已有付款由流水汇总；请在详情登记、撤销或更正付款。
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="quick-form-section">
            <button
              type="button"
              className="form-fold-toggle"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              沟通、状态与备注 <ChevronDown size={18} />
            </button>
            {moreOpen && (
              <div className="form-grid fold-content">
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
                <Field label="派单沟通日期 *">
                  <input
                    type="date"
                    value={o.communicatedDate}
                    onChange={(e) => set("communicatedDate", e.target.value)}
                  />
                </Field>
                <Field label="详细地址" span>
                  <input
                    maxLength={240}
                    value={o.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </Field>
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
                    maxLength={2000}
                    value={o.note}
                    onChange={(e) => set("note", e.target.value)}
                  />
                </Field>
                <Field label="结算备注" span>
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={o.paymentNote}
                    onChange={(e) => set("paymentNote", e.target.value)}
                  />
                </Field>
              </div>
            )}
          </section>
          <div className="form-total">
            <span>
              {travelState(o) === "pending" ? "当前应付" : "应付合计"}
              <strong> ¥ {money(payable(o))}</strong>
            </span>
            <span>
              已付 <strong>¥ {money(paid(o))}</strong>
            </span>
            <span>
              待结 <strong>¥ {money(balance(o))}</strong>
            </span>
          </div>
          <p className="draft-footnote">
            <Info size={13} />
            草稿仅存本机；正式保存后才进入订单和完整备份。
          </p>
        </div>
        {draftFailed && (
          <div className="draft-recovery">
            <p>
              {discardAsked
                ? "确认放弃当前未暂存的输入？原来已保存的草稿和正式订单仍保留。"
                : "当前输入仍在页面中，可下载留存后再处理草稿冲突或存储问题。"}
            </p>
            <div>
              <button
                type="button"
                className="button"
                onClick={() => onDraftExport(draftItem())}
              >
                下载当前输入
              </button>
              <button
                type="button"
                className="text-button danger-text"
                onClick={() =>
                  discardAsked ? onClose() : setDiscardAsked(true)
                }
              >
                {discardAsked ? "确认放弃当前输入" : "放弃本次输入"}
              </button>
            </div>
          </div>
        )}
        <div className="modal-footer">
          <button
            type="button"
            className="button"
            onClick={() => closeForm(true)}
          >
            暂存并关闭
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
