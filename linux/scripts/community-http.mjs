#!/usr/bin/env node
// Bounded HTTP client + DreamSkin.cc one-click link contract for Linux.
// Mirrors BoundedCommunityHTTPClient.swift / CommunityThemeLink.swift.

import http from "node:http";
import https from "node:https";
import process from "node:process";

export const COMMUNITY_API_ORIGIN = "https://api.dreamskin.cc";
const MAX_HEADER_BYTES = 8 * 1024;
const MAXIMUM_PACKAGE_BYTES = 32 * 1024 * 1024;
const USER_AGENT = `DreamSkinLinux/${process.env.SKIN_VERSION || "1.5.14"}`;
const VERSION_ID_PATTERN = /^ver_[a-z0-9]{8,64}$/;
const LINK_PATTERN = /^dreamskin:\/\/apply\?version=(ver_[a-z0-9]{8,64})$/;
const UNSAFE_CODEPOINTS = new Set([
  0x061c, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

export function parseCommunityLink(input) {
  const match = /^dreamskin:\/\/apply\?version=(ver_[a-z0-9]{8,64})$/.exec(String(input || ""));
  return match ? match[1] : null;
}

export function isSafeDisplayText(value, maximum) {
  const text = String(value || "");
  if (text.length === 0 || text.length > maximum) return false;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code <= 0x1f || UNSAFE_CODEPOINTS.has(code)) return false;
  }
  return true;
}

export function validateCommunityMetadata(metadata, expectedVersionID) {
  if (!metadata || typeof metadata !== "object") throw new Error("这个一键换肤链接无效。");
  const id = String(metadata.id || "");
  if (!VERSION_ID_PATTERN.test(id) || id !== expectedVersionID) throw new Error("这个一键换肤链接无效。");
  if (!isSafeDisplayText(metadata.themeId, 80)
    || !isSafeDisplayText(metadata.name, 120)
    || !isSafeDisplayText(metadata.authorDisplayName, 120)
    || !isSafeDisplayText(metadata.license, 80)) throw new Error("这个一键换肤链接无效。");
  const version = String(metadata.version || "");
  if (version.length > 32 || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("这个一键换肤链接无效。");
  if (!/^[0-9a-f]{64}$/.test(String(metadata.packageSha256 || ""))) throw new Error("这个一键换肤链接无效。");
  const bytes = Number(metadata.packageBytes);
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAXIMUM_PACKAGE_BYTES) throw new Error("这个一键换肤链接无效。");
  if (metadata.applyCompatible !== true) throw new Error("该主题暂不兼容当前客户端。");
  return metadata;
}

async function rawRequest(url, redirectsRemaining, maximumBytes) {
  if (redirectsRemaining < 0) throw new Error("这个一键换肤链接无效。");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("这个一键换肤链接无效。");
  const transport = parsed.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const request = transport.get(parsed, {
      headers: { Accept: "*/*", "User-Agent": USER_AGENT },
      maxHeaderSize: MAX_HEADER_BYTES,
    }, (response) => {
      let bodyBytes = 0;
      const chunks = [];
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        // ZERO redirects for boundedFetchBuffer. Destroy on every reject
        // path: a trickling redirect response must not hold the socket
        // (and keep resetting the idle timeout) after the promise settled.
        if (redirectsRemaining <= 0) {
          response.destroy();
          reject(new Error("这个一键换肤链接无效。"));
          return;
        }
        response.resume();
        const location = response.headers.location;
        if (!location) {
          response.destroy();
          reject(new Error("这个一键换肤链接无效。"));
          return;
        }
        const next = new URL(location, parsed);
        if (next.origin !== parsed.origin) {
          response.destroy();
          reject(new Error("这个一键换肤链接无效。"));
          return;
        }
        rawRequest(next.href, redirectsRemaining - 1, maximumBytes).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        reject(new Error("这个一键换肤链接无效。"));
        return;
      }
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > maximumBytes) {
        response.destroy();
        reject(new Error("这个一键换肤链接无效。"));
        return;
      }
      response.on("data", (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes > maximumBytes) { response.destroy(); reject(new Error("这个一键换肤链接无效。")); return; }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => { request.destroy(new Error("这个一键换肤链接无效。")); });
  });
}

export async function boundedFetchBuffer(url, { maximumBytes = MAXIMUM_PACKAGE_BYTES } = {}) {
  return await rawRequest(url, 0, maximumBytes);
}

export async function boundedFetchJson(url) {
  const body = await boundedFetchBuffer(url, { maximumBytes: 64 * 1024 });
  return JSON.parse(body.toString("utf8"));
}
