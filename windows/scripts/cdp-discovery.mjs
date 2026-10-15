const MAX_CDP_JSON_BYTES = 256 * 1024;
const MAX_CDP_TARGETS = 128;
const MAX_CDP_TARGET_ID_LENGTH = 200;
const MAX_CDP_URL_LENGTH = 2048;
const MAX_CDP_TEXT_LENGTH = 200;

export class CdpDiscoveryError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = "CdpDiscoveryError";
    this.code = code;
  }
}

export const CDP_DISCOVERY_LIMITS = Object.freeze({
  maxBytes: MAX_CDP_JSON_BYTES,
  maxTargets: MAX_CDP_TARGETS,
  maxTargetIdLength: MAX_CDP_TARGET_ID_LENGTH,
  maxUrlLength: MAX_CDP_URL_LENGTH,
});

function fail(code, message) {
  throw new CdpDiscoveryError(code, message);
}

function assertString(value, field, maxLength, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    fail("CDP_DISCOVERY_FIELD", `${field} must be a string of at most ${maxLength} characters`);
  }
}

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("CDP_DISCOVERY_ROOT_TYPE", `${field} must be an object`);
  }
}

export function validateCdpList(value) {
  if (!Array.isArray(value)) fail("CDP_DISCOVERY_ROOT_TYPE", "target list must be an array");
  if (value.length > MAX_CDP_TARGETS) {
    fail("CDP_DISCOVERY_TOO_MANY_TARGETS", `target list exceeds ${MAX_CDP_TARGETS} items`);
  }
  value.forEach((target, index) => {
    assertObject(target, `target[${index}]`);
    assertString(target.id, `target[${index}].id`, MAX_CDP_TARGET_ID_LENGTH);
    assertString(target.type, `target[${index}].type`, MAX_CDP_TEXT_LENGTH);
    assertString(target.url, `target[${index}].url`, MAX_CDP_URL_LENGTH, { allowEmpty: true });
    assertString(
      target.webSocketDebuggerUrl,
      `target[${index}].webSocketDebuggerUrl`,
      MAX_CDP_URL_LENGTH,
    );
  });
  return value;
}

export function validateCdpVersion(value) {
  assertObject(value, "version response");
  assertString(value.webSocketDebuggerUrl, "version.webSocketDebuggerUrl", MAX_CDP_URL_LENGTH);
  if (Object.hasOwn(value, "Browser")) {
    assertString(value.Browser, "version.Browser", MAX_CDP_URL_LENGTH, { allowEmpty: true });
  }
  return value;
}

function parseUtf8Json(bytes, resource, parseJson) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("CDP_DISCOVERY_INVALID_UTF8", `${resource} is not valid UTF-8`);
  }
  try {
    return parseJson(text);
  } catch {
    fail("CDP_DISCOVERY_MALFORMED_JSON", `${resource} is not valid JSON`);
  }
}

export async function readBoundedCdpJsonResponse(response, resource, { parseJson = JSON.parse } = {}) {
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    fail("CDP_DISCOVERY_REDIRECT", `${resource} redirected`);
  }
  if (response.status < 200 || response.status >= 300) {
    fail("CDP_DISCOVERY_HTTP_STATUS", `${resource} returned HTTP ${response.status}`);
  }

  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const normalizedLength = declaredLength.trim();
    if (!/^\d+$/.test(normalizedLength)) {
      fail("CDP_DISCOVERY_CONTENT_LENGTH", `${resource} has an invalid Content-Length`);
    }
    const length = Number(normalizedLength);
    if (!Number.isSafeInteger(length) || length > MAX_CDP_JSON_BYTES) {
      fail("CDP_DISCOVERY_RESPONSE_TOO_LARGE", `${resource} declares more than ${MAX_CDP_JSON_BYTES} bytes`);
    }
  }

  const reader = response.body?.getReader();
  if (!reader) return parseUtf8Json(new Uint8Array(0), resource, parseJson);
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (total + chunk.byteLength > MAX_CDP_JSON_BYTES) {
        try { await reader.cancel(); } catch {}
        fail("CDP_DISCOVERY_RESPONSE_TOO_LARGE", `${resource} streamed more than ${MAX_CDP_JSON_BYTES} bytes`);
      }
      chunks.push(chunk);
      total += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof CdpDiscoveryError) throw error;
    throw error;
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = parseUtf8Json(bytes, resource, parseJson);
  if (resource === "/json/list") return validateCdpList(value);
  if (resource === "/json/version") return validateCdpVersion(value);
  fail("CDP_DISCOVERY_RESOURCE", `unsupported discovery resource ${resource}`);
}

export async function fetchBoundedCdpJson(port, resource, { signal, parseJson = JSON.parse } = {}) {
  if (resource !== "/json/list" && resource !== "/json/version") {
    fail("CDP_DISCOVERY_RESOURCE", `unsupported discovery resource ${resource}`);
  }
  const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
    redirect: "manual",
    signal,
  });
  return readBoundedCdpJsonResponse(response, resource, { parseJson });
}
