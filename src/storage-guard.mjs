import { validateBackup } from "./domain.mjs";

export function inspectBusinessStorage(raw, expectedRaw, currentData) {
  if (raw === null)
    return { kind: expectedRaw === null ? "current" : "missing" };

  try {
    const data = validateBackup(JSON.parse(raw));
    return {
      kind:
        JSON.stringify(data) === JSON.stringify(currentData)
          ? "current"
          : "changed",
      data,
    };
  } catch {
    return { kind: "invalid" };
  }
}
