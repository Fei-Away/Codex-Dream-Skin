const TOKEN_KEY = "dreamSkinToken";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const THEME_ID_PATTERN = /^img-[0-9]{14}-[a-f0-9]{8}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|heic|tiff?)$/i;
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
]);

export class StudioApiError extends Error {
  constructor(code, message, status = 0, details = null) {
    super(message);
    this.name = "StudioApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function readSessionToken(locationLike, historyLike, storage) {
  const hash = String(locationLike.hash ?? "");
  if (hash.startsWith("#")) {
    const params = new URLSearchParams(hash.slice(1));
    if (params.has("token")) {
      historyLike.replaceState({}, "", `${locationLike.pathname || "/"}${locationLike.search || ""}`);
      const value = params.get("token") ?? "";
      if (TOKEN_PATTERN.test(value)) {
        try { storage.setItem(TOKEN_KEY, value); } catch {}
        return value;
      }
      try { storage.removeItem(TOKEN_KEY); } catch {}
      return null;
    }
  }
  try {
    const stored = storage.getItem(TOKEN_KEY);
    return typeof stored === "string" && TOKEN_PATTERN.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

function exactApiPath(value) {
  if (typeof value !== "string" || !value.startsWith("/api/") || value.includes("\\")) {
    throw new StudioApiError("client_error", "Invalid API path.");
  }
  return value;
}

export function isThemeId(value) {
  return typeof value === "string" && THEME_ID_PATTERN.test(value);
}

export function normalizeColor(value) {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) {
    throw new StudioApiError("validation_error", "Color must be a six-digit hex value.");
  }
  return value.toLowerCase();
}

export function validateImageFile(file) {
  if (!file || typeof file.name !== "string" || !Number.isFinite(file.size)) {
    throw new StudioApiError("validation_error", "Choose a supported image file.");
  }
  if (file.size < 1) throw new StudioApiError("validation_error", "The selected image is empty.");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new StudioApiError("validation_error", "The selected image is larger than 50 MB.");
  }
  const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (!IMAGE_EXTENSION.test(file.name) || (type && !IMAGE_TYPES.has(type))) {
    throw new StudioApiError("validation_error", "Choose a supported image: PNG, JPEG, HEIC, TIFF, or WebP.");
  }
  return file;
}

export function createApiClient({ origin, token, fetchImpl = fetch }) {
  const normalizedOrigin = String(origin).replace(/\/$/, "");
  if (!/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(normalizedOrigin)) {
    throw new StudioApiError("client_error", "Web Studio must use a loopback origin.");
  }
  if (!TOKEN_PATTERN.test(token ?? "")) {
    throw new StudioApiError("unauthorized", "Local session token is missing.", 401);
  }

  async function request(apiPath, { method = "GET", json, form, responseType = "json" } = {}) {
    const headers = { "X-Dream-Skin-Token": token };
    let body;
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form !== undefined) {
      body = form;
    }
    let response;
    try {
      response = await fetchImpl(`${normalizedOrigin}${exactApiPath(apiPath)}`, {
        method,
        headers,
        body,
        mode: "same-origin",
        cache: "no-store",
      });
    } catch (error) {
      throw new StudioApiError("network_error", "Cannot reach the local Dream Skin service.", 0, {
        cause: error?.name ?? "network_error",
      });
    }
    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const value = await response.json();
        if (value?.error?.code && value?.error?.message) {
          throw new StudioApiError(
            value.error.code,
            value.error.message,
            response.status,
            value.error.details ?? null,
          );
        }
      }
      throw new StudioApiError("http_error", `Local service returned HTTP ${response.status}.`, response.status);
    }
    return responseType === "blob" ? response.blob() : response.json();
  }

  function requireThemeId(id) {
    if (!isThemeId(id)) throw new StudioApiError("validation_error", "Invalid theme id.");
    return id;
  }

  return {
    status: () => request("/api/status"),
    themes: () => request("/api/themes"),
    job: (id) => request(`/api/jobs/${encodeURIComponent(id)}`),
    install: () => request("/api/install", { method: "POST", json: {} }),
    createTheme: (form) => request("/api/themes", { method: "POST", form }),
    applyTheme: (id, input) => request(`/api/themes/${requireThemeId(id)}/apply`, {
      method: "POST",
      json: input,
    }),
    deleteTheme: (id) => request(`/api/themes/${requireThemeId(id)}`, { method: "DELETE", json: {} }),
    applyDemo: (input) => request("/api/demo/apply", { method: "POST", json: input }),
    reapply: (input) => request("/api/session/reapply", { method: "POST", json: input }),
    pause: () => request("/api/session/pause", { method: "POST", json: {} }),
    verify: () => request("/api/verify", { method: "POST", json: {} }),
    restore: (input) => request("/api/restore", { method: "POST", json: input }),
    themeImage: (id) => request(`/api/themes/${requireThemeId(id)}/image`, { responseType: "blob" }),
    verificationScreenshot: () => request("/api/verification/screenshot", { responseType: "blob" }),
  };
}

export async function pollJob({ api, jobId, onUpdate, intervalMs = 250, maximumPolls = 1200 }) {
  for (let attempt = 0; attempt < maximumPolls; attempt += 1) {
    const job = await api.job(jobId);
    onUpdate(job);
    if (job.state === "succeeded") return job.result;
    if (job.state === "failed") {
      throw new StudioApiError(
        job.error?.code ?? "operation_failed",
        job.error?.message ?? "Dream Skin operation failed.",
        0,
        job.error?.details ?? null,
      );
    }
    if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new StudioApiError("timeout", "Dream Skin operation did not finish in time.");
}
