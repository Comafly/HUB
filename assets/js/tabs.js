import { isInstagramLink } from "./link-metadata.js?v=20261006-inline-links-steppers";
import { state, els, $, $$, escapeHtml } from "./context.js?v=20261006-inline-links-steppers";

// Keep all view icons at the original 24 px size.
const VIEW_ICON_PATHS = {
  equal:
    "M2 2h5v5H2zm7 0h5v5H9zm7 0h5v5h-5zM2 9h5v5H2zm7 0h5v5H9zm7 0h5v5h-5zM2 16h5v5H2zm7 0h5v5H9zm7 0h5v5h-5z",
  asymmetric: "M2 2h8v12H2zm10 0h10v6H12zm0 8h10v12H12zM2 16h8v6H2z",
  list: "M2 3h3v3H2zm5 0h15v3H7zM2 10h3v3H2zm5 0h15v3H7zM2 17h3v3H2zm5 0h15v3H7z",
};

/** One tab definition controls navigation, filtering, forms, and available views. */
export class TabController {
  constructor(services) {
    this.services = services;
  }

  load(definitions) {
    if (!Array.isArray(definitions) || !definitions.length)
      throw new Error("No tabs are configured. Check config/tabs.json.");
    this.definitions = definitions;
    $(".main-nav").innerHTML = definitions
      .map(
        (tab) =>
          `<button type="button" class="nav-tab" data-section="${escapeHtml(tab.id)}">${escapeHtml(tab.title)}</button>`,
      )
      .join("");
  }

  get current() {
    return (
      this.definitions?.find((tab) => tab.id === state.section) ||
      this.definitions?.[0] ||
      {}
    );
  }
  get items() {
    return state.tiles.filter(
      (tile) => (tile.section || "dashboard") === state.section,
    );
  }
  get collections() {
    return state.collections.filter(
      (collection) => (collection.section || "dashboard") === state.section,
    );
  }
  get view() {
    const preferred =
      state.settings.tabViews?.[state.section] || state.settings.gridLayout;
    return this.current.views?.includes(preferred)
      ? preferred
      : this.current.views?.[0] || "asymmetric";
  }

  select(id) {
    if (!this.definitions?.some((tab) => tab.id === id))
      id = this.definitions?.[0]?.id;
    if (!id) return;
    state.section = id;
    state.activeHistoryMonth = null;
    state.page = 1;
    state.tag = "All";
    state.genreFilters = [];
    state.query = "";
    state.activeCollectionId = null;
    els.search.value = "";
    els.clearSearch.classList.remove("is-visible");
    els.search.placeholder = `Search ${this.current.title}`;
    els.search.setAttribute("aria-label", `Search ${this.current.title}`);
    $(".tags-panel").setAttribute(
      "aria-label",
      `${this.current.title} filters`,
    );
    els.bookmarksPanel.hidden = this.current.collections === false;
    $(".workspace").classList.toggle(
      "workspace--without-collections",
      this.current.collections === false,
    );
    $$("[data-section]").forEach((button) => {
      const active = button.dataset.section === id;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    this.services.application.renderAll();
    this.applyView();
    document.dispatchEvent(
      new CustomEvent("hub:tab-change", { detail: { tab: this.current } }),
    );
  }

  matches(tile) {
    if ((tile.section || "dashboard") !== state.section) return false;
    if (!state.activeCollectionId && (tile.historyMonth || null) !== state.activeHistoryMonth) return false;
    const values = this.current.filterField
      ? [tile[this.current.filterField]]
      : [...(tile.tags || []), ...(tile.metadataTags || [])];
    if (
      state.tag !== "All" &&
      !values.some(
        (value) =>
          String(value || "").toLowerCase() === state.tag.toLowerCase(),
      )
    )
      return false;
    if (
      this.current.form === "watchlist" &&
      !this.services.watchlist.matchesGenres(tile)
    )
      return false;
    if (
      state.activeCollectionId &&
      !this.collections
        .find((collection) => collection.id === state.activeCollectionId)
        ?.items.includes(tile.id)
    )
      return false;
    const haystack = [
      tile.label,
      tile.description,
      tile.location,
      tile.text,
      tile.url,
      ...(tile.tags || []),
      ...(tile.metadataTags || []),
      ...(this.current.fields || []).map((field) => tile[field.name]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return !state.query || haystack.includes(state.query.toLowerCase());
  }

  cycleView() {
    const views = this.current.views || ["asymmetric", "equal"];
    state.settings.tabViews ||= {};
    state.settings.tabViews[state.section] =
      views[(views.indexOf(this.view) + 1) % views.length];
    this.services.application.saveLocalTheme();
    this.applyView();
    this.services.board.renderTiles();
  }

  applyView() {
    const views = this.current.views || ["asymmetric", "equal"];
    const next = views[(views.indexOf(this.view) + 1) % views.length];
    const labels = {
      asymmetric: "asymmetrical grid",
      equal: "equal grid",
      list: "list view",
    };
    els.tileGrid.classList.toggle(
      "tile-grid--watchlist",
      this.current.form === "watchlist",
    );
    els.tileGrid.classList.toggle("tile-grid--equal", this.view === "equal");
    els.tileGrid.classList.toggle("tile-grid--list", this.view === "list");
    els.tileGrid.setAttribute(
      "aria-label",
      `${this.current.title || "Content"}: ${labels[this.view]}`,
    );
    const button = els.gridLayoutToggle;
    button.innerHTML = [this.view, next]
      .map(
        (view, i) =>
          `<svg class="grid-view-icon grid-view-icon--${i ? "next" : "current"}" data-view="${view}" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="${VIEW_ICON_PATHS[view]}"/></svg>`,
      )
      .join("");
    button.hidden = views.length < 2;
    button.removeAttribute("aria-pressed");
    button.setAttribute(
      "aria-label",
      `Current: ${labels[this.view]}. Switch to ${labels[next]}`,
    );
    button.dataset.tooltip = `Switch to ${labels[next]}`;
    this.services.board.layoutTiles();
  }

  renderList(items) {
    const watchlist = this.current.form === "watchlist";
    const dateValue = (tile) =>
      watchlist
        ? tile.releaseDate || ""
        : tile.dateAdded || tile.createdAt || "";
    const date = (tile) => {
      const value = dateValue(tile);
      // Date-only releases use local noon to retain their calendar day in any timezone.
      const parsed = new Date(watchlist && value ? `${value}T12:00:00` : value);
      if (!value || Number.isNaN(parsed.getTime())) return "—";
      return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(parsed);
    };
    els.tileGrid.innerHTML = items
      .map((tile) => {
        if (tile.pending) return this.services.board.pendingTileMarkup(tile);
        const tags =
          watchlist && tile.tags?.length
            ? `<div class="viewer-tags watchlist-row-tags">${tile.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
            : "";
        const edit = `<button class="tile-action${watchlist ? " watchlist-row-edit" : ""}" data-edit-tile="${escapeHtml(tile.id)}" aria-label="Edit ${escapeHtml(tile.label || "content")}" data-tooltip="Edit content">✎</button>`;
        return `<article class="watchlist-row${isInstagramLink(tile) ? " watchlist-row--instagram" : ""}${watchlist ? " watchlist-row--media" : ""}" data-tile-id="${escapeHtml(tile.id)}" tabindex="0" aria-label="${escapeHtml(tile.label || "Untitled")}">${watchlist ? `<div class="watchlist-row-poster">${this.services.board.tileMedia(tile)}</div>` : ""}<div class="watchlist-row-name">${watchlist ? "" : '<span class="list-field-label">Name</span>'}<strong>${escapeHtml(tile.label || "Untitled")}</strong>${tags}</div><div class="watchlist-row-description"><span class="list-field-label">Description</span><p>${escapeHtml(tile.description || "—")}</p></div><div class="list-row-type"><span class="list-field-label">Media type</span><span>${escapeHtml(tile.mediaType || tile.type)}</span></div><div class="list-row-date"><span class="list-field-label">${watchlist ? "Release date" : "Date added"}</span><time datetime="${escapeHtml(dateValue(tile))}">${escapeHtml(date(tile))}</time></div><div class="watchlist-row-actions">${watchlist ? this.services.watchlist.watchedButton(tile) : edit}</div>${watchlist ? edit : ""}</article>`;
      })
      .join("");
    els.emptyState.hidden = items.length > 0;
  }

  fieldsMarkup(pending) {
    return (this.current.fields || [])
      .map((field) => {
        const value = pending[field.name] ?? field.default ?? "";
        const attrs = `name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}`;
        let input;
        if (field.type === "select")
          input = `<select ${attrs}>${(field.options || []).map((option) => `<option value="${escapeHtml(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
        else if (field.type === "checkbox")
          input = `<input ${attrs} type="checkbox" ${value === true ? "checked" : ""}>`;
        else if (field.type === "textarea")
          input = `<textarea ${attrs} rows="3">${escapeHtml(value)}</textarea>`;
        else
          input = `<input ${attrs} type="${field.type === "date" ? "date" : "text"}" value="${escapeHtml(value)}">`;
        return `<label class="field"><span>${escapeHtml(field.label)}</span>${input}</label>`;
      })
      .join("");
  }

  fillFields(tile) {
    for (const field of this.current.fields || []) {
      const input = els.contentForm.elements[field.name];
      if (!input) continue;
      if (field.type === "checkbox") input.checked = tile[field.name] === true;
      else input.value = tile[field.name] ?? field.default ?? input.value;
    }
  }
}
