import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { _electron as electron } from "playwright";
import { balance, paid, payable, validateBackup } from "../src/domain.mjs";

// Only temporary QA profiles are ever used. No existing app or browser data is opened.
const root = mkdtempSync(path.join(os.tmpdir(), "shiguang-desktop-qa-"));
const downloads = path.join(root, "downloads");
mkdirSync(downloads);
mkdirSync("test-results", { recursive: true });
const key = "shiguang-photo-v1-personal";
const errors = [];
let app, page;
async function launch(profile) {
  const env = {
    ...process.env,
    SHIGUANG_TEST_DATA: path.join(root, profile),
    SHIGUANG_TEST_DOWNLOADS: downloads,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    ...(process.env.SHIGUANG_APP_EXECUTABLE
      ? { executablePath: process.env.SHIGUANG_APP_EXECUTABLE }
      : {}),
    args: [...(process.env.SHIGUANG_APP_EXECUTABLE ? [] : ["."]), "--sg-qa"],
    env,
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("Renderer:", msg.text());
  });
  try {
    await page.locator(".desktop-edition").waitFor();
  } catch (error) {
    console.error(
      "Startup:",
      page.url(),
      await page.locator("body").innerText(),
      errors,
    );
    await page.screenshot({ path: "test-results/desktop-startup-failure.png" });
    throw error;
  }
}
const button = (name) => page.getByRole("button", { name, exact: true });
const read = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
async function saved() {
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
}
async function shot(name) {
  await page.screenshot({
    path: `test-results/desktop-app-${name}.png`,
    fullPage: false,
    animations: "disabled",
  });
}
try {
  await launch("working");
  assert.equal(
    await page.getByRole("complementary", { name: "正式开始使用" }).count(),
    1,
  );
  assert.equal((await read())?.orders?.length || 0, 0);
  assert.equal((await read())?.partners?.length || 0, 0);
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p =
      BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      nodeIntegration: p.nodeIntegration,
      contextIsolation: p.contextIsolation,
      webSecurity: p.webSecurity,
    };
  });
  assert.deepEqual(prefs, {
    sandbox: true,
    nodeIntegration: false,
    contextIsolation: true,
    webSecurity: true,
  });
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  const remote = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((r) => /^https?:/.test(r.name))
      .map((r) => r.name),
  );
  assert.deepEqual(remote, []);
  await app.context().setOffline(true);
  await page.reload();
  await page.locator(".studio-welcome").waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1000, 780),
  );
  await page.waitForFunction(() => innerWidth <= 1000);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await page
      .locator(".brand")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await shot("fresh");
  await button("我的").click();
  assert.equal(await button("查看演示空间").count(), 0);
  await page.getByText("Mac 个人版", { exact: true }).waitFor();
  await page.getByRole("button", { name: /简洁模式/ }).click();
  assert.equal(
    await page.locator("html").getAttribute("data-sg-motion"),
    "calm",
  );
  await page.reload();
  assert.equal(
    await page.locator("html").getAttribute("data-sg-motion"),
    "calm",
  );
  await page.getByRole("button", { name: /丰富动效/ }).click();
  await shot("settings");
  console.log(
    "PASS: empty personal profile, no demo switch, sandbox, offline reload, motion preferences",
  );

  // Exercise the actual native menu, then the same production UI as a real user.
  await app.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()
      .items.find((i) => i.label === "文件")
      .submenu.items.find((i) => i.label === "新建派单")
      .click(),
  );
  await page.getByLabel("伙伴姓名").fill("安装包验收伙伴");
  await page.getByLabel("联系方式").fill("13800000000");
  await button("保存伙伴").click();
  await page.getByLabel("拍摄主题").fill("离线婚礼验收");
  await page.getByLabel("酒店 / 场地").fill("验收酒店");
  await page.getByLabel("展厅 / 宴会厅").fill("二楼水晶厅");
  await page.getByLabel("拍摄费用").fill("800");
  await button("填写车费").click();
  await page.getByLabel("报销车费", { exact: true }).fill("120");
  await button("已核对").click();
  await button("定金与已有付款").click();
  await page.getByLabel("约定定金").fill("200");
  await page.getByLabel("已付定金", { exact: true }).fill("200");
  await page.getByLabel("定金支付日期").fill("2026-10-08");
  await button("保存派单").click();
  await saved();
  let data = await read();
  assert.equal(data.orders.length, 1);
  assert.equal(data.partners.length, 1);
  assert.equal(payable(data.orders[0]), 920);
  assert.equal(paid(data.orders[0]), 200);
  assert.equal(balance(data.orders[0]), 720);
  await button("派单").first().click();
  await page
    .getByRole("button", { name: /离线婚礼验收/ })
    .first()
    .click();
  await button("微信派单信息").click();
  const share = await page.getByLabel("派单信息文案").inputValue();
  await button("复制派单信息").click();
  await page.getByRole("status").filter({ hasText: "已复制" }).waitFor();
  assert.equal(
    (await app.evaluate(({ clipboard }) => clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
    share,
  );
  await button("返回详情").click();
  await button("登记付款").click();
  await page.getByLabel("本次付款金额").fill("300");
  await button("确认登记").click();
  await saved();
  data = await read();
  assert.equal(paid(data.orders[0]), 500);
  assert.equal(balance(data.orders[0]), 420);
  await button("我的").click();
  await button("导出完整备份").click();
  await page.waitForFunction(() =>
    document.querySelector("[role=status]")?.textContent.includes("备份"),
  );
  let backupFile;
  for (let i = 0; i < 50; i++) {
    backupFile = readdirSync(downloads).find((f) => f.endsWith(".json"));
    if (backupFile) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(backupFile, "Native download must save a JSON backup");
  const backup = validateBackup(
    JSON.parse(readFileSync(path.join(downloads, backupFile), "utf8")),
  );
  assert.deepEqual(backup.orders, data.orders);
  const transferFile = path.join(root, "transfer-backup.json");
  copyFileSync(path.join(downloads, backupFile), transferFile);
  console.log(
    "PASS: native new-order menu, partner/order creation, travel + deposit/payment totals, clipboard, native backup export",
  );
  await app.close();
  app = null;

  await launch("working");
  assert.deepEqual((await read()).orders, data.orders);
  assert.equal((await read()).partners.length, 1);
  await button("日历").click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(880, 720),
  );
  await page.waitForFunction(() => innerWidth <= 880);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await shot("persisted");
  await app.close();
  app = null;
  await launch("clean-install");
  assert.equal((await read())?.orders?.length || 0, 0);
  assert.equal((await read())?.partners?.length || 0, 0);
  assert.equal((await read())?.trash?.length || 0, 0);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("shiguang-photo-v1-drafts-personal"),
    ),
    null,
  );
  await button("恢复已有备份").click({ trial: true });
  await page.locator("input[type=file]").setInputFiles(transferFile);
  await button("确认恢复").click();
  await page.getByRole("status").filter({ hasText: "备份已恢复" }).waitFor();
  assert.deepEqual((await read()).orders, data.orders);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full quit/relaunch persists records, fresh second install has no data/drafts/trash, backup restore, no runtime errors",
  );
} finally {
  if (app) await app.close();
}
