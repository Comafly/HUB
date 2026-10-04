import { Feature } from "./feature.js";
import {
  MEDIA_TYPES,
  state,
  $,
  els,
  escapeHtml,
  defaultTileLabel,
  displayText,
  tileColor,
} from "./context.js";

export class MediaViewer extends Feature {
  constructor(services) {
    super(services);
    this.instagramViewerCleanup = () => {};
    this.gallerySwipeCleanup = () => {};
  }

  viewerSelectedFile(tile) {
    return tile.files?.[state.viewerIndex] || tile.files?.[0] || "";
  }

  viewerSelectedMediaMarkup(tile) {
    const src = this.viewerSelectedFile(tile);
    if (!src) return "";
    const alt = escapeHtml(tile.label || defaultTileLabel(tile));
    if (tile.type === "image")
      return `<div class="viewer-stage"><img class="viewer-zoom-target" src="${escapeHtml(src)}" alt="${alt}" draggable="false" /></div>`;
    if (tile.type === "video")
      return `<div class="viewer-stage"><video class="viewer-zoom-target" src="${escapeHtml(src)}" controls autoplay playsinline draggable="false"></video></div>`;
    return "";
  }

  viewerMediaMarkup(tile) {
    if (tile.type === "link" && tile.embedUrl)
      return `<div class="viewer-embed"><iframe src="${escapeHtml(tile.embedUrl)}" title="${escapeHtml(tile.label || "Embedded media")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    if (["image", "video"].includes(tile.type) && tile.files?.length)
      return this.viewerSelectedMediaMarkup(tile);
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

  setupInstagramViewer(tile) {
    this.instagramViewerCleanup();
    const wrapper = $(".viewer-embed", els.viewerMedia),
      iframe = wrapper.querySelector("iframe");
    wrapper.classList.add("viewer-embed--instagram");
    iframe.setAttribute("scrolling", "no");
    let nativeWidth = Math.max(320, Number(tile.embedWidth) || 540);
    const ratio =
      Number(tile.mediaWidth) > 0 && Number(tile.mediaHeight) > 0
        ? tile.mediaWidth / tile.mediaHeight
        : /\/reel\//.test(tile.embedUrl)
          ? 9 / 16
          : 1;
    let nativeHeight = Number(tile.embedHeight) || nativeWidth / ratio + 120;
    const fit = () => {
      const width = wrapper.clientWidth,
        height = wrapper.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(width / nativeWidth, height / nativeHeight);
      Object.assign(iframe.style, {
        width: `${nativeWidth}px`,
        height: `${nativeHeight}px`,
        transform: `scale(${scale})`,
        left: `${(width - nativeWidth * scale) / 2}px`,
        top: `${(height - nativeHeight * scale) / 2}px`,
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(wrapper);
    const message = (event) => {
      if (
        event.source !== iframe.contentWindow ||
        !/^https:\/\/(?:www\.)?instagram\.com$/.test(event.origin)
      )
        return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const height = Number(data?.details?.height || data?.height);
      if (height >= 100 && height <= 10000) {
        nativeHeight = height;
        fit();
      }
    };
    window.addEventListener("message", message);
    iframe.addEventListener("load", fit);
    // Old tiles can use their saved poster to recover the media proportions.
    if (!tile.mediaWidth && tile.thumbnail) {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth && image.naturalHeight) {
          nativeHeight =
            (nativeWidth * image.naturalHeight) / image.naturalWidth + 120;
          fit();
        }
      };
      image.src = tile.thumbnail;
    }
    fit();
    this.instagramViewerCleanup = () => {
      observer.disconnect();
      window.removeEventListener("message", message);
      iframe.removeEventListener("load", fit);
      this.instagramViewerCleanup = () => {};
    };
  }

  viewerPropertiesMarkup(tile) {
    const date = tile.dateAdded || tile.createdAt;
    let html = `<dl class="viewer-properties"><dt>Date added</dt><dd>${escapeHtml(date ? new Date(date).toLocaleString("en-AU") : "Unavailable")}</dd>${tile.location ? `<dt>Location</dt><dd>${escapeHtml(tile.location)}</dd>` : ""}</dl>`;
    if (["image", "video"].includes(tile.type) && tile.files?.length) {
      const file = this.viewerSelectedFile(tile);
      const m = tile.fileMetadata?.[file] || {};
      html += `<div class="media-properties"><dl class="viewer-properties"><dt>Dimensions</dt><dd data-dimensions>${m.width && m.height ? `${m.width} × ${m.height} px` : "Unavailable"}</dd><dt>DPI</dt><dd>${escapeHtml(m.dpi || (tile.type === "video" ? "Not applicable" : "Unavailable"))}</dd><dt>Date taken</dt><dd>${escapeHtml(m.dateTaken || "Unavailable")}</dd></dl></div>`;
    }
    return html;
  }

  viewerFontLinkMarkup(tile) {
    const font =
      tile.type === "text" ? this.services.editor.fontForTile(tile) : null;
    if (!font) return "";
    const download = font.originalName || `${font.name}.${font.ext}`;
    return `<div class="viewer-font"><div class="eyebrow">Font used</div><a class="viewer-font-link" href="${escapeHtml(encodeURI(font.file))}" download="${escapeHtml(download)}"><span>${escapeHtml(font.name)}</span><small>Download .${escapeHtml(font.ext)}</small></a></div>`;
  }

  viewerActionsMarkup(tile) {
    if (tile.type === "link" && tile.url)
      return `<a class="viewer-action-button viewer-original-link" href="${escapeHtml(tile.url)}" target="_blank" rel="noopener noreferrer" data-tooltip="Open Original Link" aria-label="Open Original Link"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></svg></a>`;
    if (!tile.files?.length || ["text", "link"].includes(tile.type)) return "";
    const selected = `api.php?action=tiles.download&amp;id=${encodeURIComponent(tile.id)}&amp;index=${state.viewerIndex}`;
    const all = `api.php?action=tiles.download&amp;id=${encodeURIComponent(tile.id)}`;
    return `<a class="viewer-action-button" href="${selected}" download data-tooltip="Download" aria-label="Download selected media"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 15v5h14v-5"/></svg></a>${tile.files.length > 1 ? `<a class="viewer-action-button" href="${all}" download data-tooltip="Download All" aria-label="Download all media"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4H8zM6 8h12v4H6zM5 13h14v7H5zM12 15v3m0 0 2-2m-2 2-2-2"/></svg></a>` : ""}`;
  }

  viewerThumbnailsMarkup(tile) {
    if (
      !["image", "video"].includes(tile.type) ||
      (tile.files?.length || 0) < 2
    )
      return "";
    return tile.files
      .map(
        (src, i) =>
          `<button class="viewer-thumb${i === state.viewerIndex ? " is-active" : ""}" type="button" data-viewer-index="${i}" aria-label="Show media ${i + 1}" aria-pressed="${i === state.viewerIndex}">${tile.type === "image" ? `<img src="${escapeHtml(src)}" alt="" draggable="false" />` : `<video src="${escapeHtml(src)}" muted preload="metadata"></video>`}</button>`,
      )
      .join("");
  }

  resetViewerTransform() {
    state.viewerZoom = 1;
    state.viewerPanX = 0;
    state.viewerPanY = 0;
    this.applyViewerTransform();
  }

  clampViewerPan() {
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

  applyViewerTransform() {
    const media = $(".viewer-zoom-target", els.viewerMedia);
    if (!media) return;
    this.clampViewerPan();
    media.style.transform = `translate3d(${state.viewerPanX}px, ${state.viewerPanY}px, 0) scale(${state.viewerZoom})`;
    els.viewerMedia.classList.toggle("is-zoomed", state.viewerZoom > 1);
  }

  createGallerySwipe(tile) {
    const stage = $(".viewer-stage", els.viewerMedia);
    const current = $(".viewer-zoom-target", stage);
    const width =
      stage.clientWidth ||
      stage.getBoundingClientRect().width ||
      els.viewerMedia.clientWidth;
    if (!current || !width) return null;
    const track = document.createElement("div");
    track.className = "viewer-swipe-track";
    let timer,
      finished = false,
      settling = false;
    for (const offset of [-1, 0, 1]) {
      const file = tile.files[state.viewerIndex + offset];
      if (!file) continue;
      const slide = document.createElement("div");
      slide.className = "viewer-swipe-slide";
      slide.style.transform = `translateX(${offset * 100}%)`;
      if (offset === 0) slide.append(current);
      else {
        const image = document.createElement("img");
        image.src = file;
        image.alt = "";
        image.draggable = false;
        slide.append(image);
      }
      track.append(slide);
    }
    stage.append(track);
    stage.classList.add("is-swiping");
    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (track.contains(current)) stage.append(current);
      track.remove();
      stage.classList.remove("is-swiping");
      if (this.gallerySwipeCleanup === cleanup)
        this.gallerySwipeCleanup = () => {};
    };
    this.gallerySwipeCleanup = cleanup;
    return {
      cleanup,
      move(dx) {
        if (settling || finished) return;
        const edge =
          (dx > 0 && state.viewerIndex === 0) ||
          (dx < 0 && state.viewerIndex === tile.files.length - 1);
        track.style.transform = `translate3d(${Math.max(-width, Math.min(width, edge ? dx * 0.25 : dx))}px,0,0)`;
      },
      settle(nextIndex) {
        if (settling || finished) return;
        settling = true;
        const changed = nextIndex !== state.viewerIndex;
        const target = changed
          ? nextIndex > state.viewerIndex
            ? -width
            : width
          : 0;
        const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 240;
        track.style.transition = `transform ${duration}ms cubic-bezier(.22,.61,.36,1)`;
        track.style.transform = `translate3d(${target}px,0,0)`;
        const tileId = state.viewerTileId;
        const finish = () => {
          if (finished) return;
          cleanup();
          if (
            changed &&
            state.viewerTileId === tileId &&
            state.viewerZoom === 1
          ) {
            state.viewerIndex = nextIndex;
            this.renderViewerSelection(tile);
          }
        };
        timer = setTimeout(finish, duration);
      },
    };
  }

  renderViewerSelection(tile) {
    this.gallerySwipeCleanup();
    this.instagramViewerCleanup();
    els.viewerMedia.classList.toggle(
      "viewer-media--image-gallery",
      tile.type === "image" && (tile.files?.length || 0) > 1,
    );
    els.viewerMedia.classList.toggle(
      "viewer-media--embed",
      tile.type === "link" && !!tile.embedUrl,
    );
    els.viewerMedia.innerHTML = this.viewerMediaMarkup(tile);
    if (
      tile.type === "link" &&
      tile.embedUrl &&
      (tile.provider === "instagram" || /instagram\.com/.test(tile.embedUrl))
    )
      this.setupInstagramViewer(tile);
    els.viewerActions.innerHTML = this.viewerActionsMarkup(tile);
    els.viewerThumbnails.innerHTML = this.viewerThumbnailsMarkup(tile);
    els.viewerThumbnails.hidden = !els.viewerThumbnails.innerHTML;
    els.viewerMedia.style.backgroundColor =
      tile.type === "text" && !tile.thumbnail ? tileColor(tile) : "";
    els.viewerMedia.classList.toggle(
      "viewer-media--text-background",
      tile.type === "text" && !!tile.thumbnail,
    );
    if (tile.type === "text" && tile.thumbnail) {
      const background = document.createElement("img");
      background.className = "viewer-text-background";
      background.src = tile.thumbnail;
      background.alt = "";
      els.viewerMedia.prepend(background);
    }
    els.viewerMeta.innerHTML = `<div class="eyebrow">${escapeHtml(tile.type)}</div><h2>${escapeHtml(tile.label || defaultTileLabel(tile))}</h2>${tile.description ? `<p>${escapeHtml(tile.description)}</p>` : ""}${tile.tags?.length ? `<div class="viewer-tags">${tile.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}${tile.metadataTags?.length ? `<div class="viewer-tags metadata-tags">${tile.metadataTags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div>` : ""}${this.viewerPropertiesMarkup(tile)}${this.viewerFontLinkMarkup(tile)}`;
    this.resetViewerTransform();
    if (tile.type === "image" && tile.files?.length > 1) {
      for (const index of [state.viewerIndex - 1, state.viewerIndex + 1])
        if (tile.files[index]) {
          const preload = new Image();
          preload.src = tile.files[index];
        }
    }
    const media = $(
      "img.viewer-zoom-target, video.viewer-zoom-target",
      els.viewerMedia,
    );
    if (media) {
      const update = () => {
        const value = $("[data-dimensions]", els.viewerMeta);
        const w = media.naturalWidth || media.videoWidth,
          h = media.naturalHeight || media.videoHeight;
        if (value && w && h) value.textContent = `${w} × ${h} px`;
      };
      media.addEventListener(
        media.tagName === "VIDEO" ? "loadedmetadata" : "load",
        update,
      );
      update();
    }
  }

  openViewer(tile) {
    state.viewerTileId = tile.id;
    state.viewerIndex = 0;
    const editButton = $("#viewerEditButton");
    if (editButton) editButton.dataset.editTile = tile.id;
    this.renderViewerSelection(tile);
    els.mediaViewer.showModal();
  }

  activateTile(tileId) {
    const tile = state.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    if (tile.type === "link" && tile.embedUrl) {
      this.openViewer(tile);
      return;
    }
    if (tile.type === "link" && tile.url) {
      window.open(tile.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (tile.type === "entry") {
      this.services.editor.openEditModal(tile.id);
      return;
    }
    if (MEDIA_TYPES.has(tile.type)) this.openViewer(tile);
  }

  async handleClick(e) {
    const viewerThumb = e.target.closest("[data-viewer-index]");
    if (viewerThumb) {
      const tile = state.tiles.find((item) => item.id === state.viewerTileId);
      if (!tile) return;
      state.viewerIndex = Number(viewerThumb.dataset.viewerIndex) || 0;
      this.renderViewerSelection(tile);
      return;
    }
    const editTile = e.target.closest("[data-edit-tile]");
    if (editTile) {
      e.preventDefault();
      e.stopPropagation();
      if (editTile.closest("#mediaViewer") && els.mediaViewer.open)
        els.mediaViewer.close();
      this.services.editor.openEditModal(editTile.dataset.editTile);
      return;
    }
  }

  bindEvents() {
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
    els.viewerMedia.addEventListener(
      "wheel",
      (e) => {
        const media = $(".viewer-zoom-target", els.viewerMedia);
        if (!media) return;
        e.preventDefault();
        endViewerGesture();
        this.gallerySwipeCleanup();
        const previous = state.viewerZoom;
        const next = Math.max(
          1,
          Math.min(3, previous + (e.deltaY < 0 ? 0.1 : -0.1)),
        );
        if (next === 1) {
          state.viewerPanX = 0;
          state.viewerPanY = 0;
        }
        state.viewerZoom = Number(next.toFixed(2));
        this.applyViewerTransform();
      },
      { passive: false },
    );
    let viewerGesture = null;
    const endViewerGesture = () => {
      const gesture = viewerGesture;
      viewerGesture = null;
      state.viewerPanning = false;
      if (gesture && els.viewerMedia.hasPointerCapture?.(gesture.id))
        els.viewerMedia.releasePointerCapture(gesture.id);
    };
    els.viewerMedia.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.isPrimary === false ||
        !event.target.closest(".viewer-stage")
      )
        return;
      const tile = state.tiles.find((item) => item.id === state.viewerTileId);
      const swipe =
        state.viewerZoom === 1 &&
        tile?.type === "image" &&
        (tile.files?.length || 0) > 1;
      if (!swipe && state.viewerZoom <= 1) return;
      if (event.pointerType !== "touch") event.preventDefault();
      viewerGesture = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: state.viewerPanX,
        panY: state.viewerPanY,
        zoom: state.viewerZoom,
        tileId: state.viewerTileId,
        index: state.viewerIndex,
        swipe,
      };
      if (swipe) {
        this.gallerySwipeCleanup();
        viewerGesture.visual = this.createGallerySwipe(tile);
      }
      state.viewerPanning = !swipe;
      els.viewerMedia.setPointerCapture?.(event.pointerId);
    });
    els.viewerMedia.addEventListener("pointermove", (event) => {
      if (!viewerGesture || event.pointerId !== viewerGesture.id) return;
      if (viewerGesture.swipe && state.viewerZoom === 1) {
        const dx = event.clientX - viewerGesture.x,
          dy = event.clientY - viewerGesture.y;
        viewerGesture.visual?.move(Math.abs(dx) > Math.abs(dy) * 1.2 ? dx : 0);
      }
      if (viewerGesture.zoom > 1 && state.viewerZoom > 1) {
        state.viewerPanX = viewerGesture.panX + event.clientX - viewerGesture.x;
        state.viewerPanY = viewerGesture.panY + event.clientY - viewerGesture.y;
        this.applyViewerTransform();
      }
    });
    els.viewerMedia.addEventListener("pointerup", (event) => {
      if (!viewerGesture || event.pointerId !== viewerGesture.id) return;
      const gesture = viewerGesture;
      endViewerGesture();
      const dx = event.clientX - gesture.x,
        dy = event.clientY - gesture.y;
      const tile = state.tiles.find((item) => item.id === gesture.tileId);
      if (
        !gesture.swipe ||
        state.viewerZoom !== 1 ||
        state.viewerTileId !== gesture.tileId ||
        state.viewerIndex !== gesture.index ||
        tile?.type !== "image"
      ) {
        gesture.visual?.cleanup();
        return;
      }
      if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.2) {
        gesture.visual?.settle(state.viewerIndex);
        return;
      }
      const next = Math.max(
        0,
        Math.min(tile.files.length - 1, state.viewerIndex + (dx < 0 ? 1 : -1)),
      );
      if (gesture.visual) gesture.visual.settle(next);
      else if (next !== state.viewerIndex) {
        state.viewerIndex = next;
        this.renderViewerSelection(tile);
      }
    });
    const cancelViewerGesture = () => {
      if (!viewerGesture) return;
      viewerGesture.visual?.settle(state.viewerIndex);
      endViewerGesture();
    };
    els.viewerMedia.addEventListener("pointercancel", cancelViewerGesture);
    els.viewerMedia.addEventListener("lostpointercapture", cancelViewerGesture);
    els.mediaViewer.addEventListener("close", () => {
      endViewerGesture();
      this.gallerySwipeCleanup();
    });
    els.viewerMedia.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });
    els.mediaViewer.addEventListener("close", () => {
      this.instagramViewerCleanup();
      els.viewerMedia.replaceChildren();
      state.viewerTileId = null;
      state.viewerIndex = 0;
      this.resetViewerTransform();
    });
    document.addEventListener("click", this.handleClick);
  }
}
