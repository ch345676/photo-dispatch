const path = require("node:path");
const APP_ORIGIN = "shiguang://app";
function isAppUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "shiguang:" &&
      u.hostname === "app" &&
      !u.port &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
function assetPath(root, value) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes("\0") || pathname.includes("\\")) return null;
    const relative =
      pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const resolved = path.resolve(root, relative);
    const boundary = path.relative(root, resolved);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) return null;
    return resolved;
  } catch {
    return null;
  }
}
module.exports = { APP_ORIGIN, isAppUrl, assetPath };
