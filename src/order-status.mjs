import { active, conflicts, today, validateOrder } from "./domain.mjs";

export function orderStatusActions(order, date = today()) {
  if (!active(order) || order.executionStatus === "已完成")
    return { confirm: false, complete: false };

  const confirm =
    ["待拍摄", "已改期"].includes(order.executionStatus) &&
    (["待确认", "已改期"].includes(order.dispatchStatus) ||
      (order.dispatchStatus === "已确认" &&
        order.executionStatus === "已改期"));
  const complete =
    order.dispatchStatus === "已确认" &&
    order.executionStatus === "待拍摄" &&
    order.shootDate <= date;

  return { confirm, complete };
}

export function transitionOrderStatus(
  order,
  action,
  { partners, orders, date = today() },
) {
  if (!["confirm", "complete"].includes(action))
    throw new Error("不支持这项派单状态操作");
  if (!orderStatusActions(order, date)[action]) {
    if (action === "complete" && order.shootDate > date)
      throw new Error("尚未到拍摄日期，不能标记完成");
    throw new Error(
      action === "confirm"
        ? "当前状态不支持快捷确认，请通过编辑派单核对"
        : "当前状态不支持标记完成，请先核对派单与执行状态",
    );
  }

  // Keep updatedAt and every financial/history field for the normal save guard.
  const next =
    action === "confirm"
      ? { ...order, dispatchStatus: "已确认", executionStatus: "待拍摄" }
      : { ...order, executionStatus: "已完成" };
  const error = validateOrder(next, partners);
  if (error) throw new Error(error);

  if (action === "confirm") {
    const overlap = conflicts(next, orders);
    if (overlap.length)
      throw new Error(`档期冲突：同一伙伴在该时段已有「${overlap[0].title}」`);
  }
  return next;
}
