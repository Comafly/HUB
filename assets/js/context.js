export const IMAGE_LIMIT = 2 * 1024 * 1024;

export const encode = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Unable to convert image to JPG.")),
      "image/jpeg",
      quality,
    ),
  );

export const ENABLE_CALENDAR_MODULE = true;

export const MEDIA_TYPES = new Set([
  "image",
  "video",
  "audio",
  "text",
  "file",
  "font",
]);

export const state = {
  tiles: [],
  urlBackgrounds: [],
  topLinks: [],
  bookmarks: [],
  collections: [],
  collectionsInitialized: false,
  settings: {
    theme: "umber",
    mode: "dark",
    alwaysShowTileDetails: false,
    gridLayout: "asymmetric",
  },
  calendar: { exists: false, fileName: "", updatedAt: null, content: "" },
  editingId: null,
  editingTopLinkId: null,
  savingContent: false,
  section: "dashboard",
  tabs: [],
  tag: "All",
  genreFilters: [],
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

export const $ = (selector, root = document) => root.querySelector(selector);

export const $$ = (selector, root = document) => [
  ...root.querySelectorAll(selector),
];

export const els = {
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
  tileDetailsToggle: $("#tileDetailsToggle"),
  gridLayoutToggle: $("#gridLayoutToggle"),
  modeLabel: $("#modeLabel"),
  dragOverlay: $("#dragOverlay"),
  emptyState: $("#emptyState"),
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

export const TILE_COLOR_GROUPS = [
  { label: "Complementary", indices: [1, 5, 6] },
  { label: "Analogous", indices: [3, 0, 4] },
  { label: "Triadic", indices: [2, 7] },
  { label: "Neutral", indices: [8] },
];

export const TILE_COLOR_COUNT = 9;

export const GLOBE_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg>';

export const THEME_KEY = "comma-hub-appearance";

export const BUILTIN_FONT_OPTIONS = `<option value="Arial, sans-serif">Arial</option><option value="Helvetica, Arial, sans-serif">Helvetica</option><option value="Georgia, serif">Georgia</option><option value="'Times New Roman', serif">Times New Roman</option><option value="Verdana, sans-serif">Verdana</option><option value="Tahoma, sans-serif">Tahoma</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option><option value="'Courier New', monospace">Courier New</option><option value="Impact, sans-serif">Impact</option><option value="system-ui, sans-serif">System UI</option>`;

export const FONT_UPLOAD_ICON =
  '<svg viewBox="0 0 24 20" width="22" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h8M3 3v13M3 9.5h6"/><path d="M18 17V6M14.5 9.5 18 6l3.5 3.5"/></svg>';

export const ALIGN_ORDER = ["left", "center", "right"];

export const ALIGN_ICONS = {
  left: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h9M3 15h12"/></svg>',
  center:
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M5.5 10h9M4 15h12"/></svg>',
  right:
    '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M8 10h9M5 15h12"/></svg>',
};

export function escapeHtml(value = "") {
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

export function favicon(url) {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=128`;
  } catch {
    return "";
  }
}

export function normalizeUrl(value = "") {
  const raw = String(value).trim();
  if (!raw) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

export function safeHostname(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url || "";
  }
}

export function defaultTileLabel(tile) {
  if (tile.type === "link") return safeHostname(tile.url);
  if (tile.type === "text") return "Text note";
  if (tile.files?.length) return tile.files[0].split("/").pop();
  return "Untitled";
}

export function displayText(tile) {
  // Migrate only the shipped samples; literal escapes in user notes stay literal.
  const text = String(tile.text || "");
  const samples = {
    "seed-2": "COLLECT\\nFIRST.\\nCURATE\\nSECOND.",
    "seed-5": "Aa\\nTYPE\\nINDEX",
  };
  return samples[tile.id] === text ? text.replace(/\\n/g, "\n") : text;
}

export function tileColor(tile) {
  const choice = Number.isInteger(tile.backgroundColor)
    ? tile.backgroundColor
    : [...String(tile.id || "")].reduce(
        (sum, char) => sum + char.charCodeAt(0),
        0,
      ) % TILE_COLOR_COUNT;
  return `var(--tile-color-${Math.max(0, Math.min(TILE_COLOR_COUNT - 1, choice))})`;
}
