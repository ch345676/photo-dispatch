export function parseDrafts(raw) {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (
    data?.version !== 1 ||
    !Array.isArray(data.items) ||
    data.items.length > 30
  )
    throw new Error("草稿存储格式无效，原文未覆盖");
  const ids = new Set();
  for (const item of data.items) {
    if (
      !item ||
      !item.order ||
      typeof item.order.id !== "string" ||
      !item.order.id ||
      ids.has(item.order.id) ||
      typeof item.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(item.updatedAt)) ||
      !["new", "edit"].includes(item.kind) ||
      typeof item.reason !== "string" ||
      (item.kind === "edit" && typeof item.original !== "string")
    )
      throw new Error("草稿记录无效，原文未覆盖");
    ids.add(item.order.id);
    const o = item.order;
    for (const key of [
      "title",
      "type",
      "shootDate",
      "communicatedDate",
      "startTime",
      "endTime",
      "partnerId",
      "city",
      "venue",
      "hall",
      "address",
      "note",
      "paymentNote",
      "depositDate",
      "settlementDate",
      "updatedAt",
      "dispatchStatus",
      "executionStatus",
    ]) {
      if (typeof o[key] !== "string")
        throw new Error("草稿字段格式无效，原文未覆盖");
    }
    for (const key of [
      "amount",
      "travelAmount",
      "depositRequired",
      "depositPaid",
      "settlementPaid",
    ]) {
      if (
        o[key] !== "" &&
        (typeof o[key] !== "number" || !Number.isFinite(o[key]))
      )
        throw new Error("草稿金额格式无效，原文未覆盖");
    }
  }
  return data.items;
}
// Compare the edited draft, merge unrelated tabs' drafts, never recreate cleared storage.
export function updateDrafts(raw, expectedRaw, id, item) {
  if (raw === null && expectedRaw !== null)
    throw new Error("草稿存储已被移除，请刷新草稿列表后重试");
  const latest = parseDrafts(raw),
    expected = parseDrafts(expectedRaw);
  if (
    JSON.stringify(latest.find((d) => d.order.id === id)) !==
    JSON.stringify(expected.find((d) => d.order.id === id))
  )
    throw new Error(
      "这份草稿已在其他页面修改，请重新打开草稿，当前修改尚未暂存",
    );
  const items = latest.filter((d) => d.order.id !== id);
  if (item) items.unshift(item);
  if (items.length > 30)
    throw new Error("已有 30 份草稿，请先保存或清理部分草稿");
  const result = JSON.stringify({ version: 1, items });
  parseDrafts(result);
  return result;
}
