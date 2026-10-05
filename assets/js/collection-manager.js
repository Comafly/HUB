import { api } from "./api.js";
import { Feature } from "./feature.js";
import { state, $, $$, els, escapeHtml, defaultTileLabel } from "./context.js";

export class CollectionManager extends Feature {
  constructor(services) {
    super(services);
  }

  ensureCollections() {
    if (state.collectionsInitialized) return;
    state.collectionsInitialized = true;
    if (Array.isArray(state.collections) && state.collections.length) {
      state.collections = state.collections.map((c) => ({
        ...c,
        section: c.section || "dashboard",
      }));
      return;
    }
    const legacy = (state.bookmarks || []).filter((id) =>
      state.tiles.some((t) => t.id === id),
    );
    state.collections = [
      {
        id: "collection-default",
        section: "dashboard",
        name: "Saved",
        collapsed: false,
        items: legacy,
      },
    ];
  }

  renderBookmarks() {
    this.ensureCollections();
    const byId = new Map(this.services.tabs.items.map((t) => [t.id, t]));
    state.collections = state.collections.map((c) => ({
      ...c,
      items: (c.items || []).filter((id) =>
        state.tiles.some(
          (t) => t.id === id && t.section === (c.section || "dashboard"),
        ),
      ),
    }));
    if (
      state.activeCollectionId &&
      !state.collections.some((c) => c.id === state.activeCollectionId)
    )
      state.activeCollectionId = null;
    const activeCollection = state.collections.find(
      (c) => c.id === state.activeCollectionId,
    );
    els.collectionFilterBar.hidden = !activeCollection;
    els.collectionFilterName.textContent = activeCollection?.name || "";
    els.bookmarks.innerHTML =
      this.services.tabs.collections
        .map((collection, index) => {
          const items = (collection.items || [])
            .map((id, itemIndex) => {
              const tile = byId.get(id);
              return `<div class="bookmark-item collection-item" draggable="true" tabindex="0" role="button" aria-label="Open ${escapeHtml(tile.label || defaultTileLabel(tile))}" data-bookmark-id="${escapeHtml(id)}" data-collection-id="${escapeHtml(collection.id)}" data-item-index="${itemIndex}"><span class="bookmark-grip">⋮⋮</span><div><strong>${escapeHtml(tile.label || defaultTileLabel(tile))}</strong><small>${escapeHtml(tile.mediaType || (tile.type === "link" && tile.embedUrl ? "LINK - EMBEDDED" : tile.type))}</small></div><button class="bookmark-remove capsule-x" data-remove-bookmark="${escapeHtml(id)}" data-from-collection="${escapeHtml(collection.id)}" aria-label="Remove from collection">×</button></div>`;
            })
            .join("");
          return `<section class="collection-folder ${collection.collapsed ? "is-collapsed" : ""} ${state.activeCollectionId === collection.id ? "is-active-filter" : ""}" draggable="true" data-collection-id="${escapeHtml(collection.id)}" data-collection-index="${index}"><div class="collection-folder-head"><button class="collection-folder-toggle" type="button" data-toggle-collection="${escapeHtml(collection.id)}"><span class="collection-folder-grip" aria-hidden="true">⋮⋮</span><span class="collection-chevron" aria-hidden="true"><span></span></span><strong>${escapeHtml(collection.name)}</strong></button><button class="collection-folder-delete capsule-x" type="button" data-delete-collection="${escapeHtml(collection.id)}" aria-label="Delete ${escapeHtml(collection.name)} collection"></button></div><div class="collection-items" data-collection-drop="${escapeHtml(collection.id)}">${items || '<div class="collection-empty">Drop tiles here</div>'}</div></section>`;
        })
        .join("") ||
      `<div class="bookmark-empty"><span>＋</span><p>Create a collection folder</p></div>`;
  }

  async persistCollections() {
    try {
      await api.saveCollections(state.collections);
    } catch (error) {
      this.services.application.toast(error.message, "error");
    }
  }

  folderAtPoint(x, y) {
    const el = document
      .elementFromPoint(x, y)
      ?.closest?.("[data-collection-drop],.collection-folder");
    if (!el) return null;
    return el.dataset.collectionDrop || el.dataset.collectionId || null;
  }

  async addTileToCollection(tileId, collectionId) {
    const target = state.collections.find((c) => c.id === collectionId);
    if (
      !target ||
      target.section !== state.section ||
      !this.services.tabs.items.some((t) => t.id === tileId)
    )
      return;
    target.items ||= [];
    if (!target.items.includes(tileId)) target.items.push(tileId);
    target.collapsed = false;
    this.renderBookmarks();
    await this.persistCollections();
    this.services.application.toast(`Added to ${target.name}`);
  }

  clearCollectionHighlights() {
    $$(".collection-folder").forEach((el) =>
      el.classList.remove("is-tile-hover"),
    );
  }

  setupTileDrag() {
    let drag = null;
    let suppressClick = false;
    let clickResetTimer;
    const DETACH = 8;
    const HOLD_MS = 500;
    const cleanup = () => {
      if (!drag) return;
      const current = drag;
      drag = null;
      clearTimeout(current.holdTimer);
      cancelAnimationFrame(current.scrollFrame);
      this.clearCollectionHighlights();
      current.ghost?.remove();
      current.overlay?.remove();
      current.source.classList.remove("is-source-dragging", "is-detach-jiggle");
      document.body.classList.remove("is-tile-dragging", "is-mobile-collection-dragging");
      if (current.source.hasPointerCapture?.(current.pointerId))
        current.source.releasePointerCapture(current.pointerId);
      if (current.overlay) current.source.focus({ preventScroll: true });
    };
    const resetClickSoon = () => {
      clearTimeout(clickResetTimer);
      clickResetTimer = setTimeout(() => { suppressClick = false; }, 0);
    };
    const cancel = (event = {}) => {
      if (!drag || (event.pointerId != null && event.pointerId !== drag.pointerId)) return;
      cleanup();
      resetClickSoon();
    };
    const highlight = () => {
      if (!drag?.detached) return;
      const cid = this.folderAtPoint(drag.x, drag.y);
      if (cid === drag.hoverId) return;
      this.clearCollectionHighlights();
      if (cid) {
        const root = drag.overlay || document;
        root.querySelector(`[data-collection-id="${CSS.escape(cid)}"]`)?.classList.add("is-tile-hover");
      }
      drag.hoverId = cid;
    };
    const autoScroll = (time) => {
      if (!drag?.overlay) return;
      const list = drag.overlay.querySelector(".mobile-collection-list");
      const rect = list.getBoundingClientRect();
      const edge = Math.min(80, rect.height / 3);
      let speed = 0;
      if (drag.y < rect.top + edge) speed = -Math.min(1, Math.max(0, (rect.top + edge - drag.y) / edge));
      else if (drag.y > rect.bottom - edge && drag.y < rect.bottom) speed = Math.min(1, (drag.y - rect.bottom + edge) / edge);
      const elapsed = Math.min(32, time - (drag.lastFrame || time));
      drag.lastFrame = time;
      list.scrollTop += speed * elapsed * 0.6;
      highlight();
      drag.scrollFrame = requestAnimationFrame(autoScroll);
    };
    const openMobileCollections = () => {
      const overlay = document.createElement("div");
      overlay.className = "mobile-collection-picker";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "mobileCollectionsTitle");
      overlay.innerHTML = `<header class="mobile-collection-heading"><h2 id="mobileCollectionsTitle">Add to collection</h2><p>Drag to a collection and release. Hold near the top or bottom to scroll.</p></header><div class="mobile-collection-list">${this.services.tabs.collections.map((collection) => `<button type="button" class="collection-folder mobile-collection-target" data-collection-id="${escapeHtml(collection.id)}" data-collection-drop="${escapeHtml(collection.id)}"><strong>${escapeHtml(collection.name)}</strong><small>${collection.items?.length || 0} items</small></button>`).join("") || '<p class="mobile-collection-empty">No collections yet. Cancel and create a collection first.</p>'}</div><footer class="mobile-collection-footer"><button type="button" class="btn btn--ghost mobile-collection-cancel">Cancel</button></footer>`;
      drag.overlay = overlay;
      document.body.append(overlay);
      document.body.classList.add("is-mobile-collection-dragging");
      const cancelButton = overlay.querySelector(".mobile-collection-cancel");
      cancelButton.addEventListener("pointerdown", (event) => { event.preventDefault(); cancel(); });
      cancelButton.addEventListener("click", () => cancel());
      cancelButton.focus({ preventScroll: true });
      overlay.addEventListener("keydown", (event) => {
        // Keep keyboard focus within the temporary full-screen picker.
        if (event.key !== "Tab") return;
        const buttons = [...overlay.querySelectorAll("button")];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      });
      drag.scrollFrame = requestAnimationFrame(autoScroll);
    };
    const detach = () => {
      if (!drag || drag.detached) return;
      drag.detached = true;
      suppressClick = true;
      document.body.classList.add("is-tile-dragging");
      if (drag.mobile) openMobileCollections();
      const ghost = drag.mobile ? document.createElement("div") : drag.source.cloneNode(true);
      ghost.classList.add("tile-ghost");
      if (drag.mobile) {
        ghost.classList.add("mobile-tile-ghost");
        ghost.textContent = state.tiles.find((tile) => tile.id === drag.id)?.label || "Tile";
      }
      ghost.removeAttribute("data-tile-id");
      ghost.removeAttribute("tabindex");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.querySelector(".tile-actions")?.remove();
      Object.assign(ghost.style, {
        position: "fixed", left: "0", top: "0", width: "80px", height: "80px", margin: "0", zIndex: "220", pointerEvents: "none",
        transform: `translate3d(${drag.x}px,${drag.y}px,0)`,
      });
      drag.ghost = ghost;
      document.body.append(ghost);
      if (!drag.mobile) ghost.animate([
        { width: `${drag.w}px`, height: `${drag.h}px`, left: `${-drag.offsetX}px`, top: `${-drag.offsetY}px` },
        { width: "80px", height: "80px", left: "-40px", top: "-40px" },
      ], { duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
      drag.source.classList.add("is-source-dragging", "is-detach-jiggle");
      drag.source.setPointerCapture?.(drag.pointerId);
      highlight();
    };
    document.addEventListener("pointerdown", (event) => {
      const source = event.target.closest?.("[data-tile-id]");
      if (drag || !source || event.button !== 0 || event.isPrimary === false || this.services.tabs.current.collections === false || event.target.closest("button,a,input,textarea,select")) return;
      clearTimeout(clickResetTimer);
      suppressClick = false;
      const rect = source.getBoundingClientRect();
      drag = {
        source, id: source.dataset.tileId, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
        offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
        w: rect.width, h: rect.height, detached: false, hoverId: null,
        mobile: matchMedia("(max-width: 900px)").matches || event.pointerType === "touch",
      };
      if (drag.mobile) drag.holdTimer = setTimeout(detach, HOLD_MS);
      else source.setPointerCapture?.(event.pointerId);
    });
    document.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.detached) {
        if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DETACH) return;
        // A swipe before the hold completes remains native page scrolling.
        if (drag.mobile) { cancel(event); return; }
        detach();
      }
      event.preventDefault();
      drag.ghost.style.transform = `translate3d(${drag.x}px,${drag.y}px,0)`;
      highlight();
    }, { passive: false });
    // Prevent the browser from claiming an already activated long-press gesture.
    document.addEventListener("touchmove", (event) => {
      if (drag?.mobile && drag.detached) event.preventDefault();
    }, { passive: false });
    document.addEventListener("contextmenu", (event) => {
      if (event.target.closest?.("[data-tile-id]") && (drag?.mobile || matchMedia("(max-width: 900px)").matches)) event.preventDefault();
    });
    document.addEventListener("pointerup", async (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const id = drag.id;
      const cid = drag.detached ? this.folderAtPoint(event.clientX, event.clientY) : null;
      cleanup();
      resetClickSoon();
      if (cid) {
        try { await this.addTileToCollection(id, cid); }
        catch (error) { this.services.application.toast(error.message || "Could not save collection", "error"); }
      }
    });
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", () => cancel());
    window.addEventListener("resize", () => cancel());
    document.addEventListener("hub:tab-change", () => cancel());
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") cancel(); });
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
    document.addEventListener("click", (event) => {
      if (!suppressClick || event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }, true);
  }

  setActiveCollection(collectionId) {
    state.activeCollectionId = collectionId || null;
    this.renderBookmarks();
    this.services.board.renderTiles();
  }

  showCollectionDeleteConfirm(collectionId) {
    const collection = state.collections.find((c) => c.id === collectionId);
    if (!collection) return;
    state.pendingCollectionDeleteId = collectionId;
    $("h2", els.deleteCollectionModal).textContent =
      `Delete ${collection.name}?`;
    els.deleteCollectionModal.showModal();
  }

  async deletePendingCollection() {
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
      this.renderBookmarks();
      this.services.board.renderTiles();
      this.services.application.toast("Collection deleted");
    } catch (error) {
      this.services.application.toast(
        error.message || "Could not delete collection",
        "error",
      );
    } finally {
      els.confirmDeleteCollection.disabled = false;
    }
  }

  setupDragAndDrop() {
    let dragDepth = 0;
    let nativeInternalDrag = false;
    let draggedCollectionId = null;
    const isInternalDrag = (e) =>
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
          const collectionToGrid =
            draggedCollectionId && els.contentColumn.contains(e.target);
          if (!els.bookmarks.contains(e.target) && !collectionToGrid)
            e.stopPropagation();
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
      const pending = this.services.editor.detectDrop(e.dataTransfer);
      pending
        ? this.services.editor.openContentModal(pending)
        : this.services.application.toast(
            "That drop type is not supported",
            "error",
          );
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
      this.clearCollectionHighlights();
    });
    const showCollectionOverlay = () => {
      const column = els.contentColumn.getBoundingClientRect();
      const top = Math.max(
        0,
        document.querySelector(".topbar").getBoundingClientRect().bottom,
      );
      Object.assign(els.collectionGridDropOverlay.style, {
        top: `${top}px`,
        left: `${column.left}px`,
        width: `${column.width}px`,
      });
      els.collectionGridDropOverlay.classList.add("is-visible");
    };
    window.addEventListener("resize", () => {
      if (
        draggedCollectionId &&
        els.collectionGridDropOverlay.classList.contains("is-visible")
      )
        showCollectionOverlay();
    });
    window.addEventListener(
      "scroll",
      () => {
        if (
          draggedCollectionId &&
          els.collectionGridDropOverlay.classList.contains("is-visible")
        )
          showCollectionOverlay();
      },
      { passive: true },
    );
    els.contentColumn.addEventListener("dragenter", (e) => {
      if (!draggedCollectionId) return;
      e.preventDefault();
      showCollectionOverlay();
    });
    els.contentColumn.addEventListener("dragover", (e) => {
      if (!draggedCollectionId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      showCollectionOverlay();
    });
    els.contentColumn.addEventListener("dragleave", (e) => {
      if (!draggedCollectionId || els.contentColumn.contains(e.relatedTarget))
        return;
      els.collectionGridDropOverlay.classList.remove("is-visible");
    });
    els.contentColumn.addEventListener("drop", (e) => {
      if (!draggedCollectionId) return;
      e.preventDefault();
      e.stopPropagation();
      const id = draggedCollectionId;
      draggedCollectionId = null;
      els.collectionGridDropOverlay.classList.remove("is-visible");
      this.setActiveCollection(id);
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
      if (!els.bookmarks.contains(e.relatedTarget))
        this.clearCollectionHighlights();
    });
    els.bookmarks.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearCollectionHighlights();
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
        this.renderBookmarks();
        await this.persistCollections();
        return;
      }
      if (itemRaw) {
        const data = JSON.parse(itemRaw);
        const source = state.collections.find(
          (c) => c.id === data.collectionId,
        );
        const target = state.collections.find(
          (c) =>
            c.id ===
            (targetFolder?.dataset.collectionId ||
              targetItem?.dataset.collectionId),
        );
        if (
          !source ||
          !target ||
          source.section !== state.section ||
          target.section !== state.section ||
          !this.services.tabs.items.some((t) => t.id === data.tileId)
        )
          return;
        if (targetItem?.dataset.bookmarkId === data.tileId) return;
        target.items = target.items.filter((id) => id !== data.tileId);
        let to = targetItem
          ? target.items.indexOf(targetItem.dataset.bookmarkId)
          : target.items.length;
        if (targetItem?.classList.contains("drop-after")) to++;
        target.items.splice(Math.max(0, to), 0, data.tileId);
        target.collapsed = false;
        this.renderBookmarks();
        await this.persistCollections();
      }
    });
    this.setupTileDrag();
  }

  async handleClick(e) {
    if (e.target.closest("#collectionAddButton")) {
      els.collectionForm.reset();
      els.collectionModal.showModal();
      return;
    }
    const deleteCollection = e.target.closest("[data-delete-collection]");
    if (deleteCollection) {
      e.preventDefault();
      e.stopPropagation();
      this.showCollectionDeleteConfirm(
        deleteCollection.dataset.deleteCollection,
      );
      return;
    }
    const toggleCollection = e.target.closest("[data-toggle-collection]");
    if (toggleCollection && !e.target.closest(".bookmark-remove")) {
      const c = state.collections.find(
        (x) => x.id === toggleCollection.dataset.toggleCollection,
      );
      if (c) {
        c.collapsed = !c.collapsed;
        this.renderBookmarks();
        await this.persistCollections();
      }
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
      this.renderBookmarks();
      await this.persistCollections();
      return;
    }
  }

  bindEvents() {
    els.collectionFilterClear.addEventListener("click", () =>
      this.setActiveCollection(null),
    );
    els.confirmDeleteCollection.addEventListener(
      "click",
      this.deletePendingCollection,
    );
    els.deleteCollectionModal.addEventListener("close", () => {
      state.pendingCollectionDeleteId = null;
    });
    els.collectionForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = String(
        new FormData(els.collectionForm).get("name") || "",
      ).trim();
      if (!name) return;
      if (!this.services.application.beginSubmission()) return;
      try {
        const collections = [
          ...state.collections,
          {
            id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            section: state.section,
            collapsed: false,
            items: [],
          },
        ];
        await api.saveCollections(collections);
        state.collections = collections;
        this.renderBookmarks();
        els.collectionModal.close();
        this.services.application.toast("Collection created");
      } catch (error) {
        this.services.application.toast(error.message, "error");
      } finally {
        this.services.application.endSubmission();
      }
    });
    document.addEventListener("click", this.handleClick);
  }
}
