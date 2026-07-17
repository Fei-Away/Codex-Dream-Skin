import { fail } from "./errors.mjs";

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function compareSemver(left, right) {
  const leftMatch = SEMVER_PATTERN.exec(left);
  const rightMatch = SEMVER_PATTERN.exec(right);
  if (!leftMatch || !rightMatch) {
    fail("COMPAT_VERSION_INVALID", "Dream Skin version must be semantic versioning.");
  }
  for (let index = 1; index <= 3; index += 1) {
    const leftPart = BigInt(leftMatch[index]);
    const rightPart = BigInt(rightMatch[index]);
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  const leftPre = leftMatch[4]?.split(".") ?? [];
  const rightPre = rightMatch[4]?.split(".") ?? [];
  if (!leftPre.length || !rightPre.length) {
    return leftPre.length ? -1 : rightPre.length ? 1 : 0;
  }
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index += 1) {
    if (leftPre[index] === undefined) return -1;
    if (rightPre[index] === undefined) return 1;
    if (leftPre[index] === rightPre[index]) continue;
    const leftNumeric = /^\d+$/.test(leftPre[index]);
    const rightNumeric = /^\d+$/.test(rightPre[index]);
    if (leftNumeric && rightNumeric) {
      const leftPart = BigInt(leftPre[index]);
      const rightPart = BigInt(rightPre[index]);
      if (leftPart === rightPart) continue;
      return leftPart < rightPart ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPre[index] < rightPre[index] ? -1 : 1;
  }
  return 0;
}

export function assertCompatibility(manifest, context) {
  if (!context) return null;
  if (!["macos", "windows"].includes(context.platform)) {
    fail("COMPAT_PLATFORM_INVALID", "Platform must be macos or windows.", "platform");
  }
  if (!manifest.targets.includes(context.platform)) {
    fail(
      "COMPAT_PLATFORM_UNSUPPORTED",
      `Package does not target ${context.platform}.`,
      "targets",
    );
  }
  if (compareSemver(context.dreamSkinVersion, manifest.minimumDreamSkinVersion) < 0) {
    fail(
      "COMPAT_VERSION_TOO_OLD",
      `Dream Skin ${context.dreamSkinVersion} is older than required ${manifest.minimumDreamSkinVersion}.`,
      "minimumDreamSkinVersion",
    );
  }
  return {
    compatible: true,
    platform: context.platform,
    dreamSkinVersion: context.dreamSkinVersion,
  };
}
