import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_INTERVAL_DAYS,
  normalizeBackupMeta,
  nextBackupReminder,
  backupStatus,
} from "../src/backup.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-08T04:00:00.000Z");
const iso = (time) => new Date(time).toISOString();
const empty = { orders: [], partners: [], venues: [] };
const business = { ...empty, orders: [{ id: "order-1" }] };
const blankMeta = { lastExportedAt: "", lastRestoredAt: "", snoozedUntil: "" };

test("空白空间不催备份，伙伴和场地资料也属于需要备份的业务数据", () => {
  assert.equal(backupStatus(empty, "personal", null, NOW).reason, "empty");
  assert.equal(backupStatus(undefined, "personal", null, NOW).show, false);
  for (const key of ["orders", "partners", "venues"]) {
    const status = backupStatus(
      { ...empty, [key]: [{ id: key }] },
      "personal",
      null,
      NOW,
    );
    assert.equal(status.reason, "never", key);
    assert.equal(status.due, true, key);
    assert.equal(status.show, true, key);
  }
});

test("演示空间始终不提醒，不会改变传入的个人提醒记录", () => {
  const metadata = Object.freeze({ lastExportedAt: iso(NOW - 8 * DAY_MS) });
  const before = JSON.stringify(metadata);
  for (const data of [empty, business]) {
    const status = backupStatus(data, "demo", metadata, NOW);
    assert.equal(status.reason, "demo");
    assert.equal(status.due, false);
    assert.equal(status.show, false);
  }
  assert.equal(
    backupStatus(business, "personal", metadata, NOW).reason,
    "stale",
  );
  assert.equal(JSON.stringify(metadata), before);
});

test("备份提醒以完整七天计算，在边界前一毫秒仍属近期", () => {
  assert.equal(BACKUP_INTERVAL_DAYS, 7);
  const exportedAt = NOW - 7 * DAY_MS;
  const metadata = { lastExportedAt: iso(exportedAt) };
  const before = backupStatus(business, "personal", metadata, NOW - 1);
  assert.equal(before.reason, "recent");
  assert.equal(before.due, false);
  assert.equal(before.show, false);
  for (const now of [NOW, NOW + 1]) {
    const due = backupStatus(business, "personal", metadata, now);
    assert.equal(due.reason, "stale");
    assert.equal(due.show, true);
    assert.equal(due.lastExportedAt, iso(exportedAt));
  }
});

test("明天提醒按北京时间次日零点计算，支持午夜、跨月、跨年和闰日", () => {
  for (const [now, expected] of [
    ["2026-10-08T04:00:00.000Z", "2026-10-08T16:00:00.000Z"],
    ["2026-10-08T15:59:59.999Z", "2026-10-08T16:00:00.000Z"],
    ["2026-10-08T16:00:00.000Z", "2026-10-09T16:00:00.000Z"],
    ["2026-01-31T15:00:00.000Z", "2026-01-31T16:00:00.000Z"],
    ["2026-12-31T15:00:00.000Z", "2026-12-31T16:00:00.000Z"],
    ["2028-02-28T16:00:00.000Z", "2028-02-29T16:00:00.000Z"],
  ]) {
    const time = Date.parse(now);
    assert.equal(nextBackupReminder(time), expected, now);
    const delay = Date.parse(nextBackupReminder(time)) - time;
    assert.ok(delay > 0 && delay <= DAY_MS);
  }
});

test("明天提醒只暂时隐藏提示，到北京时间零点恢复且仍保留原导出时间", () => {
  const until = nextBackupReminder(NOW);
  const metadata = {
    lastExportedAt: iso(NOW - 8 * DAY_MS),
    snoozedUntil: until,
  };
  const snoozed = backupStatus(
    business,
    "personal",
    metadata,
    Date.parse(until) - 1,
  );
  assert.equal(snoozed.reason, "stale");
  assert.equal(snoozed.due, true);
  assert.equal(snoozed.show, false);
  assert.equal(snoozed.snoozedUntil, until);
  const awakened = backupStatus(
    business,
    "personal",
    metadata,
    Date.parse(until),
  );
  assert.equal(awakened.due, true);
  assert.equal(awakened.show, true);
  assert.equal(awakened.snoozedUntil, "");
  assert.equal(awakened.lastExportedAt, metadata.lastExportedAt);
});

test("导入时间不早于导出时要求重新导出，同时保留历史导出时间", () => {
  const exportedAt = iso(NOW - DAY_MS);
  for (const restoredAt of [exportedAt, iso(NOW)]) {
    const status = backupStatus(
      business,
      "personal",
      {
        lastExportedAt: exportedAt,
        lastRestoredAt: restoredAt,
      },
      NOW,
    );
    assert.equal(status.reason, "restored");
    assert.equal(status.show, true);
    assert.equal(status.lastExportedAt, exportedAt);
  }
  assert.equal(
    backupStatus(
      business,
      "personal",
      {
        lastExportedAt: exportedAt,
        lastRestoredAt: iso(NOW - 2 * DAY_MS),
      },
      NOW,
    ).reason,
    "recent",
  );
  assert.equal(
    backupStatus(
      business,
      "personal",
      {
        lastExportedAt: iso(NOW),
        lastRestoredAt: "",
      },
      NOW,
    ).reason,
    "recent",
    "重新导出后由调用方清空恢复标记",
  );
  assert.equal(
    backupStatus(
      business,
      "personal",
      {
        lastRestoredAt: iso(NOW),
      },
      NOW,
    ).reason,
    "never",
  );
});

test("损坏元数据逐字段容错，不会丢弃同条记录里的其他有效时间", () => {
  for (const value of [undefined, null, true, 42, "损坏 JSON", [], {}]) {
    assert.deepEqual(normalizeBackupMeta(value, NOW), blankMeta);
  }
  const mixed = {
    lastExportedAt: iso(NOW + 1),
    lastRestoredAt: "2026-10-08T12:00:00+08:00",
    snoozedUntil: nextBackupReminder(NOW),
  };
  const normalized = normalizeBackupMeta(mixed, NOW);
  assert.deepEqual(normalized, {
    lastExportedAt: "",
    lastRestoredAt: iso(NOW),
    snoozedUntil: nextBackupReminder(NOW),
  });
  assert.deepEqual(normalizeBackupMeta(normalized, NOW), normalized);
  assert.deepEqual(
    normalizeBackupMeta(
      {
        lastExportedAt: "2026-10-07T04:00:00Z",
        lastRestoredAt: "2026-02-30T00:00:00.000Z",
        snoozedUntil: "not-a-date",
      },
      NOW,
    ),
    {
      lastExportedAt: iso(NOW - DAY_MS),
      lastRestoredAt: "",
      snoozedUntil: "",
    },
  );
});

test("未来导出和恢复时间失效，超出一天的稍后提醒不能无限静默", () => {
  assert.deepEqual(
    normalizeBackupMeta(
      {
        lastExportedAt: iso(NOW + 1),
        lastRestoredAt: "2099-01-01T00:00:00.000Z",
        snoozedUntil: iso(NOW + DAY_MS + 1),
      },
      NOW,
    ),
    blankMeta,
  );
  for (const until of [NOW - 1, NOW, NOW + DAY_MS + 1]) {
    const status = backupStatus(
      business,
      "personal",
      { snoozedUntil: iso(until) },
      NOW,
    );
    assert.equal(status.snoozedUntil, "");
    assert.equal(status.show, true);
  }
  for (const until of [NOW + 1, NOW + DAY_MS]) {
    const status = backupStatus(
      business,
      "personal",
      { snoozedUntil: iso(until) },
      NOW,
    );
    assert.equal(status.snoozedUntil, iso(until));
    assert.equal(status.show, false);
  }
});

test("提醒检查不修改订单、元数据或备份内容", () => {
  const data = Object.freeze({
    version: 2,
    orders: Object.freeze([Object.freeze({ id: "kept", amount: 800 })]),
    partners: Object.freeze([]),
    venues: Object.freeze([]),
  });
  const metadata = Object.freeze({ lastExportedAt: "invalid" });
  const before = JSON.stringify(data);
  const status = backupStatus(data, "personal", metadata, NOW);
  assert.equal(status.reason, "never");
  assert.equal(status.show, true);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(metadata, { lastExportedAt: "invalid" });
  assert.deepEqual(Object.keys(status).sort(), [
    "due",
    "lastExportedAt",
    "reason",
    "show",
    "snoozedUntil",
  ]);
});
