import { cleanLinkInfo, cleanLinkTile } from "./link-metadata.js?v=20261007-watchlist-controls";
const API_URL = "api.php";

async function request(action, options = {}) {
  const { method = "GET", body, params = {}, signal } = options;
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );

  const headers = { Accept: "application/json" };
  if (typeof body === "string")
    headers["Content-Type"] = "application/json; charset=utf-8";
  const response = await fetch(url, {
    method,
    body,
    headers,
    credentials: "same-origin",
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(
      payload.error ||
        (response.status === 403
          ? "The server denied this save (403). Ask the host to check access and security rules for hub/api.php."
          : `Request failed (${response.status})`),
    );
    error.status = response.status;
    throw error;
  }
  return payload.data ?? payload;
}

function multipartRequest(action, formData, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL, window.location.href);
    url.searchParams.set("action", action);
    const xhr = new XMLHttpRequest();
    const totalFileBytes = [...formData.values()].reduce(
      (sum, value) => sum + (value instanceof File ? value.size : 0),
      0,
    );

    const abort = () => {
      xhr.abort();
    };
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
    }

    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.setRequestHeader("Accept", "application/json");
    xhr.withCredentials = true;
    xhr.upload.addEventListener("progress", (event) => {
      if (!onProgress || !event.lengthComputable) return;
      const ratio = Math.min(1, event.loaded / event.total);
      onProgress({
        loaded: totalFileBytes * ratio,
        total: totalFileBytes,
        ratio,
      });
    });
    xhr.addEventListener("load", () => {
      if (signal) signal.removeEventListener("abort", abort);
      const payload = xhr.response || {};
      if (xhr.status < 200 || xhr.status >= 300 || payload.ok === false) {
        const error = new Error(
            payload.error ||
              (xhr.status === 403
                ? "The server denied this save (403). Ask the host to check access and security rules for hub/api.php."
                : `Request failed (${xhr.status})`),
          );
        error.status = xhr.status;
        reject(error);
        return;
      }
      onProgress?.({ loaded: totalFileBytes, total: totalFileBytes, ratio: 1 });
      resolve(payload.data ?? payload);
    });
    xhr.addEventListener("error", () =>
      reject(
        new Error("Upload failed because the connection was interrupted."),
      ),
    );
    xhr.addEventListener("abort", () => {
      const error = new DOMException("Upload canceled", "AbortError");
      reject(error);
    });
    xhr.send(formData);
  });
}

// Send tile metadata as a structured object; keep binary uploads multipart.
function tileRequest(action, form, options = {}) {
  const metadata = {},
    uploads = new FormData();
  let hasFiles = false;
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") metadata[name] = value;
    else if (value.size || value.name) {
      uploads.append(name, value);
      hasFiles = true;
    }
  }
  Object.assign(metadata, cleanLinkTile(metadata));
  if (!hasFiles)
    return request(action, { method: "POST", body: JSON.stringify(metadata) }).then(cleanLinkTile);
  uploads.set("metadata", JSON.stringify(metadata));
  return multipartRequest(action, uploads, options).then(cleanLinkTile);
}

export const api = {
  searchTmdb: (query, type, page = 1, signal) =>
    request("tmdb.search", {
      method: "POST",
      body: JSON.stringify({ query, type, page }),
      signal,
    }),
  tmdbPoster: async (type, id, signal) => {
    const response = await fetch(
      new URL("api.php?action=tmdb.poster", window.location.href),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
        credentials: "same-origin",
        signal,
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "TMDB poster retrieval failed.");
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/"))
      throw new Error("TMDB did not return an image.");
    return new File(
      [blob],
      "tmdb-poster." +
        ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
          blob.type
        ] || "jpg"),
      { type: blob.type },
    );
  },
  setWatchStatus: (id, watchedStatus) =>
    request("watchlist.status", {
      method: "POST",
      body: JSON.stringify({ id, watchedStatus }),
    }),
  inspectLink: async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const info = await request("links.inspect", {
        method: "POST",
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      return cleanLinkInfo(info, url);
    } finally {
      clearTimeout(timer);
    }
  },
  inspectMediaUrl: (url) =>
    request("media.inspect", { method: "POST", body: JSON.stringify({ url }) }),
  resolveMedia: (url) =>
    request("media.resolve", { method: "POST", body: JSON.stringify({ url }) }),
  downloadMedia: async (url) => {
    const response = await fetch(
      new URL("api.php?action=media.download", window.location.href),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Media download failed.");
    }
    const blob = await response.blob();
    const name =
      /filename="([^"]+)"/.exec(
        response.headers.get("Content-Disposition") || "",
      )?.[1] || "linked-media";
    return new File([blob], name, { type: blob.type });
  },
  inspectMetadata: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("metadata.inspect", { method: "POST", body: form });
  },
  bootstrap: async () => {
    const data = await request("bootstrap");
    return {...data, tiles: (data.tiles || []).map(cleanLinkTile)};
  },
  saveSettings: (settings) =>
    request("settings.update", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  uploadCalendar: (file) => {
    const form = new FormData();
    form.set("calendar", file, file.name);
    return request("calendar.upload", { method: "POST", body: form });
  },
  deleteCalendar: () => request("calendar.delete", { method: "POST" }),
  createTile: (formData, options) =>
    tileRequest("tiles.create", formData, options),
  updateTile: (formData, options) =>
    tileRequest("tiles.update", formData, options),
  downloadContent: async () => {
    const response = await fetch(
      new URL("api.php?action=content.download", window.location.href),
      { credentials: "same-origin" },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Download failed (${response.status})`);
    }
    if (
      !(response.headers.get("Content-Type") || "").includes("application/zip")
    )
      throw new Error("The server did not return a ZIP backup.");
    return response.blob();
  },
  uploadFont: (file, name = "") => {
    const form = new FormData();
    form.set("font", file, file.name);
    if (name) form.set("name", name);
    return request("fonts.upload", { method: "POST", body: form });
  },
  deleteTile: (id) =>
    request("tiles.delete", { method: "POST", body: JSON.stringify({ id }) }),
  createTopLink: (formData) =>
    request("toplinks.create", { method: "POST", body: formData }),
  updateTopLink: (formData) =>
    request("toplinks.update", { method: "POST", body: formData }),
  deleteTopLink: (id) =>
    request("toplinks.delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  saveBookmarks: (ids) =>
    request("bookmarks.update", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  saveCollections: (collections) =>
    request("collections.update", {
      method: "POST",
      body: JSON.stringify({ collections }),
    }),
};
