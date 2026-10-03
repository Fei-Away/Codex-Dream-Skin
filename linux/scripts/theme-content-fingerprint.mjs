import { createHash } from "node:crypto";

function updateFramed(hash, label, bytes) {
  const labelBytes = Buffer.from(label, "utf8");
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hash.update(labelBytes).update("\0").update(length).update(bytes);
}

export function runtimeThemeContentFingerprint(theme, imageBytes, cssBytes = null) {
  const hash = createHash("sha256");
  hash.update("dreamskin-runtime-theme/1\0");
  updateFramed(hash, "theme.json", Buffer.from(JSON.stringify(theme), "utf8"));
  updateFramed(hash, "image", imageBytes);
  if (cssBytes) {
    updateFramed(hash, "theme.css", cssBytes);
  } else {
    hash.update("theme.css\0absent\0");
  }
  return hash.digest("hex");
}
