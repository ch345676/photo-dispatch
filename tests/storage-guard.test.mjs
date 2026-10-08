import test from "node:test";
import assert from "node:assert/strict";
import { demoData, emptyData, validateBackup } from "../src/domain.mjs";
import { inspectBusinessStorage } from "../src/storage-guard.mjs";

function freezeTree(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

test("首次空个人空间及尚未保存的默认演示空间允许第一次保存", () => {
  assert.deepEqual(inspectBusinessStorage(null, null, emptyData()), {
    kind: "current",
  });
  assert.deepEqual(inspectBusinessStorage(null, null, demoData("2026-10-08")), {
    kind: "current",
  });
});

test("已保存的空空间设置被删除也拦截，不以订单数量推断首次使用", () => {
  const data = emptyData();
  data.settings.before3 = false;
  const expectedRaw = JSON.stringify(data);
  assert.deepEqual(inspectBusinessStorage(null, expectedRaw, data), {
    kind: "missing",
  });
  assert.equal(data.settings.before3, false);
  assert.equal(data.orders.length, 0);
});

test("演示数据删除与clear按相同规则保护，任何非null历史快照均可识别删除", () => {
  const data = demoData("2026-10-08");
  assert.deepEqual(inspectBusinessStorage(null, JSON.stringify(data), data), {
    kind: "missing",
  });
  assert.deepEqual(inspectBusinessStorage(null, "", data), {
    kind: "missing",
  });
});

test("空字符串、JSON null和损坏业务字段不能作为空空间覆盖，即使与历史raw相同", () => {
  const data = demoData("2026-10-08");
  const badSettings = structuredClone(data);
  badSettings.settings.deposit = "true";
  const badOrder = structuredClone(data);
  badOrder.orders[0].depositPaid = -1;
  const badReference = structuredClone(data);
  badReference.orders[0].partnerId = "missing-partner";
  for (const raw of [
    "",
    " ",
    "null",
    "false",
    "[]",
    "{}",
    "{broken",
    JSON.stringify(badSettings),
    JSON.stringify(badOrder),
    JSON.stringify(badReference),
  ]) {
    assert.deepEqual(inspectBusinessStorage(raw, raw, data), {
      kind: "invalid",
    });
    assert.deepEqual(inspectBusinessStorage(raw, null, data), {
      kind: "invalid",
    });
  }
});

test("正常快照和仅格式或顶层字段顺序变化仍是当前数据，并返回独立规范化内容", () => {
  const data = validateBackup(demoData("2026-10-08"));
  const raw = JSON.stringify(data);
  const formatted = JSON.stringify(
    {
      settings: data.settings,
      venues: data.venues,
      partners: data.partners,
      orders: data.orders,
      version: data.version,
    },
    null,
    2,
  );
  for (const nextRaw of [raw, formatted]) {
    const result = inspectBusinessStorage(nextRaw, raw, data);
    assert.equal(result.kind, "current");
    assert.deepEqual(result.data, data);
    assert.notEqual(result.data, data);
    assert.notEqual(result.data.orders[0], data.orders[0]);
  }
});

test("另一标签修改订单、伙伴或设置均返回最新有效内容，不依赖raw是否等于历史值", () => {
  const data = validateBackup(demoData("2026-10-08"));
  const raw = JSON.stringify(data);
  const variants = [
    (next) => {
      next.orders[0].note = "另一标签刚确认新的拍摄安排";
    },
    (next) => {
      next.partners[0].phone = "13900000009";
    },
    (next) => {
      next.settings.settlement = !next.settings.settlement;
    },
  ];
  for (const change of variants) {
    const next = structuredClone(data);
    change(next);
    const nextRaw = JSON.stringify(next);
    for (const expectedRaw of [raw, nextRaw, null]) {
      const result = inspectBusinessStorage(nextRaw, expectedRaw, data);
      assert.equal(result.kind, "changed");
      assert.deepEqual(result.data, next);
    }
  }
  assert.equal(data.partners[0].phone, "13800000001");
});

test("空页面期间出现的新数据不能首写覆盖，有效清空数据也被识别为变化", () => {
  const empty = emptyData();
  const filled = validateBackup(demoData("2026-10-08"));
  const appeared = inspectBusinessStorage(JSON.stringify(filled), null, empty);
  assert.equal(appeared.kind, "changed");
  assert.deepEqual(appeared.data, filled);
  const cleared = inspectBusinessStorage(
    JSON.stringify(empty),
    JSON.stringify(filled),
    filled,
  );
  assert.equal(cleared.kind, "changed");
  assert.deepEqual(cleared.data, empty);
});

test("v1旧数据补全车费后与已加载数据一致，真正改动仍返回兼容后的新内容", () => {
  const legacy = demoData("2026-10-08");
  legacy.version = 1;
  for (const order of legacy.orders) {
    delete order.travelAmount;
    delete order.travelNote;
  }
  const legacyRaw = JSON.stringify(legacy);
  const current = validateBackup(legacy);
  const result = inspectBusinessStorage(legacyRaw, legacyRaw, current);
  assert.equal(result.kind, "current");
  assert.deepEqual(result.data, current);
  assert.equal(result.data.version, 2);
  assert.ok(result.data.orders.every((order) => order.travelAmount === 0));
  const changedLegacy = structuredClone(legacy);
  changedLegacy.orders[0].note = "旧版导入后的真实修改";
  const changed = inspectBusinessStorage(
    JSON.stringify(changedLegacy),
    legacyRaw,
    current,
  );
  assert.equal(changed.kind, "changed");
  assert.equal(changed.data.version, 2);
  assert.equal(changed.data.orders[0].travelNote, "");
});

test("冻结的内存数据保持不变，返回的存储数据与内存不共享可变对象", () => {
  const data = freezeTree(validateBackup(demoData("2026-10-08")));
  const before = JSON.stringify(data);
  const result = inspectBusinessStorage(before, before, data);
  assert.equal(result.kind, "current");
  result.data.orders[0].note = "修改检查结果";
  result.data.partners[0].phone = "13911111111";
  result.data.venues[0].halls.push("新增厅");
  result.data.settings.before3 = false;
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(inspectBusinessStorage("", before, data), {
    kind: "invalid",
  });
  assert.deepEqual(inspectBusinessStorage(null, before, data), {
    kind: "missing",
  });
  assert.equal(JSON.stringify(data), before);
});
