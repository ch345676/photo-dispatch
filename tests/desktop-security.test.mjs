import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import security from "../desktop/security.cjs";
const { isAppUrl, assetPath } = security;
test("desktop protocol accepts only packaged application origin", () => {
  for (const url of [
    "shiguang://app/index.html#calendar",
    "shiguang://app/assets/a.js",
  ])
    assert.equal(isAppUrl(url), true);
  for (const url of [
    "https://app/",
    "file:///tmp/private",
    "shiguang://attacker/index.html",
    "shiguang://app:99/",
    "shiguang://person@app/",
    "javascript:alert(1)",
  ])
    assert.equal(isAppUrl(url), false);
});
test("desktop asset resolution never escapes the packaged folder", () => {
  const root = path.resolve("test-app/dist-desktop");
  assert.equal(
    assetPath(root, "shiguang://app/"),
    path.join(root, "index.html"),
  );
  assert.equal(
    assetPath(root, "shiguang://app/assets/test.js"),
    path.join(root, "assets/test.js"),
  );
  for (const url of [
    "shiguang://app/%2e%2e%2fprivate",
    "shiguang://app/%5c..%5cprivate",
    "shiguang://app/%00",
    "shiguang://app/%bad",
    "https://example.com/",
  ])
    assert.equal(assetPath(root, url), null);
});
