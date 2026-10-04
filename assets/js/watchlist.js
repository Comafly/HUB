import { Feature } from "./feature.js";
import { state, els, $, $$, escapeHtml } from "./context.js";
import { api } from "./api.js";

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const EYE = icon(
  '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
);
const SEARCH = icon(
  '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
);
const DOWNLOAD = icon(
  '<path d="M7 17H5a4 4 0 0 1-.4-8A6 6 0 0 1 16 6a4 4 0 0 1 3 7.8M12 10v11m-4-4 4 4 4-4"/>',
);
const MEDIA = [
  [
    "Movies",
    "Movie",
    icon(
      '<path d="M3 9h18v12H3zM3 9l-1-5 18-3 1 5-18 3m2-6 3 4m3-5 3 4m3-5 3 4"/>',
    ),
  ],
  [
    "Series",
    "Series",
    icon(
      '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="m7 2 5 5 5-5"/>',
    ),
  ],
  [
    "Music",
    "Music",
    icon(
      '<path d="M9 17V5l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="15" rx="3" ry="3"/>',
    ),
  ],
  [
    "Games",
    "Game",
    icon(
      '<path d="M7 6h10c3 0 4 4 5 10s-2 6-5 2l-2-2H9l-2 2c-3 4-6 4-5-2S4 6 7 6Z M7 9v6m-3-3h6"/><circle cx="17" cy="10" r=".7"/><circle cx="19" cy="13" r=".7"/>',
    ),
  ],
  [
    "Books",
    "Book",
    icon(
      '<path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z"/>',
    ),
  ],
  [
    "Manga",
    "Manga",
    icon(
      '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M7 5h4v6H7zm7 0h3v9h-3zM7 14h4v5H7zm7 3h3v2h-3z"/>',
    ),
  ],
];

/** Watchlist presentation and lookup reuse the shared editor, uploads, and progress dialog. */
export class Watchlist extends Feature {
  constructor(services) {
    super(services);
    this.pendingStatus = new Set();
    this.lookup = null;
  }

  isActive() {
    return this.services.tabs.current.form === "watchlist";
  }

  providerType() {
    return (
      { Movies: "movie", Series: "tv" }[
        els.contentForm.elements.mediaType?.value
      ] || ""
    );
  }

  watchedButton(tile, onTile = false) {
    const watched = tile.watchedStatus === "Completed";
    return `<button type="button" class="tile-action watched-toggle${onTile ? " watched-toggle--tile" : ""}" data-watch-status="${escapeHtml(tile.id)}" aria-pressed="${watched}" aria-label="${watched ? "Mark as unwatched" : "Mark as watched"}: ${escapeHtml(tile.label || "item")}" data-tooltip="${watched ? "Watched" : "Not watched"}" ${this.pendingStatus.has(tile.id) ? "disabled" : ""}>${EYE}</button>`;
  }

  fieldsMarkup(pending) {
    const media = pending.mediaType || "Movies";
    return `<div class="watchlist-media-status"><div class="field"><span>Media type</span><input name="mediaType" type="hidden" value="${escapeHtml(media)}"><div class="watchlist-media-types" role="group" aria-label="Media type">${MEDIA.map(([value, label, svg]) => `<button type="button" class="tile-control watchlist-media-button" data-media-type="${value}" aria-label="${label}" data-tooltip="${label}" aria-pressed="${value === media}">${svg}</button>`).join("")}</div></div><div class="field watchlist-status-field"><span>Watch status</span><input name="watchedStatus" type="hidden" value="${escapeHtml(pending.watchedStatus || "Not started")}"><button type="button" class="tile-control watched-toggle" id="watchlistDraftStatus" aria-label="Mark as watched" aria-pressed="false">${EYE}</button></div></div><label class="field watchlist-release-field"><span>Release date</span><input name="releaseDate" type="date" value="${escapeHtml(pending.releaseDate || "")}"></label><label class="field watchlist-author-field"><span>Author / creator</span><input name="author" type="text" value="${escapeHtml(pending.author || "")}"></label><div class="field watchlist-thumbnail-field"><span>Thumbnail</span><div class="tile-background-picker">${this.services.editor.singleImagePickerMarkup()}<button type="button" id="retrieveWatchlistThumbnail" class="icon-btn retrieve-link-thumbnail" aria-label="Retrieve Thumbnail from TMDB" data-tooltip="Retrieve Thumbnail">${DOWNLOAD}</button></div><small class="watchlist-lookup-help"></small></div><input name="tmdbId" type="hidden" value="${escapeHtml(pending.tmdbId || "")}"><input name="tmdbType" type="hidden" value="${escapeHtml(pending.tmdbType || "")}">`;
  }

  syncEditor() {
    const active = this.isActive() && state.pendingDrop?.type === "entry";
    els.contentModal.classList.toggle("is-watchlist", active);
    const input = els.contentForm.elements.label;
    let row = input.closest(".watchlist-name-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "watchlist-name-row";
      input.before(row);
      row.append(input);
      row.insertAdjacentHTML(
        "beforeend",
        `<button type="button" class="tile-control" id="watchlistSearch" aria-label="Search TMDB" data-tooltip="Search TMDB">${SEARCH}</button>`,
      );
    }
    const search = $("#watchlistSearch");
    search.hidden = !active;
    row.classList.toggle("is-lookup", active);
    if (!active) return;
    const f = els.contentForm.elements;
    $$(".watchlist-media-button", els.contentForm).forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mediaType === f.mediaType.value),
      );
      button.disabled = state.savingContent;
    });
    const watched = f.watchedStatus.value === "Completed";
    const eye = $("#watchlistDraftStatus");
    eye.setAttribute("aria-pressed", String(watched));
    eye.setAttribute(
      "aria-label",
      watched ? "Mark as unwatched" : "Mark as watched",
    );
    eye.disabled = state.savingContent;
    const disabled =
      state.savingContent || !this.providerType() || !input.value.trim();
    search.disabled = disabled;
    $("#retrieveWatchlistThumbnail").disabled = disabled;
    $(".watchlist-lookup-help").textContent = this.providerType()
      ? "Search by name, or upload a cover."
      : "Upload a cover for this media type. TMDB lookup supports Movies and Series.";
  }

  clearMatch() {
    for (const name of ["tmdbId", "tmdbType"]) {
      const input = els.contentForm.elements[name];
      if (input) input.value = "";
    }
  }

  async withProgress(message, work) {
    if (!this.services.application.beginSubmission(message)) return;
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    this.controller = controller;
    this.services.editor.setContentBusy(true);
    this.services.editor.setEmbedProgress(0.12, message, "TMDB");
    try {
      const result = await work(controller.signal);
      this.services.editor.setEmbedProgress(1, "TMDB lookup complete", "TMDB");
      return result;
    } finally {
      clearTimeout(timeout);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 3000 - (performance.now() - started))),
      );
      this.controller = null;
      this.services.editor.setContentBusy(false);
      this.services.application.endSubmission();
    }
  }

  async search(thumbnailOnly = false, page = 1) {
    if (state.savingContent || !this.isActive()) return;
    const query = els.contentForm.elements.label.value.trim();
    const type = this.providerType();
    if (!query || !type) return;
    const draft = state.pendingDrop;
    const response = await this.withProgress("Searching TMDB…", (signal) =>
      api.searchTmdb(query, type, page, signal),
    );
    if (!response || state.pendingDrop !== draft || !els.contentModal.open)
      return;
    this.lookup = {
      query,
      type,
      thumbnailOnly,
      page: response.page,
      pages: response.pages,
      results: response.results,
      draft,
    };
    $(".tmdb-results-hint").textContent = thumbnailOnly
      ? "Select a title to retrieve its poster. Your other fields will stay as entered."
      : "Select a title to use its name, description, release date, director or creator, and poster.";
    $("#tmdbResults").innerHTML = response.results.length
      ? response.results
          .map(
            (result, i) =>
              `<button type="button" class="tmdb-result" data-tmdb-result="${i}"><strong>${escapeHtml(result.name)} (${escapeHtml(result.year || "Year unknown")})</strong><span class="tmdb-result-description">${escapeHtml(result.description || "No description available.")}</span><span class="tmdb-result-director">${type === "movie" ? "Director" : "Creator"}: ${escapeHtml(result.author || "Unknown")}</span></button>`,
          )
          .join("")
      : "<p>No matches found. Try another title, or enter the details manually.</p>";
    $("#tmdbPrevious").disabled = response.page <= 1;
    $("#tmdbNext").disabled = response.page >= response.pages;
    $("#tmdbPage").textContent = `Page ${response.page} of ${response.pages}`;
    if (!$("#tmdbResultsModal").open) $("#tmdbResultsModal").showModal();
  }

  async selectResult(index) {
    const lookup = this.lookup;
    const result = lookup?.results[index];
    if (!result || state.savingContent || lookup.draft !== state.pendingDrop)
      return;
    $("#tmdbResultsModal").close();
    let posterError = "";
    const poster = await this.withProgress(
      "Retrieving TMDB poster…",
      async (signal) => {
        if (!result.hasPoster) {
          posterError =
            "This title has no poster on TMDB. You can upload a cover.";
          return null;
        }
        try {
          return await api.tmdbPoster(lookup.type, result.id, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          posterError = error.message;
          return null;
        }
      },
    );
    if (lookup.draft !== state.pendingDrop || !els.contentModal.open) return;
    const f = els.contentForm.elements;
    if (!lookup.thumbnailOnly) {
      f.label.value = result.name;
      f.description.value = result.description;
      f.author.value = result.author;
      f.releaseDate.value = result.releaseDate;
    }
    f.tmdbId.value = String(result.id);
    f.tmdbType.value = lookup.type;
    if (poster) state.pendingThumbnail = poster;
    this.services.editor.refreshDynamicFields();
    this.services.application.toast(
      posterError ||
        (lookup.thumbnailOnly
          ? "Thumbnail retrieved"
          : "TMDB information added"),
      posterError ? "error" : undefined,
    );
  }

  async retrieveThumbnail() {
    const f = els.contentForm.elements;
    if (!f.tmdbId.value || f.tmdbType.value !== this.providerType())
      return this.search(true);
    const draft = state.pendingDrop;
    const poster = await this.withProgress(
      "Retrieving TMDB poster…",
      (signal) => api.tmdbPoster(f.tmdbType.value, f.tmdbId.value, signal),
    );
    if (!poster || state.pendingDrop !== draft || !els.contentModal.open)
      return;
    state.pendingThumbnail = poster;
    this.services.editor.refreshDynamicFields();
    this.services.application.toast("Thumbnail retrieved");
  }

  async toggleStatus(id) {
    if (this.pendingStatus.has(id)) return;
    const tile = state.tiles.find(
      (item) => item.id === id && item.section === "watchlist",
    );
    if (!tile) return;
    this.pendingStatus.add(id);
    this.services.board.renderTiles();
    try {
      const updated = await api.setWatchStatus(
        id,
        tile.watchedStatus === "Completed" ? "Not started" : "Completed",
      );
      const index = state.tiles.findIndex((item) => item.id === id);
      if (index !== -1) state.tiles[index] = updated;
      document.dispatchEvent(
        new CustomEvent("hub:content-change", {
          detail: { action: "update", tile: updated },
        }),
      );
    } finally {
      this.pendingStatus.delete(id);
      this.services.board.renderTiles();
      this.services.collections.renderBookmarks();
    }
  }

  async handleClick(event) {
    const target = event.target.closest("button");
    if (!target) return;
    const statusId = target.dataset.watchStatus;
    if (statusId) {
      event.preventDefault();
      event.stopPropagation();
    }
    try {
      if (statusId) return await this.toggleStatus(statusId);
      if (target.id === "tmdbPrevious")
        return await this.search(
          this.lookup.thumbnailOnly,
          this.lookup.page - 1,
        );
      if (target.id === "tmdbNext")
        return await this.search(
          this.lookup.thumbnailOnly,
          this.lookup.page + 1,
        );
      if (target.dataset.tmdbResult !== undefined)
        return await this.selectResult(Number(target.dataset.tmdbResult));
      if (!this.isActive() || !els.contentModal.open || state.savingContent)
        return;
      if (target.id === "watchlistSearch") {
        event.preventDefault();
        return await this.search();
      }
      if (target.id === "retrieveWatchlistThumbnail")
        return await this.retrieveThumbnail();
      if (target.dataset.mediaType) {
        els.contentForm.elements.mediaType.value = target.dataset.mediaType;
        this.clearMatch();
        this.syncEditor();
      }
      if (target.id === "watchlistDraftStatus") {
        const f = els.contentForm.elements.watchedStatus;
        f.value = f.value === "Completed" ? "Not started" : "Completed";
        this.syncEditor();
      }
    } catch (error) {
      this.services.application.toast(
        error.name === "AbortError"
          ? "TMDB lookup canceled or timed out. Please try again."
          : error.message,
        "error",
      );
    }
  }

  bindEvents() {
    document.addEventListener("click", this.handleClick);
    els.contentForm.elements.label.addEventListener("input", () => {
      if (this.isActive()) {
        this.clearMatch();
        this.syncEditor();
      }
    });
    els.contentForm.elements.label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && this.isActive()) {
        event.preventDefault();
        this.search().catch((error) =>
          this.services.application.toast(error.message, "error"),
        );
      }
    });
    els.contentModal.addEventListener("close", () => {
      this.controller?.abort();
      this.lookup = null;
      if ($("#tmdbResultsModal").open) $("#tmdbResultsModal").close();
    });
    $("#submissionModal").addEventListener("cancel", (event) => {
      if (this.controller) event.preventDefault();
    });
    $("#tmdbResultsModal").addEventListener("click", (event) => {
      if (event.target === $("#tmdbResultsModal"))
        $("#tmdbResultsModal").close();
    });
  }
}
