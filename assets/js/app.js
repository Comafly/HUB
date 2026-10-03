import { api } from "./api.js?v=20261003-2";

// Feature switch: set to false to remove the calendar module and let the dashboard refit automatically.
const ENABLE_CALENDAR_MODULE = true;

const TAGS = [
  "All",
  "Photography",
  "Film",
  "Animation",
  "Audio",
  "Design",
  "Typography",
  "Concepts",
  "History",
  "Funny",
];
const PRESET_TAGS = TAGS.slice(1);
const SECTION_TITLES = { dashboard: "Dashboard", projects: "Projects", resources: "Resources" };
const MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "text",
  "file",
  "font",
]);
const state = {
  tiles: [],
  topLinks: [],
  bookmarks: [],
  collections: [],
  collectionsInitialized: false,
  settings: { theme: "umber", mode: "dark" },
  calendar: { exists: false, fileName: "", updatedAt: null, content: "" },
  editingId: null,
  editingTopLinkId: null,
  savingContent: false,
  section: "dashboard",
  tag: "All",
  query: "",
  pendingDrop: null,
  pendingThumbnail: null,
  pendingTopLinkImage: null,
  topLinkPreviewUrl: null,
  pendingTags: [],
  previewUrls: [],
  fonts: [],
  activeUploadController: null,
  activeUploadCanceled: false,
  viewerTileId: null,
  viewerIndex: 0,
  viewerZoom: 1,
  viewerPanX: 0,
  viewerPanY: 0,
  viewerPanning: false,
  activeCollectionId: null,
  pendingCollectionDeleteId: null,
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const els = {
  tileGrid: $("#tileGrid"),
  tagList: $("#tagList"),
  search: $("#searchInput"),
  clearSearch: $("#clearSearch"),
  topLinks: $("#topLinks"),
  bookmarks: $("#bookmarkList"),
  contentModal: $("#contentModal"),
  contentForm: $("#contentForm"),
  dynamicFields: $("#dynamicFields"),
  contentTypeEyebrow: $("#contentTypeEyebrow"),
  contentModalTitle: $("#contentModalTitle"),
  topLinkModal: $("#topLinkModal"),
  topLinkForm: $("#topLinkForm"),
  settingsModal: $("#settingsModal"),
  settingsButton: $("#settingsButton"),
  modeToggle: $("#modeToggle"),
  modeLabel: $("#modeLabel"),
  dragOverlay: $("#dragOverlay"),
  emptyState: $("#emptyState"),
  sectionTitle: $("#sectionTitle"),
  toastRegion: $("#toastRegion"),
  bookmarksPanel: $("#bookmarksPanel"),
  contentAddButton: $("#contentAddButton"),
  contentFilePicker: $("#contentFilePicker"),
  contentTypeModal: $("#contentTypeModal"),
  tagEditor: $("#tagEditor"),
  tagCapsules: $("#tagCapsules"),
  tagInput: $("#tagInput"),
  presetTags: $("#presetTags"),
  mediaViewer: $("#mediaViewer"),
  viewerMedia: $("#viewerMedia"),
  viewerMeta: $("#viewerMeta"),
  viewerActions: $("#viewerActions"),
  viewerThumbnails: $("#viewerThumbnails"),
  collectionModal: $("#collectionModal"),
  collectionForm: $("#collectionForm"),
  collectionAddButton: $("#collectionAddButton"),
  collectionFilterBar: $("#collectionFilterBar"),
  collectionFilterName: $("#collectionFilterName"),
  collectionFilterClear: $("#collectionFilterClear"),
  collectionGridDropOverlay: $("#collectionGridDropOverlay"),
  deleteCollectionModal: $("#deleteCollectionModal"),
  confirmDeleteCollection: $("#confirmDeleteCollection"),
  contentColumn: $(".content-column"),
  calendarModule: $("#calendarModule"),
  calendarRanges: $("#calendarRanges"),
  calendarEmpty: $("#calendarEmpty"),
  calendarFileRow: $("#calendarFileRow"),
  calendarUploadRow: $("#calendarUploadRow"),
  calendarFileName: $("#calendarFileName"),
  calendarFileStatus: $("#calendarFileStatus"),
  calendarUploadButton: $("#calendarUploadButton"),
  calendarFileInput: $("#calendarFileInput"),
  calendarDeleteButton: $("#calendarDeleteButton"),
};

function escapeHtml(value = "") {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[c],
  );
}
// Keep notifications above native modal backdrops, which outrank page z-index.
function raiseNotifications() {
  const region = els.toastRegion;
  const dialogs = [...document.querySelectorAll("dialog[open]")];
  const focusedDialog = document.activeElement?.closest("dialog[open]");
  const host = focusedDialog || dialogs.at(-1) || document.body;
  if (region.parentElement !== host) host.appendChild(region);
  if (typeof region.showPopover === "function" && region.children.length) {
    region.setAttribute("popover", "manual");
    // Reinsert into the top layer above any newly opened dialog.
    if (region.matches(":popover-open")) region.hidePopover();
    region.showPopover();
  }
}
new MutationObserver(raiseNotifications).observe(document.body, {
  subtree: true,
  attributes: true,
  attributeFilter: ["open"],
});
function toast(message, tone = "default") {
  const el = document.createElement("div");
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  els.toastRegion.appendChild(el);
  raiseNotifications();
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => {
      el.remove();
      if (
        !els.toastRegion.children.length &&
        typeof els.toastRegion.hidePopover === "function" &&
        els.toastRegion.matches(":popover-open")
      )
        els.toastRegion.hidePopover();
    }, 250);
  }, 2600);
}
function favicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;
  } catch {
    return "";
  }
}
function normalizeUrl(value = "") {
  const raw = String(value).trim();
  if (!raw) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}
function safeHostname(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url || "";
  }
}
function defaultTileLabel(tile) {
  if (tile.type === "link") return safeHostname(tile.url);
  if (tile.type === "text") return "Text note";
  if (tile.files?.length) return tile.files[0].split("/").pop();
  return "Untitled";
}

function renderTags() {
  els.tagList.innerHTML = TAGS.map(
    (tag) =>
      `<button class="tag-btn ${state.tag === tag ? "is-active" : ""}" data-tag="${tag}">${tag}<span>↗</span></button>`,
  ).join("");
  const metadataTags = [...new Set(state.tiles.flatMap(tile => tile.metadataTags || []))]
    .filter(tag => !PRESET_TAGS.some(preset => preset.toLowerCase() === tag.toLowerCase()));
  if (metadataTags.length) els.tagList.innerHTML += `<div class="metadata-filter-row"><span class="metadata-label">File metadata</span>${metadataTags.map(tag => `<button type="button" class="tag-btn metadata-filter ${state.tag === tag ? "is-active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span>↗</span></button>`).join("")}</div>`;
}
function tileMatches(tile) {
  const section = tile.section === state.section;
  const tag =
    state.tag === "All" ||
    [...(tile.tags || []), ...(tile.metadataTags || [])].some((x) => x.toLowerCase() === state.tag.toLowerCase());
  const hay = [
    tile.label,
    tile.description,
    tile.location,
    tile.text,
    tile.url,
    ...(tile.tags || []),
    ...(tile.metadataTags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const collection = !state.activeCollectionId ||
    state.collections.find((c) => c.id === state.activeCollectionId)?.items?.includes(tile.id);
  return (
    section && tag && collection && (!state.query || hay.includes(state.query.toLowerCase()))
  );
}
function displayText(tile) {
  // Migrate only the shipped samples; literal escapes in user notes stay literal.
  const text = String(tile.text || "");
  const samples = {
    "seed-2": "COLLECT\\nFIRST.\\nCURATE\\nSECOND.",
    "seed-5": "Aa\\nTYPE\\nINDEX",
  };
  return samples[tile.id] === text ? text.replace(/\\n/g, "\n") : text;
}
const TILE_COLOR_GROUPS = [
  { label: "Complementary", indices: [1, 5, 6] },
  { label: "Analogous", indices: [3, 0, 4] },
  { label: "Triadic", indices: [2, 7] },
  { label: "Neutral", indices: [8] },
];
const TILE_COLOR_COUNT = 9;
function tileColor(tile) {
  const choice = Number.isInteger(tile.backgroundColor) ? tile.backgroundColor :
    [...String(tile.id || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TILE_COLOR_COUNT;
  return `var(--tile-color-${Math.max(0, Math.min(TILE_COLOR_COUNT - 1, choice))})`;
}
function tileMedia(tile) {
  if (tile.type === "text") {
    const s = tile.textStyle || {};
    const over = !!tile.thumbnail;
    const textHtml = `<div class="text-tile${over ? " text-tile--over" : ""}" style="background-color:${tileColor(tile)};font-family:${escapeHtml(s.font || "inherit")};font-size:${Number(s.fontSize || 28)}px;font-weight:${s.bold ? 700 : 500};font-style:${s.italic ? "italic" : "normal"};text-decoration:${s.underline ? "underline" : "none"};text-align:${escapeHtml(s.align || "left")}"><span class="text-content">${escapeHtml(displayText(tile))}</span></div>`;
    return over
      ? `<div class="text-thumb"><img class="cover" src="${escapeHtml(tile.thumbnail)}" alt="" />${textHtml}</div>`
      : textHtml;
  }
  if (tile.type === "image" && tile.files?.length) {
    const imgs = tile.files
      .slice(0, 4)
      .map(
        (src, i) =>
          `<img src="${escapeHtml(src)}" alt="${escapeHtml(tile.label || `Image ${i + 1}`)}" />`,
      )
      .join("");
    return `<div class="gallery gallery--${Math.min(tile.files.length, 4)}">${imgs}</div>`;
  }
  if (tile.type === "video" && tile.files?.[0])
    return `<video src="${escapeHtml(tile.files[0])}" muted loop playsinline preload="metadata"></video>`;
  if (
    (tile.type === "audio" || tile.type === "file" || tile.type === "font") &&
    tile.thumbnail
  )
    return `<img class="cover" src="${escapeHtml(tile.thumbnail)}" alt="" />`;
  if (tile.type === "link") {
    return `<div class="link-preview" style="background-color:${tileColor(tile)}">${tile.thumbnail ? `<img class="link-thumbnail" src="${escapeHtml(tile.thumbnail)}" alt="" />` : ""}<div class="link-domain"><img class="link-favicon" src="${escapeHtml(favicon(tile.url))}" alt="" /><span>${escapeHtml(tile.url || "")}</span></div></div>`;
  }
  return `<div class="file-symbol">${tile.type === "audio" ? "♪" : tile.type === "font" ? "Aa" : "↗"}</div>`;
}
function renderTiles() {
  const items =
    state.section === "dashboard" ? state.tiles.filter(tileMatches) : [];
  els.tileGrid.innerHTML = items
    .map(
      (tile) =>
        `<article draggable="false" class="tile tile--${escapeHtml(tile.size || "medium")} tile--${escapeHtml(tile.orientation || "landscape")}" data-tile-id="${escapeHtml(tile.id)}" tabindex="0"><div class="tile-media">${tileMedia(tile)}</div><div class="tile-gradient"></div><div class="tile-actions"><button class="tile-action" data-edit-tile="${escapeHtml(tile.id)}" aria-label="Edit tile" data-tooltip="Edit content"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg></button></div><div class="tile-content"><h3>${escapeHtml(tile.label || defaultTileLabel(tile))}</h3>${tile.description ? `<p>${escapeHtml(tile.description)}</p>` : ""}</div></article>`,
    )
    .join("");
  els.emptyState.hidden = state.section !== "dashboard" || items.length > 0;
  layoutTiles();
}
// Pack independent rectangles densely so portrait tiles span neighboring rows.
function layoutTiles() {
  if (state.section !== "dashboard" || !els.tileGrid.clientWidth) return;
  const columns = getComputedStyle(els.tileGrid).gridTemplateColumns.split(
    " ",
  ).length;
  const tiles = new Map(state.tiles.map((tile) => [tile.id, tile]));
  const cells = [],
    placed = [];
  const free = (x, y, w, h) =>
    x >= 0 &&
    y >= 0 &&
    x + w <= columns &&
    Array.from({ length: h }, (_, j) =>
      Array.from({ length: w }, (_, i) => !cells[y + j]?.[x + i]).every(
        Boolean,
      ),
    ).every(Boolean);
  const occupy = (item) => {
    for (let y = item.y; y < item.y + item.h; y++) {
      cells[y] ||= Array(columns).fill(false);
      for (let x = item.x; x < item.x + item.w; x++) cells[y][x] = true;
    }
  };
  [...els.tileGrid.children].forEach((el) => {
    const tile = tiles.get(el.dataset.tileId),
      size = tile.size || "medium";
    const portrait = tile.orientation === "portrait";
    let w = portrait
      ? size === "large" && columns === 6
        ? 3
        : 2
      : { small: 2, medium: 3, large: 4 }[size] || 3;
    if (columns === 2) w = size === "small" && portrait ? 1 : 2;
    w = Math.min(columns, w);
    const h = portrait
      ? { small: 3, medium: 4, large: 6 }[size] || 4
      : { small: 2, medium: 3, large: 4 }[size] || 3;
    let x = 0,
      y = 0;
    while (!free(x, y, w, h)) {
      if (++x + w > columns) {
        x = 0;
        y++;
      }
    }
    const titleMatch =
      state.query &&
      (tile.label || "").toLowerCase().includes(state.query.toLowerCase());
    const item = {
      el,
      x,
      y,
      w,
      h,
      score:
        (titleMatch ? 10 : 0) + ({ small: 1, medium: 2, large: 3 }[size] || 2),
    };
    occupy(item);
    placed.push(item);
  });
  // Fill adjacent rectangular gaps without displacing or covering another tile.
  const bottom = cells.length;
  [...placed]
    .sort((a, b) => b.score - a.score)
    .forEach((item) => {
      let changed = true;
      while (changed) {
        changed = false;
        if (free(item.x + item.w, item.y, 1, item.h)) {
          item.w++;
          changed = true;
        } else if (free(item.x - 1, item.y, 1, item.h)) {
          item.x--;
          item.w++;
          changed = true;
        } else if (
          item.y + item.h < bottom &&
          free(item.x, item.y + item.h, item.w, 1)
        ) {
          item.h++;
          changed = true;
        } else if (free(item.x, item.y - 1, item.w, 1)) {
          item.y--;
          item.h++;
          changed = true;
        }
        if (changed) occupy(item);
      }
    });
  placed.forEach((item) => {
    item.el.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    item.el.style.gridRow = `${item.y + 1} / span ${item.h}`;
  });
  fitTextTiles();
}
// Fit only grid previews; saved font sizes remain intact in the fullscreen viewer.
function fitTextTiles() {
  els.tileGrid.querySelectorAll(".text-tile").forEach(preview => {
    const tile = state.tiles.find(item => item.id === preview.closest("[data-tile-id]").dataset.tileId);
    const content = preview.querySelector(".text-content");
    const css = getComputedStyle(preview);
    const height = preview.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const width = preview.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    if (!content || height <= 0 || width <= 0) return;
    let low = 0, high = Math.max(1, Number(tile?.textStyle?.fontSize || 28));
    preview.style.fontSize = `${high}px`;
    if (content.scrollHeight <= height && content.scrollWidth <= width) return;
    for (let i = 0; i < 20; i++) {
      const size = (low + high) / 2;
      preview.style.fontSize = `${size}px`;
      if (content.scrollHeight <= height && content.scrollWidth <= width) low = size;
      else high = size;
    }
    preview.style.fontSize = `${low}px`;
  });
}
document.fonts?.ready.then(fitTextTiles);
document.fonts?.addEventListener("loadingdone", fitTextTiles);
let layoutFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(layoutTiles);
}).observe(els.tileGrid);

function formatUploadBytes(bytes) {
  return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(2)} MB`;
}
function updateSubmissionProgress({ loaded = 0, total = 0, ratio = 0 } = {}) {
  const progress = $("#submissionProgress");
  if (!progress) return;
  progress.hidden = total <= 0;
  const pct = Math.max(0, Math.min(100, Math.round((ratio || (total ? loaded / total : 0)) * 100)));
  $("#submissionProgressBar").style.width = `${pct}%`;
  $("#submissionProgressAmount").textContent = `${formatUploadBytes(loaded)} / ${formatUploadBytes(total)}`;
  $("#submissionProgressPercent").textContent = `${pct}%`;
}
function beginSubmission(message = "Adding...", { cancelable = false } = {}) {
  const dialog = $("#submissionModal");
  if (dialog.open) return false;
  $("#submissionMessage").textContent = message;
  $("#submissionCancel").hidden = !cancelable;
  updateSubmissionProgress();
  dialog.showModal();
  return true;
}
function endSubmission() {
  state.activeUploadController = null;
  state.activeUploadCanceled = false;
  const dialog = $("#submissionModal");
  if (dialog.open) dialog.close();
}
$("#submissionModal").addEventListener("cancel", (event) => event.preventDefault());
$("#submissionCancel").addEventListener("click", () => {
  if (!state.activeUploadController) return;
  state.activeUploadCanceled = true;
  state.activeUploadController.abort();
  $("#submissionMessage").textContent = "Canceling...";
  $("#submissionCancel").disabled = true;
});

function renderTopLinks() {
  els.topLinks.innerHTML =
    state.topLinks
      .map((link) => {
        const image = link.image || favicon(link.url);
        return `<div class="top-link"><a class="circle-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" data-tooltip="${escapeHtml(link.label)}" data-tooltip-url="${escapeHtml(link.url)}" aria-label="${escapeHtml(link.label)}">${image ? `<img src="${escapeHtml(image)}" alt="" />` : "<span>↗</span>"}</a><button type="button" class="capsule-x top-link-edit" data-edit-top-link="${escapeHtml(link.id)}" aria-label="Edit ${escapeHtml(link.label || "top link")}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg></button><button type="button" class="capsule-x top-link-remove" data-delete-top-link="${escapeHtml(link.id)}" aria-label="Delete ${escapeHtml(link.label || "top link")}">×</button></div>`;
      })
      .join("") +
    `<button class="circle-link circle-link--add" id="addTopLink" data-tooltip="Add top link" aria-label="Add top link">+</button>`;
}
function ensureCollections() {
  if (state.collectionsInitialized) return;
  state.collectionsInitialized = true;
  if (Array.isArray(state.collections) && state.collections.length) return;
  const legacy = (state.bookmarks || []).filter((id) =>
    state.tiles.some((t) => t.id === id),
  );
  state.collections = [
    {
      id: "collection-default",
      name: "Saved",
      collapsed: false,
      items: legacy,
    },
  ];
}
function renderBookmarks() {
  ensureCollections();
  const byId = new Map(state.tiles.map((t) => [t.id, t]));
  state.collections = state.collections.map((c) => ({
    ...c,
    items: (c.items || []).filter((id) => byId.has(id)),
  }));
  if (state.activeCollectionId && !state.collections.some((c) => c.id === state.activeCollectionId)) state.activeCollectionId = null;
  const activeCollection = state.collections.find((c) => c.id === state.activeCollectionId);
  els.collectionFilterBar.hidden = !activeCollection;
  els.collectionFilterName.textContent = activeCollection?.name || "";
  els.bookmarks.innerHTML =
    state.collections
      .map((collection, index) => {
        const items = (collection.items || [])
          .map((id, itemIndex) => {
            const tile = byId.get(id);
            return `<div class="bookmark-item collection-item" draggable="true" tabindex="0" role="button" aria-label="Open ${escapeHtml(tile.label || defaultTileLabel(tile))}" data-bookmark-id="${escapeHtml(id)}" data-collection-id="${escapeHtml(collection.id)}" data-item-index="${itemIndex}"><span class="bookmark-grip">⋮⋮</span><div><strong>${escapeHtml(tile.label || defaultTileLabel(tile))}</strong><small>${escapeHtml(tile.type)}</small></div><button class="bookmark-remove capsule-x" data-remove-bookmark="${escapeHtml(id)}" data-from-collection="${escapeHtml(collection.id)}" aria-label="Remove from collection">×</button></div>`;
          })
          .join("");
        return `<section class="collection-folder ${collection.collapsed ? "is-collapsed" : ""} ${state.activeCollectionId === collection.id ? "is-active-filter" : ""}" draggable="true" data-collection-id="${escapeHtml(collection.id)}" data-collection-index="${index}"><div class="collection-folder-head"><button class="collection-folder-toggle" type="button" data-toggle-collection="${escapeHtml(collection.id)}"><span class="collection-folder-grip" aria-hidden="true">⋮⋮</span><span class="collection-chevron" aria-hidden="true"><span></span></span><strong>${escapeHtml(collection.name)}</strong></button><button class="collection-folder-delete capsule-x" type="button" data-delete-collection="${escapeHtml(collection.id)}" aria-label="Delete ${escapeHtml(collection.name)} collection"></button></div><div class="collection-items" data-collection-drop="${escapeHtml(collection.id)}">${items || '<div class="collection-empty">Drop tiles here</div>'}</div></section>`;
      })
      .join("") ||
    `<div class="bookmark-empty"><span>＋</span><p>Create a collection folder</p></div>`;
}
function renderAll() {
  ensureCollections();
  renderCalendar();
  renderCalendarSettings();
  renderTags();
  renderTiles();
  renderTopLinks();
  renderBookmarks();
}
const THEME_KEY = "comma-hub-appearance";
function saveLocalTheme() {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(state.settings)); }
  catch { toast("Browser storage is unavailable; this theme will last for this session.", "error"); }
}
function loadLocalTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY) || "null");
    if (!saved) return;
    if (["umber", "midnight-blue", "bubblegum", "caramel", "marble", "carbon-lavender"].includes(saved.theme)) state.settings.theme = saved.theme;
    if (["dark", "light"].includes(saved.mode)) state.settings.mode = saved.mode;
  } catch { /* Use the default when browser storage is unavailable. */ }
}
function updateToday() {
  const date = new Date(), day = date.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"}[day % 10] || "th");
  const el = $("#todayDate");
  el.dateTime = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  el.textContent = `${date.toLocaleDateString("en-AU", {weekday:"long"})}, ${day}${suffix} of ${date.toLocaleDateString("en-AU", {month:"long"})} (${date.toLocaleDateString("en-GB")})`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function unescapeIcs(value = "") {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
function parseIcsDate(value, params = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const allDay = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(raw);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const [, y, m, d, hh = "00", mm = "00", ss = "00", z] = match;
  const date = z
    ? new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss))
    : new Date(+y, +m - 1, +d, +hh, +mm, +ss);
  return { date, allDay };
}
function parseRRule(value = "") {
  return Object.fromEntries(String(value).split(";").map((part) => {
    const i = part.indexOf("=");
    return i > 0 ? [part.slice(0, i).toUpperCase(), part.slice(i + 1)] : [part.toUpperCase(), ""];
  }));
}
function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}
function matchesRecurrence(date, start, rule) {
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const days = Math.round((startOfDay(date) - startOfDay(start)) / 86400000);
  if (days < 0) return false;
  if (freq === "DAILY" && days % interval !== 0) return false;
  if (freq === "WEEKLY" && Math.floor(days / 7) % interval !== 0) return false;
  if (freq === "MONTHLY" && monthDiff(start, date) % interval !== 0) return false;
  if (freq === "YEARLY" && (date.getFullYear() - start.getFullYear()) % interval !== 0) return false;
  if (!freq) return false;
  const byDay = rule.BYDAY?.split(",").map((d) => d.replace(/^[-+]?\d+/, ""));
  if (byDay?.length) {
    const names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    if (!byDay.includes(names[date.getDay()])) return false;
  } else if (freq === "WEEKLY" && date.getDay() !== start.getDay()) return false;
  const byMonth = rule.BYMONTH?.split(",").map(Number);
  if (byMonth?.length && !byMonth.includes(date.getMonth() + 1)) return false;
  const byMonthDay = rule.BYMONTHDAY?.split(",").map(Number);
  if (byMonthDay?.length && !byMonthDay.includes(date.getDate())) return false;
  if (!byMonthDay?.length && freq === "MONTHLY" && date.getDate() !== start.getDate()) return false;
  if (!byMonth?.length && freq === "YEARLY" && date.getMonth() !== start.getMonth()) return false;
  if (!byMonthDay?.length && freq === "YEARLY" && date.getDate() !== start.getDate()) return false;
  return true;
}
function parseIcsEvents(content) {
  if (!content) return [];
  const unfolded = String(content).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events = [];
  let current = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") {
      if (current?.DTSTART) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const left = line.slice(0, colon), value = line.slice(colon + 1);
    const [name, ...paramBits] = left.split(";");
    const key = name.toUpperCase();
    if (["DTSTART", "DTEND", "SUMMARY", "DESCRIPTION", "LOCATION", "RRULE", "UID"].includes(key)) {
      current[key] = value;
      current[`${key}_PARAMS`] = paramBits.join(";");
    }
  }
  return events;
}
function expandCalendarEvents(content, windowStart, windowEnd) {
  const result = new Map();
  const add = (day, event, occurrenceStart) => {
    const key = dateKey(day);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push({
      summary: unescapeIcs(event.SUMMARY || "Untitled event"),
      description: unescapeIcs(event.DESCRIPTION || ""),
      location: unescapeIcs(event.LOCATION || ""),
      allDay: occurrenceStart.allDay,
      time: occurrenceStart.allDay ? "" : occurrenceStart.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    });
  };
  for (const event of parseIcsEvents(content)) {
    const start = parseIcsDate(event.DTSTART, event.DTSTART_PARAMS);
    if (!start) continue;
    const end = parseIcsDate(event.DTEND, event.DTEND_PARAMS);
    const durationDays = end?.allDay ? Math.max(1, Math.round((startOfDay(end.date) - startOfDay(start.date)) / 86400000)) : 1;
    const rule = event.RRULE ? parseRRule(event.RRULE) : null;
    const until = rule?.UNTIL ? parseIcsDate(rule.UNTIL)?.date : null;
    let occurrenceCount = 0;
    for (let day = new Date(windowStart); day < windowEnd; day = addDays(day, 1)) {
      let occurs = false;
      if (!rule) occurs = dateKey(day) === dateKey(start.date);
      else if ((!until || day <= until) && matchesRecurrence(day, start.date, rule)) {
        occurs = true;
        occurrenceCount++;
        if (rule.COUNT && occurrenceCount > Number(rule.COUNT)) occurs = false;
      }
      if (!occurs) continue;
      const occurrenceStart = { ...start, date: new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.date.getHours(), start.date.getMinutes(), start.date.getSeconds()) };
      for (let i = 0; i < durationDays; i++) {
        const eventDay = addDays(day, i);
        if (eventDay >= windowStart && eventDay < windowEnd) add(eventDay, event, occurrenceStart);
      }
    }
  }
  for (const items of result.values()) items.sort((a, b) => (a.time || "").localeCompare(b.time || "") || a.summary.localeCompare(b.summary));
  return result;
}
function calendarWeekStart(reference = new Date()) {
  const day = startOfDay(reference);
  return addDays(day, -day.getDay());
}
function renderCalendarSettings() {
  const enabled = ENABLE_CALENDAR_MODULE;
  const section = $("#calendarSettings")?.closest(".settings-section");
  if (section) section.hidden = !enabled;
  if (!enabled) return;
  const exists = !!state.calendar?.exists;
  els.calendarFileRow.hidden = !exists;
  els.calendarUploadRow.hidden = exists;
  els.calendarFileName.textContent = state.calendar?.fileName || "calendar.ics";
  els.calendarFileStatus.textContent = exists && state.calendar?.updatedAt
    ? `Loaded · ${new Date(state.calendar.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "Calendar loaded";
}
function calendarDefaultDayWidth() {
  if (window.matchMedia("(max-width: 900px)").matches) return 128;
  if (window.matchMedia("(max-width: 1180px)").matches) return 122;
  return 132;
}
function calendarFillDayCount() {
  const width = els.calendarRanges?.clientWidth || els.calendarModule?.clientWidth || 0;
  const dayWidth = calendarDefaultDayWidth();
  const gap = 10;
  if (!width) return 1;
  return Math.max(1, Math.ceil((width + gap) / (dayWidth + gap)));
}
function calendarDayMarkup(date, items, today) {
  const dense = items.length >= 5 ? " is-dense" : items.length >= 3 ? " is-compact" : "";
  const listClass = items.length > 3 ? " calendar-event-list--scroll" : "";
  const todayClass = dateKey(date) === dateKey(today) ? " is-today" : "";
  const past = startOfDay(date) < startOfDay(today);
  return `<article class="calendar-day${dense}${todayClass}${past ? " is-past" : ""}"><div class="calendar-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString("en-AU", { weekday: "short" })}</span></div><div class="calendar-event-list${listClass}">${items.map((item) => `<div class="calendar-event${past ? " is-past" : ""}" tabindex="0" data-tooltip="${escapeHtml(item.summary)}"${item.description ? ` data-tooltip-description="${escapeHtml(item.description)}"` : ""}><span class="calendar-event-title">${escapeHtml(item.summary)}</span>${item.time ? `<span class="calendar-event-time">${escapeHtml(item.time)}</span>` : ""}</div>`).join("")}</div></article>`;
}
function renderCalendar() {
  if (!ENABLE_CALENDAR_MODULE) {
    els.calendarModule.hidden = true;
    return;
  }
  if (!state.calendar?.exists) {
    els.calendarModule.hidden = true;
    els.calendarRanges.innerHTML = "";
    return;
  }

  els.calendarModule.hidden = false;
  const today = startOfDay(new Date());
  const week0 = calendarWeekStart(today);
  const fourWeekEnd = addDays(week0, 28);
  const content = state.calendar?.content || "";
  const defaultEvents = expandCalendarEvents(content, week0, fourWeekEnd);
  const defaultEventDays = [...defaultEvents.keys()].sort();
  const fillDayCount = calendarFillDayCount();
  const shouldExtend = defaultEventDays.length < fillDayCount;

  let html = "";

  if (!shouldExtend) {
    const ranges = [
      { label: "This Week", start: 0, days: 7 },
      { label: "Next Week", start: 7, days: 7 },
      { label: "Upcoming", start: 14, days: 14 },
    ];
    html = ranges.map((range) => {
      const dayEntries = [];
      for (let i = 0; i < range.days; i++) {
        const date = addDays(week0, range.start + i);
        const items = defaultEvents.get(dateKey(date)) || [];
        if (!items.length) continue;
        dayEntries.push(calendarDayMarkup(date, items, today));
      }
      if (!dayEntries.length) return "";
      return `<section class="calendar-range" style="--event-days:${dayEntries.length}"><div class="calendar-range-label"><span></span><strong>${range.label}</strong><span></span></div><div class="calendar-days">${dayEntries.join("")}</div></section>`;
    }).join("");
  } else {
    // Sparse four-week calendars keep walking forward until there are enough
    // event-days to fill the visible row at the default card width.
    let searchEnd = fourWeekEnd;
    let events = defaultEvents;
    let eventDays = defaultEventDays;
    const maxSearchEnd = addDays(week0, 3660); // safety ceiling: ten years
    while (eventDays.length < fillDayCount && searchEnd < maxSearchEnd) {
      searchEnd = new Date(Math.min(addDays(searchEnd, 56).getTime(), maxSearchEnd.getTime()));
      events = expandCalendarEvents(content, week0, searchEnd);
      eventDays = [...events.keys()].sort();
    }
    const visibleKeys = eventDays.slice(0, fillDayCount);
    const groups = new Map();
    for (const key of visibleKeys) {
      const [year, month, day] = key.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (!groups.has(monthKey)) groups.set(monthKey, { date, days: [] });
      groups.get(monthKey).days.push({ date, items: events.get(key) || [] });
    }
    html = [...groups.values()].map((group) => {
      const label = group.date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
      const dayEntries = group.days.map(({ date, items }) => calendarDayMarkup(date, items, today));
      return `<section class="calendar-range calendar-range--month" style="--event-days:${dayEntries.length}"><div class="calendar-range-label"><span></span><strong>${escapeHtml(label)}</strong><span></span></div><div class="calendar-days">${dayEntries.join("")}</div></section>`;
    }).join("");
  }

  els.calendarRanges.innerHTML = html;
  els.calendarRanges.classList.toggle("is-month-mode", shouldExtend && !!html);
  els.calendarEmpty.hidden = !!html || !state.calendar?.exists;
}

function applyTheme() {
  const theme = state.settings.theme || "umber";
  const mode = state.settings.mode || "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = mode;
  const dark = mode !== "light";
  els.modeToggle.checked = dark;
  els.modeLabel.textContent = dark ? "Dark mode" : "Light mode";
  $$("[data-theme-choice]").forEach((card) => {
    const active = card.dataset.themeChoice === theme;
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-pressed", String(active));
  });
}
function setSection(section) {
  state.section = section;
  const dashboard = section === "dashboard";
  $(".workspace").hidden = !dashboard;
  $("#developmentPanel").hidden = dashboard;
  $("#developmentTitle").textContent = SECTION_TITLES[section];
  $$(".nav-tab").forEach((btn) =>
    btn.classList.toggle("is-active", btn.dataset.section === section),
  );
  renderTiles();
}

function revokePreviewUrls() {
  state.previewUrls.forEach(URL.revokeObjectURL);
  state.previewUrls = [];
}
function filePreviewUrl(file) {
  if (typeof file === "string") return escapeHtml(file);
  const u = URL.createObjectURL(file);
  state.previewUrls.push(u);
  return u;
}
function pendingFiles() {
  return state.pendingDrop?.files || [];
}
function detectFileType(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (/\.(ttf|otf|woff2?)$/i.test(file.name)) return "font";
  return "file";
}
function detectFiles(files) {
  const arr = [...files];
  if (!arr.length) return null;
  const types = arr.map(detectFileType);
  return {
    type: types.every((t) => t === "image") ? "image" : types[0],
    files: arr,
  };
}
function detectDrop(dt) {
  const fileDrop = detectFiles(dt.files || []);
  if (fileDrop) return fileDrop;
  const uri = dt.getData("text/uri-list") || "";
  const plain = dt.getData("text/plain") || "";
  const candidate = uri || plain;
  if (
    /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[\/:?#].*)?$/i.test(
      candidate.trim(),
    )
  )
    return { type: "link", url: normalizeUrl(candidate.trim()) };
  if (plain.trim()) return { type: "text", text: plain };
  return null;
}

const metadataCache = new WeakMap();
let metadataRevision = 0;
async function refreshMetadataTags() {
  const revision = ++metadataRevision;
  const files = [...pendingFiles()];
  const row = $("#metadataTags");
  row.textContent = files.some(f => typeof f !== "string") ? "Reading file metadata…" : "";
  const results = await Promise.all(files.map(async file => {
    if (typeof file === "string") return state.pendingDrop?.fileMetadata?.[file] || {};
    if (!metadataCache.has(file)) metadataCache.set(file, api.inspectMetadata(file).catch(() => ({unavailable: true})));
    return metadataCache.get(file);
  }));
  if (revision !== metadataRevision) return;
  const tags = [...new Set(results.flatMap(m => m.tags || []))];
  row.innerHTML = tags.length ? `<span class="metadata-label">File metadata</span>${tags.map(t => `<span class="metadata-tag">${escapeHtml(t)}</span>`).join("")}` : (results.some(m => m.unavailable) ? "Metadata preview unavailable; extraction will be retried when saved." : "");
}
function renderTagEditor() {
  els.tagCapsules.innerHTML = state.pendingTags
    .map(
      (tag) =>
        `<span class="tag-capsule">${escapeHtml(tag)}<button class="capsule-x" type="button" data-remove-form-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button></span>`,
    )
    .join("");
  els.contentForm.elements.tags.value = state.pendingTags.join(",");
  els.presetTags.innerHTML = PRESET_TAGS.map(
    (tag) =>
      `<button type="button" class="preset-tag ${state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? "is-added" : ""}" aria-pressed="${state.pendingTags.some(t => t.toLowerCase() === tag.toLowerCase())}" data-preset-tag="${tag}">${tag}</button>`,
  ).join("");
}
function normalizeTag(raw) {
  return raw
    .trim()
    .replace(/^,+|,+$/g, "")
    .replace(/\s+/g, " ");
}
function addTag(raw) {
  const tag = normalizeTag(raw);
  if (!tag) return;
  if (!state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    state.pendingTags.push(tag);
  renderTagEditor();
}
function commitTagInput() {
  const raw = els.tagInput.value;
  if (raw.trim()) addTag(raw);
  els.tagInput.value = "";
}

function customUploadMarkup({
  id,
  name = "",
  accept = "",
  label = "Choose file",
  multiple = false,
  helper = "",
}) {
  return `<div class="custom-upload"><input id="${id}" ${name ? `name="${name}"` : ""} type="file" ${accept ? `accept="${accept}"` : ""} ${multiple ? "multiple" : ""} hidden><button class="upload-button" type="button" data-file-trigger="${id}"><span class="upload-button-icon">＋</span><span>${label}</span></button><span class="upload-file-name" data-file-name="${id}">No file selected</span></div>${helper ? `<small>${helper}</small>` : ""}`;
}
function singleImagePickerMarkup(
  file = state.pendingThumbnail,
  topLink = false,
) {
  const thumb = file
    ? `<div class="gallery-thumb"><img src="${topLink ? escapeHtml(state.topLinkPreviewUrl) : filePreviewUrl(file)}" alt="${escapeHtml(file.name || "Thumbnail")}"><button type="button" class="capsule-x gallery-remove" ${topLink ? "data-remove-top-link-image" : "data-remove-thumbnail"} aria-label="Remove thumbnail">×</button></div>`
    : "";
  return `<div class="gallery-picker gallery-picker--single">${thumb}<button type="button" class="gallery-add" id="${topLink ? "topLinkImageAdd" : "thumbnailAdd"}" aria-label="Add thumbnail"><span class="image-placeholder">▧</span><b>+</b></button></div><input id="${topLink ? "topLinkImageInput" : "thumbnailPickerInput"}" type="file" accept="image/*" hidden>`;
}
function setTopLinkImage(file = null) {
  if (state.topLinkPreviewUrl) URL.revokeObjectURL(state.topLinkPreviewUrl);
  state.pendingTopLinkImage = file;
  state.topLinkPreviewUrl =
    typeof file === "string" ? file : file ? URL.createObjectURL(file) : null;
  $("#topLinkImagePicker").innerHTML = singleImagePickerMarkup(file, true);
}
function selectedMediaMarkup(type) {
  if (!["image", "video", "audio", "font", "file"].includes(type)) return "";
  const accept = {image: "image/*", video: "video/*", audio: "audio/*", font: ".ttf,.otf,.woff,.woff2"}[type] || "";
  const thumbs = pendingFiles().map((file, i) => {
    const name = typeof file === "string" ? file.split("/").pop() : file.name;
    const fileType = typeof file === "string" ? type : detectFileType(file);
    const symbol = {video: "▶", audio: "♪", font: "Aa", file: "↗"}[fileType] || "↗";
    const preview = fileType === "image" ? `<img src="${filePreviewUrl(file)}" alt="">`
      : fileType === "video" ? `<video src="${filePreviewUrl(file)}" muted playsinline preload="metadata"></video>`
      : `<span class="file-preview-symbol" aria-hidden="true">${symbol}</span>`;
    return `<div class="gallery-thumb" title="${escapeHtml(name)}">${preview}<span class="file-preview-name">${escapeHtml(name)}</span><button type="button" class="capsule-x gallery-remove" data-remove-pending-file="${i}" aria-label="Remove ${escapeHtml(name)}">×</button></div>`;
  }).join("");
  return `<div class="gallery-picker" id="galleryPicker">${thumbs}<button type="button" class="gallery-add" id="galleryAdd" aria-label="Add files"><span class="image-placeholder">▧</span><b>+</b></button></div><input id="galleryFileInput" type="file" ${accept ? `accept="${accept}"` : ""} multiple hidden>`;
}
const BUILTIN_FONT_OPTIONS = `<option value="Arial, sans-serif">Arial</option><option value="Helvetica, Arial, sans-serif">Helvetica</option><option value="Georgia, serif">Georgia</option><option value="'Times New Roman', serif">Times New Roman</option><option value="Verdana, sans-serif">Verdana</option><option value="Tahoma, sans-serif">Tahoma</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option><option value="'Courier New', monospace">Courier New</option><option value="Impact, sans-serif">Impact</option><option value="system-ui, sans-serif">System UI</option>`;
const FONT_UPLOAD_ICON =
  '<svg viewBox="0 0 24 20" width="22" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h8M3 3v13M3 9.5h6"/><path d="M18 17V6M14.5 9.5 18 6l3.5 3.5"/></svg>';
function fontOptionsMarkup() {
  const custom = state.fonts
    .map(
      (f) =>
        `<option value="${escapeHtml(f.family)}">${escapeHtml(f.name)}</option>`,
    )
    .join("");
  return (
    BUILTIN_FONT_OPTIONS +
    (custom ? `<optgroup label="Uploaded fonts">${custom}</optgroup>` : "")
  );
}
// Register uploaded fonts so previews, tiles and the viewer can render them.
function registerFontFaces() {
  let style = document.getElementById("customFontFaces");
  if (!style) {
    style = document.createElement("style");
    style.id = "customFontFaces";
    document.head.append(style);
  }
  style.textContent = state.fonts
    .map((f) => {
      const family = String(f.name).replace(/[^\p{L}\p{N} _.-]/gu, "");
      return `@font-face{font-family:'${family}';src:url('${encodeURI(f.file)}') format('${f.format || "truetype"}');font-display:swap}`;
    })
    .join("\n");
}
function fontForTile(tile) {
  const family = tile?.textStyle?.font;
  return family ? state.fonts.find((f) => f.family === family) : null;
}
function refreshFontSelect(selected) {
  const select = els.contentForm.elements.font;
  if (!select || select.tagName !== "SELECT") return;
  const current = selected ?? select.value;
  // Keep any previously saved font that is no longer in either list.
  const builtin = new Set(
    [...BUILTIN_FONT_OPTIONS.matchAll(/value="([^"]*)"/g)].map((m) => m[1].replace(/&#39;/g, "'")),
  );
  const legacy = [...select.options].filter(
    (o) => !builtin.has(o.value) && !state.fonts.some((f) => f.family === o.value),
  );
  select.innerHTML = fontOptionsMarkup();
  select.append(...legacy);
  select.value = current;
}
function tileBackgroundPickerMarkup() {
  const groups = TILE_COLOR_GROUPS.map(group => `<div class="tile-color-group" role="group" aria-label="${group.label} background colours"><small class="tile-color-label">${group.label}</small><div class="tile-color-swatches">${group.indices.map((index, variant) => `<button type="button" class="tile-color-option" style="background:var(--tile-color-${index})" data-tile-color="${index}" data-tooltip="${group.label}${group.indices.length > 1 ? ` ${variant + 1}` : ""}" aria-label="${group.label} background colour${group.indices.length > 1 ? ` ${variant + 1}` : ""}" aria-pressed="${state.pendingDrop.backgroundColor === index}"><span>Aa</span></button>`).join("")}</div></div>`).join("");
  return `<div class="tile-background-picker">${singleImagePickerMarkup()}<div class="tile-color-options">${groups}</div></div><small>Choose one thumbnail or a background colour.</small>`;
}
function fieldMarkup(type, pending = {}) {
  const media = selectedMediaMarkup(type);
  if (type === "media")
    return `<div class="field field--wide"><span>Media</span><div class="media-empty-drop"><strong>Drop media here</strong><small>Drag files into this modal, paste an image, or choose files manually.</small><button class="upload-button" type="button" id="chooseMediaButton"><span class="upload-button-icon">＋</span><span>Choose media</span></button></div></div>`;
  if (type === "link")
    return `<label class="field field--wide"><span>URL</span><input name="url" type="text" inputmode="url" required placeholder="website.com" value="${escapeHtml(pending.url || "")}" /></label><div class="field field--wide"><span>Thumbnail image / colour</span>${tileBackgroundPickerMarkup()}</div>`;
  if (type === "text")
    return `<div class="text-format-row"><div class="field text-font-field"><span>Font</span><div class="font-picker-row"><select name="font">${fontOptionsMarkup()}</select><button type="button" class="font-upload-btn" id="fontUploadButton" aria-label="Upload a font file" data-tooltip="Upload font">${FONT_UPLOAD_ICON}</button></div><input id="fontFileInput" type="file" accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.eot" hidden /></div><label class="field text-size-field"><span>Size</span><input name="fontSize" class="scrub-input" type="number" min="12" max="96" value="28" /></label><div class="field text-style-field"><span>Style</span><div class="format-row"><label class="format-toggle"><input name="bold" type="checkbox" /><span>B</span></label><label class="format-toggle"><input name="italic" type="checkbox" /><span><i>I</i></span></label><label class="format-toggle"><input name="underline" type="checkbox" /><span><u>U</u></span></label><input name="align" type="hidden" value="left" /><button type="button" class="align-toggle" id="alignToggle" data-align-cycle aria-label="Text alignment: left" data-tooltip="Align: left"></button></div></div></div><label class="field field--wide"><span>Text</span><textarea class="text-live-preview-input" name="text" rows="1" required placeholder="Type text for your tile preview...">${escapeHtml(pending.text || "")}</textarea></label><div class="field field--wide"><span>Thumbnail image / colour</span>${tileBackgroundPickerMarkup()}</div>`;
  if (type === "image")
    return `<div class="field field--wide"><span>Gallery images</span>${media}<small>Drop or paste images anywhere in this modal to add them to the gallery.</small></div>`;
  const mediaLabel = {video: "Video", audio: "Audio", font: "Font files", file: "Files"}[type] || "Files";
  return `<div class="field field--wide"><span>${mediaLabel}</span>${media}</div><div class="field field--wide"><span>Tile image</span>${singleImagePickerMarkup()}</div>`;
}
function filesRequired(type) {
  return (
    !pendingFiles().length && ["video", "audio", "font", "file"].includes(type)
  );
}
function refreshDynamicFields() {
  const location = els.contentForm.elements.location;
  const hideLocation = ["text", "link"].includes(state.pendingDrop.type);
  location.closest(".field").hidden = hideLocation;
  location.disabled = hideLocation;
  refreshMetadataTags();
  const draft = new FormData(els.contentForm);
  const preserve =
    els.contentForm.elements.type.value === state.pendingDrop.type;
  revokePreviewUrls();
  els.dynamicFields.innerHTML = fieldMarkup(
    state.pendingDrop.type,
    state.pendingDrop,
  );
  els.contentForm.elements.type.value = state.pendingDrop.type;
  if (preserve) {
    for (const field of els.dynamicFields.querySelectorAll("[name]")) {
      if (field.type === "file") continue;
      if (field.type === "checkbox") field.checked = draft.has(field.name);
      else if (draft.has(field.name)) {
        const value = draft.get(field.name);
        if (
          field.name === "font" &&
          ![...field.options].some((option) => option.value === value)
        ) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          field.append(option);
        }
        field.value = value;
      }
    }
  }
  if (state.pendingDrop.type === "text") updateTextPreview();
}

// Number fields: click to select + type; click-and-drag left/right to decrease/increase.
function initScrubInputs() {
  const PX_PER_STEP = 4;
  const DRAG_THRESHOLD = 3;
  let drag = null;
  const clamp = (input, v) => {
    const min = input.min !== "" ? Number(input.min) : -Infinity;
    const max = input.max !== "" ? Number(input.max) : Infinity;
    return Math.min(max, Math.max(min, v));
  };
  document.addEventListener("pointerdown", (e) => {
    const input = e.target.closest?.(".scrub-input");
    if (!input || e.button > 0) return;
    drag = {
      input,
      id: e.pointerId,
      startX: e.clientX,
      startValue: Number(input.value) || Number(input.min) || 0,
      moved: false,
    };
    input.setPointerCapture?.(e.pointerId);
  });
  // Stop the native caret placement / text selection so a drag never highlights anything.
  document.addEventListener("mousedown", (e) => {
    if (e.target.closest?.(".scrub-input")) e.preventDefault();
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add("is-scrubbing");
      drag.input.blur();
    }
    const next = clamp(
      drag.input,
      drag.startValue + Math.round(dx / PX_PER_STEP),
    );
    if (String(next) !== drag.input.value) {
      drag.input.value = next;
      drag.input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { input, moved } = drag;
    drag = null;
    input.releasePointerCapture?.(e.pointerId);
    document.body.classList.remove("is-scrubbing");
    if (moved) input.dispatchEvent(new Event("change", { bubbles: true }));
    else if (e.type === "pointerup") {
      input.focus();
      input.select();
    }
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
  // Typed values get clamped when the field is committed.
  document.addEventListener("focusout", (e) => {
    const input = e.target.closest?.(".scrub-input");
    if (!input) return;
    const v = input.value === "" ? Number(input.min) || 0 : Number(input.value);
    const next = clamp(input, Math.round(v));
    if (String(next) !== input.value) {
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

function updateTextPreviewBackground() {
  if (state.pendingDrop?.type !== "text") return;
  const preview = els.contentForm.elements.text;
  if (!preview) return;
  preview.style.backgroundColor = Number.isInteger(state.pendingDrop.backgroundColor)
    ? tileColor(state.pendingDrop) : "";
}

function selectTileBackground(index) {
  if (!["text", "link"].includes(state.pendingDrop?.type) ||
      !Number.isInteger(index) || index < 0 || index >= TILE_COLOR_COUNT) return;
  const scrollTop = els.contentForm.scrollTop;
  state.pendingDrop.backgroundColor = state.pendingDrop.backgroundColor === index ? null : index;
  state.pendingThumbnail = null;
  // Preserve the editor and focused swatch instead of rebuilding the form.
  els.dynamicFields.querySelectorAll(".gallery-picker--single .gallery-thumb").forEach(thumb => thumb.remove());
  const thumbnailInput = els.dynamicFields.querySelector("#thumbnailPickerInput");
  if (thumbnailInput) thumbnailInput.value = "";
  els.dynamicFields.querySelectorAll("[data-tile-color]").forEach(button => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.tileColor) === state.pendingDrop.backgroundColor));
  });
  revokePreviewUrls();
  updateTextPreviewBackground();
  els.contentForm.scrollTop = scrollTop;
}

function updateTextPreview() {
  if (state.pendingDrop?.type !== "text") return;
  const f = els.contentForm.elements;
  const preview = f.text;
  if (!preview) return;
  preview.style.fontFamily = f.font?.value || "Arial, sans-serif";
  preview.style.fontSize = `${Number(f.fontSize?.value || 28)}px`;
  preview.style.fontWeight = f.bold?.checked ? "700" : "500";
  preview.style.fontStyle = f.italic?.checked ? "italic" : "normal";
  preview.style.textDecoration = f.underline?.checked ? "underline" : "none";
  preview.style.textAlign = f.align?.value || "left";
  updateTextPreviewBackground();
  syncAlignToggle();
  autosizeTextPreview();
}
const ALIGN_ORDER = ["left", "center", "right"];
const ALIGN_ICONS = {
  left: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h9M3 15h12"/></svg>',
  center:
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M5.5 10h9M4 15h12"/></svg>',
  right:
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M8 10h9M5 15h12"/></svg>',
};
function syncAlignToggle() {
  const btn = $("#alignToggle");
  const input = els.contentForm.elements.align;
  if (!btn || !input) return;
  const value = ALIGN_ORDER.includes(input.value) ? input.value : "left";
  if (btn.dataset.state === value) return;
  btn.dataset.state = value;
  btn.innerHTML = ALIGN_ICONS[value];
  btn.setAttribute("aria-label", `Text alignment: ${value}`);
  btn.dataset.tooltip = `Align: ${value}`;
}
// Grow the textarea to fit its content; it starts at the minimum height.
function autosizeTextPreview() {
  const ta = els.contentForm.elements.text;
  if (!ta || ta.tagName !== "TEXTAREA" || !ta.offsetParent) return;
  ta.style.height = "auto";
  const cs = getComputedStyle(ta);
  const border =
    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  ta.style.height = `${ta.scrollHeight + border}px`;
}
function openContentModal(pending) {
  if (state.section !== "dashboard" || $("#submissionModal").open) return;
  state.editingId = null;
  $("#deleteContentButton").hidden = true;
  $("#saveContentButton").textContent = "Add content";
  revokePreviewUrls();
  state.pendingDrop = { ...pending, files: [...(pending.files || [])] };
  state.pendingThumbnail = null;
  state.pendingTags = [];
  els.contentForm.reset();
  els.dynamicFields.replaceChildren();
  els.contentForm.elements.type.value = pending.type;
  els.contentTypeEyebrow.textContent = `${pending.type} content`;
  els.contentModalTitle.textContent = `Add ${pending.type}`;
  refreshDynamicFields();
  renderTagEditor();
  els.contentModal.showModal();
  if (pending.type === "text") updateTextPreview();
}

function openEditModal(tileId) {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile) return;
  openContentModal({ ...tile, text: displayText(tile) });
  state.editingId = tile.id;
  state.pendingThumbnail = tile.thumbnail || null;
  state.pendingTags = [...(tile.tags || [])];
  const f = els.contentForm.elements;
  for (const name of ["label", "description", "location", "size", "orientation"])
    if (tile[name] != null) f[name].value = tile[name];
  refreshDynamicFields();
  if (tile.type === "text") {
    const style = tile.textStyle || {};
    for (const name of ["font", "fontSize", "align"])
      if (style[name] != null) f[name].value = style[name];
    // Preserve previously saved custom fonts in the editor as well.
    if (style.font && !f.font.value) {
      const option = document.createElement("option");
      option.value = style.font;
      option.textContent = style.font;
      f.font.append(option);
      f.font.value = style.font;
    }
    for (const name of ["bold", "italic", "underline"])
      f[name].checked = !!style[name];
    updateTextPreview();
  }
  renderTagEditor();
  els.contentModalTitle.textContent = `Edit ${tile.type}`;
  $("#deleteContentButton").hidden = false;
  $("#saveContentButton").textContent = "Save changes";
}
function setContentBusy(busy) {
  state.savingContent = busy;
  $("#saveContentButton").disabled = busy;
  $("#deleteContentButton").disabled = busy;
}
async function handleContentSubmit(event) {
  event.preventDefault();
  if (state.savingContent) return;
  const type = state.pendingDrop?.type;
  if (type === "media") {
    toast("Choose, drop, or paste media first", "error");
    return;
  }
  if (
    ["image", "video", "audio", "font", "file"].includes(type) &&
    !pendingFiles().length
  ) {
    toast("Choose at least one file", "error");
    return;
  }
  commitTagInput();
  const form = new FormData(els.contentForm),
    editingId = state.editingId;
  form.set("section", state.tiles.find((tile) => tile.id === editingId)?.section || state.section);
  if (type === "link") form.set("url", normalizeUrl(form.get("url")));
  if (["text", "link"].includes(type)) {
    form.set("backgroundColor", String(Number.isInteger(state.pendingDrop.backgroundColor)
      ? state.pendingDrop.backgroundColor : Math.floor(Math.random() * TILE_COLOR_COUNT)));
    form.set("location", "");
  }
  form.set(
    "existingFiles",
    JSON.stringify(pendingFiles().filter((file) => typeof file === "string")),
  );
  pendingFiles()
    .filter((file) => typeof file !== "string")
    .forEach((file) => form.append("draggedFiles[]", file));
  form.set(
    "existingThumbnail",
    typeof state.pendingThumbnail === "string" ? state.pendingThumbnail : "",
  );
  if (state.pendingThumbnail && typeof state.pendingThumbnail !== "string")
    form.set(
      "thumbnail",
      state.pendingThumbnail,
      state.pendingThumbnail.name || "thumbnail.png",
    );
  form.set("tags", state.pendingTags.join(","));
  if (editingId) form.set("id", editingId);
  const uploadTotal = [...form.values()].reduce((sum, value) => sum + (value instanceof File ? value.size : 0), 0);
  const hasUploadFiles = uploadTotal > 0;
  if (!beginSubmission(editingId ? "Saving..." : "Adding...", { cancelable: hasUploadFiles })) return;
  if (hasUploadFiles) updateSubmissionProgress({ loaded: 0, total: uploadTotal, ratio: 0 });
  setContentBusy(true);
  state.activeUploadCanceled = false;
  const controller = hasUploadFiles ? new AbortController() : null;
  state.activeUploadController = controller;
  $("#submissionCancel").disabled = false;
  try {
    const uploadOptions = controller ? { signal: controller.signal, onProgress: updateSubmissionProgress } : {};
    const tile = await (editingId
      ? api.updateTile(form, uploadOptions)
      : api.createTile(form, uploadOptions));
    if (editingId)
      state.tiles = state.tiles.map((t) => (t.id === editingId ? tile : t));
    else state.tiles.unshift(tile);
    els.contentModal.close();
    state.pendingDrop = null;
    revokePreviewUrls();
    renderTiles();
    renderBookmarks();
    toast(editingId ? "Content updated" : "Content added");
  } catch (error) {
    if (error?.name === "AbortError" || state.activeUploadCanceled) toast("Upload canceled");
    else toast(error.message, "error");
  } finally {
    setContentBusy(false);
    endSubmission();
  }
}
async function deleteEditingContent() {
  const id = state.editingId;
  if (
    !id ||
    state.savingContent ||
    !confirm("Delete this content and remove it from all collections?")
  )
    return;
  setContentBusy(true);
  try {
    await api.deleteTile(id);
    state.tiles = state.tiles.filter((t) => t.id !== id);
    state.collections.forEach(
      (c) => (c.items = c.items.filter((item) => item !== id)),
    );
    els.contentModal.close();
    renderTiles();
    renderBookmarks();
    toast("Content deleted");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    setContentBusy(false);
  }
}
async function downloadContent() {
  const button = $("#downloadContentButton");
  button.disabled = true;
  button.textContent = "Preparing download…";
  try {
    const blob = await api.downloadContent();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hub-content-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Download Content";
  }
}
async function persistCollections() {
  try {
    await api.saveCollections(state.collections);
  } catch (error) {
    toast(error.message, "error");
  }
}

function viewerSelectedFile(tile) {
  return tile.files?.[state.viewerIndex] || tile.files?.[0] || "";
}
function viewerSelectedMediaMarkup(tile) {
  const src = viewerSelectedFile(tile);
  if (!src) return "";
  const alt = escapeHtml(tile.label || defaultTileLabel(tile));
  if (tile.type === "image") return `<div class="viewer-stage"><img class="viewer-zoom-target" src="${escapeHtml(src)}" alt="${alt}" draggable="false" /></div>`;
  if (tile.type === "video") return `<div class="viewer-stage"><video class="viewer-zoom-target" src="${escapeHtml(src)}" controls autoplay playsinline draggable="false"></video></div>`;
  return "";
}
function viewerMediaMarkup(tile) {
  if (["image", "video"].includes(tile.type) && tile.files?.length) return viewerSelectedMediaMarkup(tile);
  if (tile.type === "audio" && tile.files?.[0])
    return `<div class="viewer-audio">${tile.thumbnail ? `<img src="${escapeHtml(tile.thumbnail)}" alt="">` : ""}<audio src="${escapeHtml(tile.files[0])}" controls autoplay></audio></div>`;
  if (tile.type === "text") {
    const s = tile.textStyle || {};
    return `<div class="viewer-text" style="font-family:${escapeHtml(s.font || "inherit")};font-size:${Number(s.fontSize || 28)}px;font-weight:${s.bold ? 700 : 500};font-style:${s.italic ? "italic" : "normal"};text-decoration:${s.underline ? "underline" : "none"};text-align:${escapeHtml(s.align || "left")}"><span class="text-content">${escapeHtml(displayText(tile))}</span></div>`;
  }
  if (tile.files?.[0])
    return `<div class="viewer-file"><div class="file-symbol">${tile.type === "font" ? "Aa" : "↗"}</div><a class="btn btn--primary" href="${escapeHtml(tile.files[0])}" target="_blank" rel="noreferrer">Open file</a></div>`;
  return "";
}
function viewerPropertiesMarkup(tile) {
  const date = tile.dateAdded || tile.createdAt;
  let html = `<dl class="viewer-properties"><dt>Date added</dt><dd>${escapeHtml(date ? new Date(date).toLocaleString("en-AU") : "Unavailable")}</dd>${tile.location ? `<dt>Location</dt><dd>${escapeHtml(tile.location)}</dd>` : ""}</dl>`;
  if (["image", "video"].includes(tile.type) && tile.files?.length) {
    const file = viewerSelectedFile(tile);
    const m = tile.fileMetadata?.[file] || {};
    html += `<div class="media-properties"><dl class="viewer-properties"><dt>Dimensions</dt><dd data-dimensions>${m.width && m.height ? `${m.width} × ${m.height} px` : "Unavailable"}</dd><dt>DPI</dt><dd>${escapeHtml(m.dpi || (tile.type === "video" ? "Not applicable" : "Unavailable"))}</dd><dt>Date taken</dt><dd>${escapeHtml(m.dateTaken || "Unavailable")}</dd></dl></div>`;
  }
  return html;
}
function viewerFontLinkMarkup(tile) {
  const font = tile.type === "text" ? fontForTile(tile) : null;
  if (!font) return "";
  const download = font.originalName || `${font.name}.${font.ext}`;
  return `<div class="viewer-font"><div class="eyebrow">Font used</div><a class="viewer-font-link" href="${escapeHtml(encodeURI(font.file))}" download="${escapeHtml(download)}"><span>${escapeHtml(font.name)}</span><small>Download .${escapeHtml(font.ext)}</small></a></div>`;
}
function viewerActionsMarkup(tile) {
  if (!tile.files?.length || ["text", "link"].includes(tile.type)) return "";
  const selected = `api.php?action=tiles.download&amp;id=${encodeURIComponent(tile.id)}&amp;index=${state.viewerIndex}`;
  const all = `api.php?action=tiles.download&amp;id=${encodeURIComponent(tile.id)}`;
  return `<a class="viewer-action-button" href="${selected}" download data-tooltip="Download" aria-label="Download selected media"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 15v5h14v-5"/></svg></a>${tile.files.length > 1 ? `<a class="viewer-action-button" href="${all}" download data-tooltip="Download All" aria-label="Download all media"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4H8zM6 8h12v4H6zM5 13h14v7H5zM12 15v3m0 0 2-2m-2 2-2-2"/></svg></a>` : ""}`;
}
function viewerThumbnailsMarkup(tile) {
  if (!["image", "video"].includes(tile.type) || (tile.files?.length || 0) < 2) return "";
  return tile.files.map((src, i) => `<button class="viewer-thumb${i === state.viewerIndex ? " is-active" : ""}" type="button" data-viewer-index="${i}" aria-label="Show media ${i + 1}" aria-pressed="${i === state.viewerIndex}">${tile.type === "image" ? `<img src="${escapeHtml(src)}" alt="" draggable="false" />` : `<video src="${escapeHtml(src)}" muted preload="metadata"></video>`}</button>`).join("");
}
function resetViewerTransform() {
  state.viewerZoom = 1;
  state.viewerPanX = 0;
  state.viewerPanY = 0;
  applyViewerTransform();
}
function clampViewerPan() {
  const media = $(".viewer-zoom-target", els.viewerMedia);
  const stage = $(".viewer-stage", els.viewerMedia);
  if (!media || !stage || state.viewerZoom <= 1) {
    state.viewerPanX = 0;
    state.viewerPanY = 0;
    return;
  }
  const scaledWidth = media.offsetWidth * state.viewerZoom;
  const scaledHeight = media.offsetHeight * state.viewerZoom;
  const maxX = Math.max(0, (scaledWidth - stage.clientWidth) / 2);
  const maxY = Math.max(0, (scaledHeight - stage.clientHeight) / 2);
  state.viewerPanX = Math.max(-maxX, Math.min(maxX, state.viewerPanX));
  state.viewerPanY = Math.max(-maxY, Math.min(maxY, state.viewerPanY));
}
function applyViewerTransform() {
  const media = $(".viewer-zoom-target", els.viewerMedia);
  if (!media) return;
  clampViewerPan();
  media.style.transform = `translate3d(${state.viewerPanX}px, ${state.viewerPanY}px, 0) scale(${state.viewerZoom})`;
  els.viewerMedia.classList.toggle("is-zoomed", state.viewerZoom > 1);
}
function renderViewerSelection(tile) {
  els.viewerMedia.innerHTML = viewerMediaMarkup(tile);
  els.viewerActions.innerHTML = viewerActionsMarkup(tile);
  els.viewerThumbnails.innerHTML = viewerThumbnailsMarkup(tile);
  els.viewerThumbnails.hidden = !els.viewerThumbnails.innerHTML;
  els.viewerMedia.style.backgroundColor = tile.type === "text" && !tile.thumbnail ? tileColor(tile) : "";
  els.viewerMedia.classList.toggle("viewer-media--text-background", tile.type === "text" && !!tile.thumbnail);
  if (tile.type === "text" && tile.thumbnail) {
    const background = document.createElement("img");
    background.className = "viewer-text-background";
    background.src = tile.thumbnail;
    background.alt = "";
    els.viewerMedia.prepend(background);
  }
  els.viewerMeta.innerHTML = `<div class="eyebrow">${escapeHtml(tile.type)}</div><h2>${escapeHtml(tile.label || defaultTileLabel(tile))}</h2>${tile.description ? `<p>${escapeHtml(tile.description)}</p>` : ""}${tile.tags?.length ? `<div class="viewer-tags">${tile.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}${tile.metadataTags?.length ? `<div class="viewer-tags metadata-tags">${tile.metadataTags.map(t => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}${viewerPropertiesMarkup(tile)}${viewerFontLinkMarkup(tile)}`;
  resetViewerTransform();
  const media = $("img.viewer-zoom-target, video.viewer-zoom-target", els.viewerMedia);
  if (media) {
    const update = () => {
      const value = $("[data-dimensions]", els.viewerMeta);
      const w = media.naturalWidth || media.videoWidth, h = media.naturalHeight || media.videoHeight;
      if (value && w && h) value.textContent = `${w} × ${h} px`;
    };
    media.addEventListener(media.tagName === "VIDEO" ? "loadedmetadata" : "load", update);
    update();
  }
}
function openViewer(tile) {
  state.viewerTileId = tile.id;
  state.viewerIndex = 0;
  const editButton = $("#viewerEditButton");
  if (editButton) editButton.dataset.editTile = tile.id;
  renderViewerSelection(tile);
  els.mediaViewer.showModal();
}
function activateTile(tileId) {
  const tile = state.tiles.find((t) => t.id === tileId);
  if (!tile) return;
  if (tile.type === "link" && tile.url) {
    window.open(tile.url, "_blank", "noopener,noreferrer");
    return;
  }
  if (MEDIA_TYPES.has(tile.type)) openViewer(tile);
}

function handleModalImages(images) {
  if (!images.length) return;
  if (
    state.pendingDrop.type === "text" ||
    ["video", "audio", "font", "file", "link"].includes(state.pendingDrop.type)
  ) {
    state.pendingDrop.backgroundColor = null;
    state.pendingThumbnail = images[0];
    refreshDynamicFields();
    return;
  }
  if (state.pendingDrop.type === "media")
    state.pendingDrop = { type: "image", files: [] };
  if (state.pendingDrop.type === "image") {
    state.pendingDrop.files.push(...images);
    refreshDynamicFields();
  }
}
function handleModalFiles(files) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (["text", "link"].includes(state.pendingDrop.type)) {
    if (images[0]) {
      state.pendingDrop.backgroundColor = null;
    state.pendingThumbnail = images[0];
      refreshDynamicFields();
    }
    return;
  }
  if (state.pendingDrop.type === "image") {
    if (images.length) {
      state.pendingDrop.files.push(...images);
      refreshDynamicFields();
    } else toast("Only images can be added to this gallery", "error");
    return;
  }
  if (state.pendingDrop.type === "media") {
    const detected = detectFiles(files);
    if (detected) {
      state.pendingDrop = detected;
      refreshDynamicFields();
    }
    return;
  }
  if (images.length) {
    state.pendingDrop.backgroundColor = null;
    state.pendingThumbnail = images[0];
    refreshDynamicFields();
    return;
  }
  const matching = files.filter(
    (f) => detectFileType(f) === state.pendingDrop.type,
  );
  if (matching.length) {
    state.pendingDrop.files.push(...matching);
    refreshDynamicFields();
  } else toast("Choose a file matching this content type", "error");
}

function folderAtPoint(x, y) {
  const el = document
    .elementFromPoint(x, y)
    ?.closest?.("[data-collection-drop],.collection-folder");
  if (!el) return null;
  return el.dataset.collectionDrop || el.dataset.collectionId || null;
}
async function addTileToCollection(tileId, collectionId) {
  const target = state.collections.find((c) => c.id === collectionId);
  if (!target) return;
  target.items ||= [];
  if (!target.items.includes(tileId)) target.items.push(tileId);
  target.collapsed = false;
  renderBookmarks();
  await persistCollections();
  toast(`Added to ${target.name}`);
}
function clearCollectionHighlights() {
  $$(".collection-folder").forEach((el) =>
    el.classList.remove("is-tile-hover"),
  );
}
function setupTileDrag() {
  let drag = null;
  let suppressClick = false;
  let clickResetTimer;
  const DETACH = 8;
  const cleanup = () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    clearCollectionHighlights();
    current.ghost?.remove();
    current.source.classList.remove("is-source-dragging", "is-detach-jiggle");
    document.body.classList.remove("is-tile-dragging");
    if (current.source.hasPointerCapture?.(current.pointerId))
      current.source.releasePointerCapture(current.pointerId);
  };
  const resetClickSoon = () => {
    clearTimeout(clickResetTimer);
    // The pointerup click follows synchronously; don't swallow the next real click.
    clickResetTimer = setTimeout(() => {
      suppressClick = false;
    }, 0);
  };
  document.addEventListener("pointerdown", (e) => {
    const source = e.target.closest?.("[data-tile-id]");
    if (
      state.section !== "dashboard" ||
      drag ||
      !source ||
      e.button !== 0 ||
      e.isPrimary === false ||
      e.target.closest("button,a,input,textarea,select")
    )
      return;
    clearTimeout(clickResetTimer);
    suppressClick = false;
    const rect = source.getBoundingClientRect();
    drag = {
      source,
      id: source.dataset.tileId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      detached: false,
      hoverId: null,
    };
    source.setPointerCapture?.(e.pointerId);
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.detached) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DETACH)
        return;
      drag.detached = true;
      document.body.classList.add("is-tile-dragging");
      suppressClick = true;
      const ghost = drag.source.cloneNode(true);
      ghost.classList.add("tile-ghost");
      ghost.removeAttribute("data-tile-id");
      ghost.removeAttribute("tabindex");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.querySelector(".tile-actions")?.remove();
      Object.assign(ghost.style, {
        position: "fixed",
        left: "0",
        top: "0",
        width: "80px",
        height: "80px",
        margin: "0",
        zIndex: "220",
        pointerEvents: "none",
        // Position before insertion: never paint a frame at the viewport origin.
        transform: `translate3d(${e.clientX}px,${e.clientY}px,0)`,
      });
      drag.ghost = ghost;
      document.body.appendChild(ghost);
      ghost.animate(
        [
          {
            width: `${drag.w}px`,
            height: `${drag.h}px`,
            left: `${-drag.offsetX}px`,
            top: `${-drag.offsetY}px`,
          },
          { width: "80px", height: "80px", left: "-40px", top: "-40px" },
        ],
        {
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 220,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "forwards",
        },
      );
      drag.source.classList.add("is-source-dragging", "is-detach-jiggle");
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    const cid = folderAtPoint(e.clientX, e.clientY);
    if (cid !== drag.hoverId) {
      clearCollectionHighlights();
      if (cid)
        document
          .querySelector(`[data-collection-id="${CSS.escape(cid)}"]`)
          ?.classList.add("is-tile-hover");
      drag.hoverId = cid;
    }
  });
  document.addEventListener("pointerup", async (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const id = drag.id;
    const cid = drag.detached ? folderAtPoint(e.clientX, e.clientY) : null;
    cleanup();
    resetClickSoon();
    if (cid) {
      try {
        await addTileToCollection(id, cid);
      } catch (error) {
        toast(error.message || "Could not save collection", "error");
      }
    }
  });
  const cancel = (e) => {
    if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId))
      return;
    cleanup();
    resetClickSoon();
  };
  document.addEventListener("pointercancel", cancel);
  document.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", cancel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel(e);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel({});
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!suppressClick || e.detail === 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClick = false;
    },
    true,
  );
}
function setActiveCollection(collectionId) {
  state.activeCollectionId = collectionId || null;
  renderBookmarks();
  renderTiles();
}
function showCollectionDeleteConfirm(collectionId) {
  const collection = state.collections.find((c) => c.id === collectionId);
  if (!collection) return;
  state.pendingCollectionDeleteId = collectionId;
  $("h2", els.deleteCollectionModal).textContent = `Delete ${collection.name}?`;
  els.deleteCollectionModal.showModal();
}
async function deletePendingCollection() {
  const id = state.pendingCollectionDeleteId;
  if (!id) return;
  const next = state.collections.filter((c) => c.id !== id);
  els.confirmDeleteCollection.disabled = true;
  try {
    await api.saveCollections(next);
    state.collections = next;
    if (state.activeCollectionId === id) state.activeCollectionId = null;
    state.pendingCollectionDeleteId = null;
    els.deleteCollectionModal.close();
    renderBookmarks();
    renderTiles();
    toast("Collection deleted");
  } catch (error) {
    toast(error.message || "Could not delete collection", "error");
  } finally {
    els.confirmDeleteCollection.disabled = false;
  }
}

function setupDragAndDrop() {
  let dragDepth = 0;
  let nativeInternalDrag = false;
  let draggedCollectionId = null;
  const isInternalDrag = (e) =>
    state.section !== "dashboard" ||
    $("#submissionModal").open ||
    nativeInternalDrag ||
    document.body.classList.contains("is-tile-dragging") ||
    [...(e.dataTransfer?.types || [])].some(
      (type) =>
        type === "application/x-comma-collection" ||
        type === "application/x-comma-collection-item",
    );
  const hideImportOverlay = () => {
    dragDepth = 0;
    els.dragOverlay.classList.remove("is-visible");
  };
  // Capture native image/link/selection drags before any import listeners run.
  document.addEventListener(
    "dragstart",
    (e) => {
      hideImportOverlay();
      if (e.target.closest?.("[data-tile-id],.tile-ghost")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      nativeInternalDrag = true;
    },
    true,
  );
  window.addEventListener("dragend", () => {
    nativeInternalDrag = false;
    hideImportOverlay();
  });
  window.addEventListener("blur", () => {
    nativeInternalDrag = false;
    hideImportOverlay();
  });
  // Keep internal drags out of modal import handlers as well as the page overlay.
  for (const type of ["dragenter", "dragover", "drop"]) {
    window.addEventListener(
      type,
      (e) => {
        if (!isInternalDrag(e)) return;
        e.preventDefault();
        hideImportOverlay();
        const collectionToGrid = draggedCollectionId && els.contentColumn.contains(e.target);
        if (!els.bookmarks.contains(e.target) && !collectionToGrid) e.stopPropagation();
      },
      true,
    );
  }
  window.addEventListener("dragenter", (e) => {
    if (
      isInternalDrag(e) ||
      els.contentModal.open ||
      els.topLinkModal.open ||
      $(".collection-folder.is-dragging") ||
      $(".bookmark-item.is-dragging")
    )
      return;
    e.preventDefault();
    dragDepth++;
    els.dragOverlay.classList.add("is-visible");
  });
  window.addEventListener("dragover", (e) => {
    if (
      isInternalDrag(e) ||
      els.contentModal.open ||
      els.topLinkModal.open ||
      $(".collection-folder.is-dragging") ||
      $(".bookmark-item.is-dragging")
    )
      return;
    e.preventDefault();
  });
  window.addEventListener("dragleave", () => {
    dragDepth--;
    if (dragDepth <= 0) {
      dragDepth = 0;
      els.dragOverlay.classList.remove("is-visible");
    }
  });
  window.addEventListener("drop", (e) => {
    if (
      isInternalDrag(e) ||
      els.contentModal.open ||
      els.topLinkModal.open ||
      $(".collection-folder.is-dragging") ||
      $(".bookmark-item.is-dragging")
    )
      return;
    e.preventDefault();
    dragDepth = 0;
    els.dragOverlay.classList.remove("is-visible");
    const pending = detectDrop(e.dataTransfer);
    pending
      ? openContentModal(pending)
      : toast("That drop type is not supported", "error");
  });
  document.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".bookmark-item");
    const folder = e.target.closest(".collection-folder");
    if (item) {
      e.stopPropagation();
      item.classList.add("is-dragging");
      e.dataTransfer.setData(
        "application/x-comma-collection-item",
        JSON.stringify({
          tileId: item.dataset.bookmarkId,
          collectionId: item.dataset.collectionId,
        }),
      );
    } else if (folder) {
      draggedCollectionId = folder.dataset.collectionId;
      folder.classList.add("is-dragging");
      e.dataTransfer.setData(
        "application/x-comma-collection",
        folder.dataset.collectionId,
      );
    }
  });
  document.addEventListener("dragend", (e) => {
    draggedCollectionId = null;
    els.collectionGridDropOverlay.classList.remove("is-visible");
    e.target.closest(".is-dragging")?.classList.remove("is-dragging");
    $$(".drop-before,.drop-after").forEach((x) =>
      x.classList.remove("drop-before", "drop-after"),
    );
    clearCollectionHighlights();
  });
  els.contentColumn.addEventListener("dragenter", (e) => {
    if (!draggedCollectionId) return;
    e.preventDefault();
    els.collectionGridDropOverlay.classList.add("is-visible");
  });
  els.contentColumn.addEventListener("dragover", (e) => {
    if (!draggedCollectionId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    els.collectionGridDropOverlay.classList.add("is-visible");
  });
  els.contentColumn.addEventListener("dragleave", (e) => {
    if (!draggedCollectionId || els.contentColumn.contains(e.relatedTarget)) return;
    els.collectionGridDropOverlay.classList.remove("is-visible");
  });
  els.contentColumn.addEventListener("drop", (e) => {
    if (!draggedCollectionId) return;
    e.preventDefault();
    e.stopPropagation();
    const id = draggedCollectionId;
    draggedCollectionId = null;
    els.collectionGridDropOverlay.classList.remove("is-visible");
    setActiveCollection(id);
  });

  els.bookmarks.addEventListener("dragover", (e) => {
    const folderId = e.dataTransfer.getData("application/x-comma-collection");
    const itemRaw = e.dataTransfer.getData(
      "application/x-comma-collection-item",
    );
    if (!folderId && !itemRaw) return;
    e.preventDefault();
    e.stopPropagation();
    const folder = e.target.closest(".collection-folder");
    const item = e.target.closest(".bookmark-item");
    $$(".drop-before,.drop-after").forEach((x) =>
      x.classList.remove("drop-before", "drop-after"),
    );
    if (folderId && folder && folder.dataset.collectionId !== folderId) {
      const r = folder.getBoundingClientRect();
      folder.classList.add(
        e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after",
      );
    } else if (itemRaw && item) {
      const data = JSON.parse(itemRaw);
      if (item.dataset.bookmarkId !== data.tileId) {
        const r = item.getBoundingClientRect();
        item.classList.add(
          e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-after",
        );
      }
    }
    folder?.classList.add("is-tile-hover");
  });
  els.bookmarks.addEventListener("dragleave", (e) => {
    if (!els.bookmarks.contains(e.relatedTarget)) clearCollectionHighlights();
  });
  els.bookmarks.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearCollectionHighlights();
    const folderId = e.dataTransfer.getData("application/x-comma-collection");
    const itemRaw = e.dataTransfer.getData(
      "application/x-comma-collection-item",
    );
    const targetFolder = e.target.closest(".collection-folder");
    const targetItem = e.target.closest(".bookmark-item");
    if (folderId) {
      const from = state.collections.findIndex((c) => c.id === folderId);
      if (from < 0) return;
      const [moved] = state.collections.splice(from, 1);
      let to = targetFolder
        ? state.collections.findIndex(
            (c) => c.id === targetFolder.dataset.collectionId,
          )
        : state.collections.length;
      if (targetFolder?.classList.contains("drop-after")) to++;
      state.collections.splice(Math.max(0, to), 0, moved);
      renderBookmarks();
      await persistCollections();
      return;
    }
    if (itemRaw) {
      const data = JSON.parse(itemRaw);
      const source = state.collections.find((c) => c.id === data.collectionId);
      const target = state.collections.find(
        (c) =>
          c.id ===
          (targetFolder?.dataset.collectionId ||
            targetItem?.dataset.collectionId),
      );
      if (!source || !target) return;
      if (targetItem?.dataset.bookmarkId === data.tileId) return;
      target.items = target.items.filter((id) => id !== data.tileId);
      let to = targetItem
        ? target.items.indexOf(targetItem.dataset.bookmarkId)
        : target.items.length;
      if (targetItem?.classList.contains("drop-after")) to++;
      target.items.splice(Math.max(0, to), 0, data.tileId);
      target.collapsed = false;
      renderBookmarks();
      await persistCollections();
    }
  });
  setupTileDrag();
}

function bindEvents() {
  $("#deleteContentButton").addEventListener("click", deleteEditingContent);
  els.collectionFilterClear.addEventListener("click", () => setActiveCollection(null));
  els.confirmDeleteCollection.addEventListener("click", deletePendingCollection);
  els.deleteCollectionModal.addEventListener("close", () => { state.pendingCollectionDeleteId = null; });
  $("#downloadContentButton").addEventListener("click", downloadContent);
  els.topLinkModal.addEventListener("close", () => setTopLinkImage());
  els.topLinkModal.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  els.topLinkModal.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = [...e.dataTransfer.files].find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) setTopLinkImage(file);
  });
  els.topLinkModal.addEventListener("paste", (e) => {
    const file = [...e.clipboardData.files].find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) {
      e.preventDefault();
      setTopLinkImage(file);
    }
  });

  document.addEventListener("click", async (e) => {
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      state.tag = tag.dataset.tag;
      renderTags();
      renderTiles();
      return;
    }
    const themeChoice = e.target.closest("[data-theme-choice]");
    if (themeChoice) {
      state.settings.theme = themeChoice.dataset.themeChoice;
      applyTheme();
      try {
        saveLocalTheme();
      } catch (err) {
        toast(err.message, "error");
      }
      return;
    }
    const nav = e.target.closest("[data-section]");
    if (nav?.classList.contains("nav-tab")) {
      setSection(nav.dataset.section);
      return;
    }
    const deleteTopLink = e.target.closest("[data-delete-top-link]");
    if (deleteTopLink) {
      e.preventDefault();
      if (deleteTopLink.disabled) return;
      deleteTopLink.disabled = true;
      try {
        const id = deleteTopLink.dataset.deleteTopLink;
        await api.deleteTopLink(id);
        state.topLinks = state.topLinks.filter((link) => link.id !== id);
        renderTopLinks();
        toast("Top link deleted");
      } catch (err) {
        deleteTopLink.disabled = false;
        toast(err.message, "error");
      }
      return;
    }
    const editTopLink = e.target.closest("[data-edit-top-link]");
    if (editTopLink || e.target.closest("#addTopLink")) {
      const link = editTopLink
        ? state.topLinks.find(
            (link) => link.id === editTopLink.dataset.editTopLink,
          )
        : null;
      if (editTopLink && !link) return;
      state.editingTopLinkId = link?.id || null;
      els.topLinkForm.reset();
      els.topLinkForm.elements.label.value = link?.label || "";
      els.topLinkForm.elements.url.value = link?.url || "";
      $("h2", els.topLinkModal).textContent = link
        ? "Edit top link"
        : "Add top link";
      $('[type="submit"]', els.topLinkForm).textContent = link
        ? "Save changes"
        : "Add link";
      setTopLinkImage(link?.image || null);
      els.topLinkModal.showModal();
      return;
    }
    if (e.target.closest("#collectionAddButton")) {
      els.collectionForm.reset();
      els.collectionModal.showModal();
      return;
    }
    const deleteCollection = e.target.closest("[data-delete-collection]");
    if (deleteCollection) {
      e.preventDefault();
      e.stopPropagation();
      showCollectionDeleteConfirm(deleteCollection.dataset.deleteCollection);
      return;
    }
    const toggleCollection = e.target.closest("[data-toggle-collection]");
    if (toggleCollection && !e.target.closest(".bookmark-remove")) {
      const c = state.collections.find(
        (x) => x.id === toggleCollection.dataset.toggleCollection,
      );
      if (c) {
        c.collapsed = !c.collapsed;
        renderBookmarks();
        await persistCollections();
      }
      return;
    }
    const viewerThumb = e.target.closest("[data-viewer-index]");
    if (viewerThumb) {
      const tile = state.tiles.find((item) => item.id === state.viewerTileId);
      if (!tile) return;
      state.viewerIndex = Number(viewerThumb.dataset.viewerIndex) || 0;
      renderViewerSelection(tile);
      return;
    }
    const close = e.target.closest("[data-close]");
    if (close) {
      document.getElementById(close.dataset.close)?.close();
      return;
    }
    const preset = e.target.closest("[data-preset-tag]");
    if (preset) {
      const tag = preset.dataset.presetTag;
      if (state.pendingTags.some(t => t.toLowerCase() === tag.toLowerCase())) {
        state.pendingTags = state.pendingTags.filter(t => t.toLowerCase() !== tag.toLowerCase());
        renderTagEditor();
      } else addTag(tag);
      return;
    }
    const removeFormTag = e.target.closest("[data-remove-form-tag]");
    if (removeFormTag) {
      state.pendingTags = state.pendingTags.filter(
        (t) => t !== removeFormTag.dataset.removeFormTag,
      );
      renderTagEditor();
      return;
    }
    const color = e.target.closest("[data-tile-color]");
    if (color) {
      selectTileBackground(Number(color.dataset.tileColor));
      return;
    }
    const trigger = e.target.closest("[data-file-trigger]");
    if (trigger) {
      document.getElementById(trigger.dataset.fileTrigger)?.click();
      return;
    }
    const galleryAdd = e.target.closest("#galleryAdd");
    if (galleryAdd) {
      $("#galleryFileInput")?.click();
      return;
    }
    if (e.target.closest("#topLinkImageAdd")) {
      $("#topLinkImageInput")?.click();
      return;
    }
    if (e.target.closest("[data-remove-top-link-image]")) {
      setTopLinkImage();
      return;
    }
    if (e.target.closest("#thumbnailAdd")) {
      $("#thumbnailPickerInput")?.click();
      return;
    }
    if (e.target.closest("#chooseMediaButton")) {
      els.contentFilePicker.value = "";
      els.contentFilePicker.click();
      return;
    }
    const choice = e.target.closest("[data-content-choice]");
    if (choice) {
      els.contentTypeModal.close();
      if (choice.dataset.contentChoice === "media") {
        openContentModal({ type: "media", files: [] });
      } else if (choice.dataset.contentChoice === "link") {
        openContentModal({ type: "link", url: "" });
      } else {
        openContentModal({ type: "text", text: "" });
      }
      return;
    }
    const removePending = e.target.closest("[data-remove-pending-file]");
    if (removePending) {
      state.pendingDrop.files.splice(
        Number(removePending.dataset.removePendingFile),
        1,
      );
      refreshDynamicFields();
      return;
    }
    if (e.target.closest("[data-remove-thumbnail]")) {
      state.pendingThumbnail = null;
      refreshDynamicFields();
      return;
    }
    const removeBookmark = e.target.closest("[data-remove-bookmark]");
    if (removeBookmark) {
      const c = state.collections.find(
        (x) => x.id === removeBookmark.dataset.fromCollection,
      );
      if (c)
        c.items = c.items.filter(
          (id) => id !== removeBookmark.dataset.removeBookmark,
        );
      renderBookmarks();
      await persistCollections();
      return;
    }
    const editTile = e.target.closest("[data-edit-tile]");
    if (editTile) {
      e.preventDefault();
      e.stopPropagation();
      if (editTile.closest("#mediaViewer") && els.mediaViewer.open) els.mediaViewer.close();
      openEditModal(editTile.dataset.editTile);
      return;
    }
    const saved = e.target.closest("[data-bookmark-id]");
    if (saved) {
      activateTile(saved.dataset.bookmarkId);
      return;
    }
    const tile = e.target.closest("[data-tile-id]");
    if (tile) {
      activateTile(tile.dataset.tileId);
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest?.("#fontUploadButton")) {
      $("#fontFileInput")?.click();
      return;
    }
    const toggle = e.target.closest?.("[data-align-cycle]");
    if (!toggle) return;
    const input = els.contentForm.elements.align;
    if (!input) return;
    const next =
      ALIGN_ORDER[(ALIGN_ORDER.indexOf(input.value) + 1) % ALIGN_ORDER.length];
    input.value = next;
    updateTextPreview();
  });
  initScrubInputs();
  window.addEventListener("resize", () => { autosizeTextPreview(); if (els.mediaViewer.open) applyViewerTransform(); });
  document.addEventListener("keydown", (e) => {
    if (
      e.target === els.tagInput &&
      (e.key === "Enter" || e.key === "," || e.key === " ")
    ) {
      e.preventDefault();
      commitTagInput();
    } else if (
      e.target === els.tagInput &&
      e.key === "Tab" &&
      !e.shiftKey &&
      els.tagInput.value.trim()
    ) {
      // Only intercept Tab when there is a tag to complete; otherwise move focus normally.
      e.preventDefault();
      commitTagInput();
    }
    const tile = e.target.closest?.("[data-tile-id],[data-bookmark-id]");
    if (tile && e.target === tile && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      activateTile(tile.dataset.tileId || tile.dataset.bookmarkId);
    }
  });
  document.addEventListener("change", async (e) => {
    if (e.target?.id === "fontFileInput") {
      const input = e.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const button = $("#fontUploadButton");
      button?.setAttribute("disabled", "");
      try {
        const font = await api.uploadFont(file);
        state.fonts.push(font);
        registerFontFaces();
        refreshFontSelect(font.family);
        if (document.fonts?.load) await document.fonts.load(`16px '${font.name}'`).catch(() => {});
        updateTextPreview();
        toast(`Font "${font.name}" added`);
      } catch (error) {
        toast(error.message, "error");
      } finally {
        button?.removeAttribute("disabled");
      }
      return;
    }
    if (e.target?.id === "topLinkImageInput") {
      const file = e.target.files?.[0];
      if (file?.type.startsWith("image/")) setTopLinkImage(file);
      return;
    }
    if (e.target?.id === "galleryFileInput") {
      state.pendingDrop.files.push(
        ...[...e.target.files].filter((f) => state.pendingDrop.type === "file" || detectFileType(f) === state.pendingDrop.type),
      );
      refreshDynamicFields();
      return;
    }
    if (e.target?.id === "thumbnailPickerInput" && e.target.files?.[0]) {
      state.pendingDrop.backgroundColor = null;
      state.pendingThumbnail = e.target.files[0];
      refreshDynamicFields();
      return;
    }
    if (e.target?.id === "replacementFileInput" && e.target.files?.length) {
      state.pendingDrop.files = [...e.target.files];
      refreshDynamicFields();
      return;
    }
    if (e.target?.type === "file") {
      const label = document.querySelector(`[data-file-name="${e.target.id}"]`);
      if (label)
        label.textContent = e.target.files?.length
          ? [...e.target.files].map((f) => f.name).join(", ")
          : "No file selected";
    }
    if (state.pendingDrop?.type === "text" && e.target.closest("#contentForm"))
      updateTextPreview();
  });
  els.contentForm.addEventListener("input", (e) => {
    if (
      state.pendingDrop?.type === "text" &&
      e.target.matches('[name="text"],[name="fontSize"]')
    )
      updateTextPreview();
  });
  els.search.addEventListener("input", () => {
    state.query = els.search.value.trim();
    els.clearSearch.classList.toggle("is-visible", !!state.query);
    renderTiles();
  });
  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    state.query = "";
    els.clearSearch.classList.remove("is-visible");
    els.search.focus();
    renderTiles();
  });
  els.settingsButton.addEventListener("click", () =>
    els.settingsModal.showModal(),
  );
  els.modeToggle.addEventListener("change", async () => {
    state.settings.mode = els.modeToggle.checked ? "dark" : "light";
    applyTheme();
    try {
      saveLocalTheme();
    } catch (e) {
      toast(e.message, "error");
    }
  });
  if (ENABLE_CALENDAR_MODULE) {
    els.calendarUploadButton.addEventListener("click", () => els.calendarFileInput.click());
    els.calendarFileInput.addEventListener("change", async () => {
      const file = els.calendarFileInput.files?.[0];
      els.calendarFileInput.value = "";
      if (!file) return;
      els.calendarUploadButton.disabled = true;
      try {
        state.calendar = await api.uploadCalendar(file);
        renderCalendar();
        renderCalendarSettings();
        toast("Calendar uploaded");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        els.calendarUploadButton.disabled = false;
      }
    });
    els.calendarDeleteButton.addEventListener("click", async () => {
      els.calendarDeleteButton.disabled = true;
      try {
        state.calendar = await api.deleteCalendar();
        renderCalendar();
        renderCalendarSettings();
        toast("Calendar removed");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        els.calendarDeleteButton.disabled = false;
      }
    });
  }
  els.contentAddButton.addEventListener("click", () =>
    els.contentTypeModal.showModal(),
  );
  els.contentFilePicker.addEventListener("change", () => {
    const pending = detectFiles(els.contentFilePicker.files);
    if (!pending) return;
    if (els.contentModal.open && state.pendingDrop?.type === "media") {
      state.pendingDrop = pending;
      refreshDynamicFields();
    } else openContentModal(pending);
  });
  els.contentForm.addEventListener("submit", handleContentSubmit);
  els.topLinkForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const editingId = state.editingTopLinkId;
    if (!beginSubmission(editingId ? "Saving..." : "Adding...")) return;
    try {
      const form = new FormData(els.topLinkForm);
      form.set("url", normalizeUrl(form.get("url")));
      form.set(
        "existingImage",
        typeof state.pendingTopLinkImage === "string"
          ? state.pendingTopLinkImage
          : "",
      );
      if (
        state.pendingTopLinkImage &&
        typeof state.pendingTopLinkImage !== "string"
      )
        form.set("image", state.pendingTopLinkImage);
      if (editingId) form.set("id", editingId);
      const link = await (editingId
        ? api.updateTopLink(form)
        : api.createTopLink(form));
      if (editingId)
        state.topLinks = state.topLinks.map((item) =>
          item.id === editingId ? link : item,
        );
      else state.topLinks.push(link);
      renderTopLinks();
      els.topLinkModal.close();
      toast(editingId ? "Top link updated" : "Top link added");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      endSubmission();
    }
  });

  els.collectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = String(
      new FormData(els.collectionForm).get("name") || "",
    ).trim();
    if (!name) return;
    if (!beginSubmission()) return;
    try {
      const collections = [
        ...state.collections,
        {
          id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          collapsed: false,
          items: [],
        },
      ];
      await api.saveCollections(collections);
      state.collections = collections;
      renderBookmarks();
      els.collectionModal.close();
      toast("Collection created");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      endSubmission();
    }
  });
  [
    els.contentTypeModal,
    els.contentModal,
    els.topLinkModal,
    els.settingsModal,
    els.collectionModal,
    els.deleteCollectionModal,
    els.mediaViewer,
  ].forEach((dialog) =>
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    }),
  );
  els.contentModal.addEventListener("dragover", (e) => {
    if (!state.pendingDrop) return;
    e.preventDefault();
    e.stopPropagation();
    els.contentModal
      .querySelector(".modal-card")
      ?.classList.add("is-modal-drop-target");
  });
  els.contentModal.addEventListener("dragleave", (e) => {
    if (!els.contentModal.contains(e.relatedTarget))
      els.contentModal
        .querySelector(".modal-card")
        ?.classList.remove("is-modal-drop-target");
  });
  els.contentModal.addEventListener("drop", (e) => {
    if (!state.pendingDrop) return;
    e.preventDefault();
    e.stopPropagation();
    els.contentModal
      .querySelector(".modal-card")
      ?.classList.remove("is-modal-drop-target");
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    handleModalFiles(files);
  });
  document.addEventListener("paste", (e) => {
    if (
      !els.contentModal.open ||
      !state.pendingDrop ||
      !["media", "image", "video", "audio", "font", "file", "text"].includes(
        state.pendingDrop.type,
      )
    )
      return;
    const images = [...(e.clipboardData?.files || [])].filter((f) =>
      f.type.startsWith("image/"),
    );
    if (!images.length) return;
    e.preventDefault();
    handleModalImages(images);
  });
  els.viewerMedia.addEventListener("wheel", (e) => {
    const media = $(".viewer-zoom-target", els.viewerMedia);
    if (!media) return;
    e.preventDefault();
    const previous = state.viewerZoom;
    const next = Math.max(1, Math.min(3, previous + (e.deltaY < 0 ? 0.1 : -0.1)));
    if (next === 1) {
      state.viewerPanX = 0;
      state.viewerPanY = 0;
    }
    state.viewerZoom = Number(next.toFixed(2));
    applyViewerTransform();
  }, { passive: false });
  els.viewerMedia.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || state.viewerZoom <= 0 || !e.target.closest(".viewer-stage")) return;
    e.preventDefault();
    state.viewerPanning = true;
    const startX = e.clientX, startY = e.clientY;
    const baseX = state.viewerPanX, baseY = state.viewerPanY;
    const move = (event) => {
      if (!state.viewerPanning) return;
      state.viewerPanX = baseX + event.clientX - startX;
      state.viewerPanY = baseY + event.clientY - startY;
      applyViewerTransform();
    };
    const stop = () => {
      state.viewerPanning = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop, { once: true });
  });
  els.viewerMedia.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  els.mediaViewer.addEventListener("close", () => {
    state.viewerTileId = null;
    state.viewerIndex = 0;
    resetViewerTransform();
  });
  els.contentModal.addEventListener("close", () => {
    revokePreviewUrls();
    state.pendingTags = [];
    state.pendingThumbnail = null;
  });
}

function setupTooltips() {
  const tip = document.createElement("div");
  tip.id = "appTooltip";
  tip.className = "app-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.setAttribute("popover", "manual");
  tip.hidden = true;
  document.body.append(tip);
  let owner = null;
  function hide() {
    if (owner) {
      const ids = (owner.getAttribute("aria-describedby") || "")
        .split(" ")
        .filter((id) => id && id !== tip.id);
      if (ids.length) owner.setAttribute("aria-describedby", ids.join(" "));
      else owner.removeAttribute("aria-describedby");
    }
    if (tip.matches(":popover-open")) tip.hidePopover();
    tip.hidden = true;
    owner = null;
  }
  function show(target) {
    if (!target) return;
    hide();
    owner = target;
    tip.textContent = target.dataset.tooltip;
    if (target.dataset.tooltipDescription) {
      const description = document.createElement("span");
      description.className = "tooltip-description";
      description.textContent = target.dataset.tooltipDescription;
      tip.append(description);
    }
    if (target.dataset.tooltipUrl) {
      const url = document.createElement("span");
      url.className = "tooltip-url";
      url.textContent = target.dataset.tooltipUrl;
      tip.append(url);
    }
    target.setAttribute(
      "aria-describedby",
      `${target.getAttribute("aria-describedby") || ""} ${tip.id}`.trim(),
    );
    tip.hidden = false;
    if (tip.showPopover) tip.showPopover();
    else (target.closest("dialog[open]") || document.body).append(tip);
    const r = target.getBoundingClientRect(),
      t = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(innerWidth - t.width - 8, r.left + (r.width - t.width) / 2))}px`;
    tip.style.top = `${Math.max(8, r.bottom + t.height + 10 < innerHeight ? r.bottom + 8 : r.top - t.height - 8)}px`;
  }
  document.addEventListener("pointerover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target !== owner) show(target);
  });
  document.addEventListener("pointerout", (e) => {
    if (owner && !owner.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("focusin", (e) =>
    show(e.target.closest("[data-tooltip]")),
  );
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

async function init() {
  try {
    Object.assign(state, await api.bootstrap());
    state.fonts = Array.isArray(state.fonts) ? state.fonts : [];
    registerFontFaces();
    ensureCollections();
  } catch (error) {
    toast("Could not load PHP data. Serve this folder through PHP.", "error");
  }
  loadLocalTheme();
  updateToday();
  //setInterval(() => { updateToday(); renderCalendar(); }, 30000);
  let calendarResizeFrame = 0;
  window.addEventListener("resize", () => {
    if (!ENABLE_CALENDAR_MODULE || !state.calendar?.exists) return;
    cancelAnimationFrame(calendarResizeFrame);
    calendarResizeFrame = requestAnimationFrame(renderCalendar);
  });
  applyTheme();
  renderAll();
  bindEvents();
  setupDragAndDrop();
  setupTooltips();
}
init();

// Horizontal calendar panning, with a movement threshold to preserve clicks.
(() => {
  const ranges = els.calendarRanges;
  let pan = null;
  ranges.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button,a,input")) return;
    pan = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: ranges.scrollLeft, moved: false };
  });
  ranges.addEventListener("pointermove", event => {
    if (!pan || event.pointerId !== pan.id) return;
    const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
    if (!pan.moved) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) { pan = null; return; }
      if (Math.abs(dx) < 5) return;
      pan.moved = true;
      ranges.setPointerCapture(event.pointerId);
      ranges.classList.add("is-panning");
    }
    event.preventDefault();
    ranges.scrollLeft = pan.scroll - dx;
  });
  const end = event => {
    if (!pan || event.pointerId !== pan.id) return;
    pan = null;
    ranges.classList.remove("is-panning");
    if (ranges.hasPointerCapture(event.pointerId)) ranges.releasePointerCapture(event.pointerId);
  };
  ranges.addEventListener("pointerup", end);
  ranges.addEventListener("pointercancel", end);
  ranges.addEventListener("lostpointercapture", end);
  ranges.addEventListener("pointerleave", event => { if (pan && !pan.moved) end(event); });
})();
