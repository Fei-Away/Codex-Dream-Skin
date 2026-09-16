import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export function runtimeThemeContentFingerprint(theme, imageBytes, cssBytes) {
  const hash = createHash("sha256")
    .update("dreamskin-theme-content-fingerprint/1\0", "utf8")
    .update(Buffer.from(JSON.stringify(theme), "utf8"))
    .update("\0image\0")
    .update(imageBytes);
  if (cssBytes) {
    hash.update("\0theme.css\0").update(cssBytes);
  }
  return hash.digest("hex");
}

async function main() {
  const [stageDir] = process.argv.slice(2);
  if (!stageDir) throw new Error("Usage: theme-content-fingerprint.mjs <stage-dir>");
  
  const themeBytes = await fs.readFile(path.join(stageDir, "theme.json"));
  const theme = JSON.parse(themeBytes.toString("utf8"));
  const imagePath = path.join(stageDir, theme.image);
  const imageBytes = await fs.readFile(imagePath);
  const cssBytes = await fs.readFile(path.join(stageDir, "theme.css")).catch(() => null);
  
  const fingerprint = runtimeThemeContentFingerprint(theme, imageBytes, cssBytes);
  process.stdout.write(fingerprint + "\n");
}

await main();
