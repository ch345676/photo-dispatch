const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  session,
  dialog,
  shell,
  net,
} = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { APP_ORIGIN, isAppUrl, assetPath } = require("./security.cjs");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "shiguang",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      codeCache: true,
    },
  },
]);
const qa =
  process.argv.includes("--sg-qa") &&
  process.env.SHIGUANG_TEST_DATA &&
  path.isAbsolute(process.env.SHIGUANG_TEST_DATA);
app.setPath(
  "userData",
  qa
    ? process.env.SHIGUANG_TEST_DATA
    : path.join(app.getPath("appData"), "ShiguangDispatch"),
);
app.setName("拾光派单");
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
let window;
function createWindow() {
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 880,
    minHeight: 640,
    show: false,
    backgroundColor: "#f1f6fa",
    title: "拾光派单",
    titleBarStyle: "default",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.on("did-fail-load", (_e, code, description) => {
    if (code !== -3)
      dialog.showErrorBox(
        "拾光派单未能打开",
        `请重新打开应用。如仍失败，请从发布页重新下载安装包。\n${description}`,
      );
  });
  window.on("closed", () => {
    window = null;
    session.defaultSession.flushStorageData();
  });
  window.loadURL(APP_ORIGIN + "/index.html#calendar");
}
function buildMenu() {
  const sendNew = () => {
    const dispatch = () =>
      window?.webContents.executeJavaScript(
        "window.dispatchEvent(new Event('shiguang:new-order'))",
      );
    if (!window) {
      createWindow();
      window.webContents.once("did-finish-load", dispatch);
    } else dispatch();
  };
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: "拾光派单",
            submenu: [
              { role: "about", label: "关于拾光派单" },
              { type: "separator" },
              { role: "hide", label: "隐藏拾光派单" },
              { role: "hideOthers", label: "隐藏其他应用" },
              { role: "unhide", label: "显示全部" },
              { type: "separator" },
              { role: "quit", label: "退出拾光派单" },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        { label: "新建派单", accelerator: "CmdOrCtrl+N", click: sendNew },
        {
          label: "数据与备份",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            if (window) window.loadURL(APP_ORIGIN + "/index.html#settings");
          },
        },
        { type: "separator" },
        {
          role: process.platform === "darwin" ? "close" : "quit",
          label: process.platform === "darwin" ? "关闭窗口" : "退出",
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切" },
        { role: "copy", label: "复制" },
        { role: "paste", label: "粘贴" },
        { role: "selectAll", label: "全选" },
      ],
    },
    {
      label: "显示",
      submenu: [
        { role: "reload", label: "重新载入" },
        { type: "separator" },
        { role: "resetZoom", label: "实际大小" },
        { role: "zoomIn", label: "放大" },
        { role: "zoomOut", label: "缩小" },
        { type: "separator" },
        { role: "togglefullscreen", label: "进入或退出全屏" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "使用指南与下载",
          click: () =>
            shell.openExternal(
              "https://github.com/ch345676/photo-dispatch/releases",
            ),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    } else if (app.isReady()) createWindow();
  });
  app
    .whenReady()
    .then(() => {
      app.setAboutPanelOptions({
        applicationName: "拾光派单",
        applicationVersion: app.getVersion(),
        copyright: "个人摄影派单与结算 · 数据保存在本机",
      });
      const root = path.join(app.getAppPath(), "dist-desktop");
      protocol.handle("shiguang", async (request) => {
        const file = assetPath(root, request.url);
        if (!file) return new Response("Not found", { status: 404 });
        try {
          const result = await net.fetch(pathToFileURL(file).toString());
          const headers = new Headers(result.headers);
          headers.set("Content-Security-Policy", csp);
          return new Response(result.body, { status: result.status, headers });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      });
      session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [csp],
          },
        }),
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback) =>
          callback(
            isAppUrl(contents.getURL()) &&
              permission === "clipboard-sanitized-write",
          ),
      );
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission, origin) =>
          isAppUrl(contents?.getURL() || origin) &&
          permission === "clipboard-sanitized-write",
      );
      session.defaultSession.on("will-download", (event, item, contents) => {
        if (
          !isAppUrl(contents?.getURL() || "") ||
          !item.getURL().startsWith("blob:" + APP_ORIGIN + "/")
        ) {
          event.preventDefault();
          return;
        }
        const filename = path.basename(item.getFilename());
        if (qa && process.env.SHIGUANG_TEST_DOWNLOADS)
          item.setSavePath(
            path.join(process.env.SHIGUANG_TEST_DOWNLOADS, filename),
          );
        else
          item.setSaveDialogOptions({
            title: "保存拾光派单文件",
            defaultPath: path.join(app.getPath("downloads"), filename),
          });
        item.once("done", (_event, state) => {
          if (state === "interrupted")
            dialog.showErrorBox(
              "文件未能保存",
              "请重新导出，并选择有写入权限的文件夹。",
            );
        });
      });
      buildMenu();
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("启动失败", error.message);
      app.quit();
    });
  app.on("before-quit", () => {
    if (app.isReady()) session.defaultSession.flushStorageData();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
