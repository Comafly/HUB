import { Feature } from "./feature.js";
import {
  state,
  $,
  els,
  GLOBE_ICON,
  escapeHtml,
  normalizeUrl,
  defaultTileLabel,
  displayText,
  tileColor,
} from "./context.js";

export class ContentBoard extends Feature {
  constructor(services) {
    super(services);
    this.layoutFrame = undefined;
  }

  renderTags() {
    const tab = this.services.tabs.current;
    const filters = ["All", ...(tab.filters || [])];
    const watchlist = tab.form === "watchlist";
    $(".tags-panel").classList.toggle("is-watchlist-filters", watchlist);
    const selected = (tag) => watchlist && state.mediaTypeFilters.length
      ? state.mediaTypeFilters.includes(tag)
      : state.tag === tag;
    els.tagList.innerHTML = filters
      .map(
        (tag) =>
          `<button class="tag-btn ${selected(tag) ? "is-active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span>↗</span></button>`,
      )
      .join("");
    if (!tab.metadataFilters) return;
    const metadataTags = [
      ...new Set(
        this.services.tabs.items.flatMap((tile) => tile.metadataTags || []),
      ),
    ].filter(
      (tag) =>
        !filters.some((preset) => preset.toLowerCase() === tag.toLowerCase()),
    );
    if (metadataTags.length)
      els.tagList.innerHTML += `<div class="metadata-filter-row"><span class="metadata-label">File metadata</span>${metadataTags.map((tag) => `<button type="button" class="tag-btn metadata-filter ${state.tag === tag ? "is-active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span>↗</span></button>`).join("")}</div>`;
  }

  tileMatches(tile) {
    return this.services.tabs.matches(tile);
  }

  siteFaviconUrl(value) {
    try {
      const url = new URL(normalizeUrl(value));
      return ["http:", "https:"].includes(url.protocol)
        ? `${url.origin}/favicon.ico`
        : "";
    } catch {
      return "";
    }
  }

  defaultUrlBackground(tile = {}) {
    const backgrounds = state.urlBackgrounds || [];
    if (!backgrounds.length) return "";
    const index =
      [...String(tile.id || "")].reduce(
        (sum, char) => sum + char.charCodeAt(0),
        0,
      ) % backgrounds.length;
    return backgrounds[index];
  }

  urlBackgroundPickerMarkup() {
    const selected =
      state.pendingDrop.urlBackground ||
      this.defaultUrlBackground(state.pendingDrop);
    return `<div class="tile-background-picker">${this.services.editor.singleImagePickerMarkup()}<button type="button" id="retrieveLinkThumbnail" class="icon-btn retrieve-link-thumbnail" data-tooltip="Retrieve Link Thumbnail" aria-label="Retrieve Link Thumbnail" ${!state.pendingDrop?.url || state.savingContent ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17H5a4 4 0 0 1-.4-8A6 6 0 0 1 16 6a4 4 0 0 1 3 7.8M12 10v11m-4-4 4 4 4-4"/></svg></button><div class="url-background-options" role="group" aria-label="Link backgrounds">${(state.urlBackgrounds || []).map((src, i) => `<button type="button" class="tile-color-option url-background-option" data-url-background="${escapeHtml(src)}" aria-label="Link background ${i + 1}" aria-pressed="${!state.pendingThumbnail && selected === src}"><img src="${escapeHtml(src)}" alt="" /></button>`).join("")}</div></div><small>Choose one thumbnail or a background image.</small>`;
  }

  isYoutubeLink(tile) {
    if (tile.type !== "link") return false;
    try {
      return /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(
        new URL(normalizeUrl(tile.url)).hostname,
      );
    } catch {
      return false;
    }
  }

  tileMedia(tile) {
    if (tile.type === "entry")
      return tile.thumbnail
        ? `<img src="${escapeHtml(tile.thumbnail)}" alt="" loading="lazy">`
        : `<div class="watchlist-cover" style="background:${tileColor(tile)}"><span>${escapeHtml(tile.mediaType || "Media")}</span><strong>${escapeHtml(tile.label)}</strong><small>${escapeHtml(tile.author || "")}</small></div>`;
    if (tile.type === "text") {
      const s = tile.textStyle || {};
      const over = !!tile.thumbnail;
      const textHtml = `<div class="text-tile${over ? " text-tile--over" : ""}" style="background-color:${tileColor(tile)};font-family:${escapeHtml(s.font || "inherit")};font-size:${Number(s.fontSize || 28)}px;font-weight:${s.bold ? 700 : 500};font-style:${s.italic ? "italic" : "normal"};text-decoration:${s.underline ? "underline" : "none"};text-align:${escapeHtml(s.align || "left")}"><span class="text-content">${escapeHtml(displayText(tile))}</span></div>`;
      return over
        ? `<div class="text-thumb"><img class="cover" src="${escapeHtml(tile.thumbnail)}" alt="" />${textHtml}</div>`
        : textHtml;
    }
    if (tile.type === "image" && tile.files?.length) {
      const previewFiles =
        tile.files.length > 1
          ? Array.from(
              { length: 4 },
              (_, i) => tile.files[i % tile.files.length],
            )
          : tile.files;
      const imgs = previewFiles
        .slice(0, 4)
        .map(
          (src, i) =>
            `<img src="${escapeHtml(src)}" alt="${escapeHtml(tile.label || `Image ${i + 1}`)}" />`,
        )
        .join("");
      return `<div class="gallery gallery--${tile.files.length > 1 ? 4 : 1}">${imgs}</div>${tile.files.length > 1 ? `<span class="gallery-count" aria-label="${tile.files.length} images">+${tile.files.length}</span>` : ""}`;
    }
    if (tile.type === "video" && tile.files?.[0])
      return `<video src="${escapeHtml(tile.files[0])}"${tile.thumbnail ? ` poster="${escapeHtml(tile.thumbnail)}"` : ""} muted loop playsinline preload="${tile.thumbnail ? "metadata" : "auto"}"></video><span class="video-tile-play" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/><path d="m19 14 15 10-15 10z"/></svg></span>`;
    if (
      (tile.type === "audio" || tile.type === "file" || tile.type === "font") &&
      tile.thumbnail
    )
      return `<img class="cover" src="${escapeHtml(tile.thumbnail)}" alt="" />`;
    if (tile.type === "link") {
      const background =
        tile.thumbnail || tile.urlBackground || this.defaultUrlBackground(tile);
      const icon = tile.faviconUrl || this.siteFaviconUrl(tile.url);
      return `<div class="link-preview link-preview--site">${background ? `<img class="link-thumbnail${tile.thumbnail && this.isYoutubeLink(tile) ? " link-thumbnail--youtube" : ""}" src="${escapeHtml(background)}" alt="" />` : ""}<span class="link-site-icon" aria-label="Website"><span class="link-globe">${GLOBE_ICON}</span>${icon ? `<img class="link-favicon" data-link-favicon src="${escapeHtml(icon)}" alt="" referrerpolicy="no-referrer" />` : ""}</span></div>`;
    }
    return `<div class="file-symbol">${tile.type === "audio" ? "♪" : tile.type === "font" ? "Aa" : "↗"}</div>`;
  }

  renderTiles() {
    let items = state.tiles.filter(this.tileMatches);
    if (this.services.tabs.current.form === "watchlist") items = this.services.watchlist.sortItems(items);
    if (this.services.tabs.view === "list") {
      this.services.tabs.renderList(items);
      return;
    }
    els.tileGrid.innerHTML = items
      .map(
        (tile) =>
          `<article draggable="false" class="tile tile--${escapeHtml(tile.size || "medium")} tile--${escapeHtml(this.services.tabs.current.orientation || tile.orientation || "landscape")}" data-tile-id="${escapeHtml(tile.id)}" tabindex="0"><div class="tile-media">${this.tileMedia(tile)}</div><div class="tile-gradient"></div>${this.services.tabs.current.form === "watchlist" ? this.services.watchlist.watchedButton(tile, true) : ""}<div class="tile-actions"><button class="tile-action" data-edit-tile="${escapeHtml(tile.id)}" aria-label="Edit tile" data-tooltip="Edit content"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg></button></div><div class="tile-content"><h3>${escapeHtml(tile.label || defaultTileLabel(tile))}</h3>${this.services.tabs.current.form === "watchlist" && this.services.watchlist.releaseDateLabel(tile) ? `<time class="watchlist-tile-release" datetime="${escapeHtml(tile.releaseDate)}">Release date: ${escapeHtml(this.services.watchlist.releaseDateLabel(tile))}</time>` : ""}${tile.description || (tile.type === "link" ? tile.url : "") ? `<p>${escapeHtml(tile.description || tile.url)}</p>` : ""}</div></article>`,
      )
      .join("");
    els.emptyState.hidden = items.length > 0;
    this.layoutTiles();
  }

  layoutTiles() {
    if (!els.tileGrid.clientWidth || this.services.tabs.view === "list") return;
    if (this.services.tabs.view === "equal") {
      [...els.tileGrid.children].forEach((el) => {
        el.style.gridColumn = "auto";
        el.style.gridRow = "auto";
      });
      this.fitTextTiles();
      return;
    }
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
          (titleMatch ? 10 : 0) +
          ({ small: 1, medium: 2, large: 3 }[size] || 2),
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
    this.fitTextTiles();
  }

  fitTextTiles() {
    els.tileGrid.querySelectorAll(".text-tile").forEach((preview) => {
      const tile = state.tiles.find(
        (item) => item.id === preview.closest("[data-tile-id]").dataset.tileId,
      );
      const content = preview.querySelector(".text-content");
      const css = getComputedStyle(preview);
      const height =
        preview.clientHeight -
        parseFloat(css.paddingTop) -
        parseFloat(css.paddingBottom);
      const width =
        preview.clientWidth -
        parseFloat(css.paddingLeft) -
        parseFloat(css.paddingRight);
      if (!content || height <= 0 || width <= 0) return;
      let low = 0,
        high = Math.max(1, Number(tile?.textStyle?.fontSize || 28));
      preview.style.fontSize = `${high}px`;
      if (content.scrollHeight <= height && content.scrollWidth <= width)
        return;
      for (let i = 0; i < 20; i++) {
        const size = (low + high) / 2;
        preview.style.fontSize = `${size}px`;
        if (content.scrollHeight <= height && content.scrollWidth <= width)
          low = size;
        else high = size;
      }
      preview.style.fontSize = `${low}px`;
    });
  }

  async handleClick(e) {
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      state.tag = tag.dataset.tag;
      if (this.services.tabs.current.form === "watchlist") {
        state.mediaTypeFilters = [];
        this.services.watchlist.syncSelectionButtons();
      }
      this.renderTags();
      this.renderTiles();
      return;
    }
  }

  bindEvents() {
    els.gridLayoutToggle.addEventListener("click", () => {
      this.services.tabs.cycleView();
    });
    document.addEventListener(
      "load",
      (event) => {
        if (event.target.matches?.("[data-link-favicon]"))
          event.target.parentElement.classList.add("has-favicon");
      },
      true,
    );
    document.addEventListener(
      "error",
      (event) => {
        if (event.target.matches?.("[data-link-favicon]")) {
          event.target.hidden = true;
          event.target.parentElement.classList.remove("has-favicon");
        }
      },
      true,
    );
    els.search.addEventListener("input", () => {
      state.query = els.search.value.trim();
      els.clearSearch.classList.toggle("is-visible", !!state.query);
      this.renderTiles();
    });
    els.clearSearch.addEventListener("click", () => {
      els.search.value = "";
      state.query = "";
      els.clearSearch.classList.remove("is-visible");
      els.search.focus();
      this.renderTiles();
    });
    document.addEventListener("click", this.handleClick);
    document.fonts?.ready.then(this.fitTextTiles);
    document.fonts?.addEventListener("loadingdone", this.fitTextTiles);
    new ResizeObserver(() => {
      cancelAnimationFrame(this.layoutFrame);
      this.layoutFrame = requestAnimationFrame(this.layoutTiles);
    }).observe(els.tileGrid);
  }
}
