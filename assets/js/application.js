import { api } from "./api.js";
import { Feature } from "./feature.js";
import {
  ENABLE_CALENDAR_MODULE,
  state,
  $,
  $$,
  els,
  THEME_KEY,
  escapeHtml,
  favicon,
  normalizeUrl,
} from "./context.js";

export class Application extends Feature {
  constructor(services) {
    super(services);
  }

  raiseNotifications() {
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

  toast(message, tone = "default") {
    const el = document.createElement("div");
    el.className = `toast toast--${tone}`;
    el.textContent = message;
    els.toastRegion.appendChild(el);
    this.raiseNotifications();
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

  formatUploadBytes(bytes) {
    return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(2)} MB`;
  }

  updateSubmissionProgress({ loaded = 0, total = 0, ratio = 0 } = {}) {
    const progress = $("#submissionProgress");
    if (!progress) return;
    progress.hidden = total <= 0;
    const track = progress.querySelector(".submission-progress-track");
    const pct = Math.max(
      0,
      Math.min(100, Math.round((ratio || (total ? loaded / total : 0)) * 100)),
    );
    if (track) {
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", "Upload progress");
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(pct));
    }
    $("#submissionProgressBar").style.width = `${pct}%`;
    $("#submissionProgressAmount").textContent =
      `${this.formatUploadBytes(loaded)} / ${this.formatUploadBytes(total)}`;
    $("#submissionProgressPercent").textContent = `${pct}%`;
  }

  beginSubmission(message = "Adding...", { cancelable = false } = {}) {
    const dialog = $("#submissionModal");
    if (dialog.open) return false;
    $("#submissionMessage").textContent = message;
    $("#submissionCancel").hidden = !cancelable;
    this.updateSubmissionProgress();
    dialog.showModal();
    return true;
  }

  endSubmission() {
    state.activeUploadController = null;
    state.activeUploadCanceled = false;
    const dialog = $("#submissionModal");
    if (dialog.open) dialog.close();
  }

  renderTopLinks() {
    els.topLinks.innerHTML =
      state.topLinks
        .map((link) => {
          const image = link.image || favicon(link.url);
          return `<div class="top-link"><a class="circle-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer" data-tooltip="${escapeHtml(link.label)}" data-tooltip-url="${escapeHtml(link.url)}" aria-label="${escapeHtml(link.label)}">${image ? `<img src="${escapeHtml(image)}" alt="" />` : "<span>↗</span>"}</a><button type="button" class="capsule-x top-link-edit" data-edit-top-link="${escapeHtml(link.id)}" aria-label="Edit ${escapeHtml(link.label || "top link")}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/></svg></button><button type="button" class="capsule-x top-link-remove" data-delete-top-link="${escapeHtml(link.id)}" aria-label="Delete ${escapeHtml(link.label || "top link")}">×</button></div>`;
        })
        .join("") +
      `<button class="circle-link circle-link--add" id="addTopLink" data-tooltip="Add top link" aria-label="Add top link">+</button>`;
  }

  renderAll() {
    this.services.collections.ensureCollections();
    this.services.calendar.renderCalendar();
    this.services.calendar.renderCalendarSettings();
    this.services.watchlist.renderGenreFilters();
    this.services.board.renderTags();
    this.services.board.renderTiles();
    this.renderTopLinks();
    this.services.collections.renderBookmarks();
  }

  saveLocalTheme() {
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(state.settings));
    } catch {
      this.toast(
        "Browser storage is unavailable; these preferences will last for this session.",
        "error",
      );
    }
  }

  loadLocalTheme() {
    try {
      const saved = JSON.parse(localStorage.getItem(THEME_KEY) || "null");
      if (!saved) return;
      if (
        [
          "umber",
          "midnight-blue",
          "bubblegum",
          "caramel",
          "marble",
          "carbon-lavender",
        ].includes(saved.theme)
      )
        state.settings.theme = saved.theme;
      if (["dark", "light"].includes(saved.mode))
        state.settings.mode = saved.mode;
      if (typeof saved.alwaysShowTileDetails === "boolean")
        state.settings.alwaysShowTileDetails = saved.alwaysShowTileDetails;
      if (["alphabetical", "releaseDate"].includes(saved.watchlistSort))
        state.settings.watchlistSort = saved.watchlistSort;
      if (["asymmetric", "equal"].includes(saved.gridLayout))
        state.settings.gridLayout = saved.gridLayout;
      if (
        saved.tabViews &&
        typeof saved.tabViews === "object" &&
        !Array.isArray(saved.tabViews)
      )
        state.settings.tabViews = saved.tabViews;
    } catch {
      /* Use the default when browser storage is unavailable. */
    }
  }

  updateToday() {
    const date = new Date(),
      day = date.getDate();
    const suffix =
      day % 100 >= 11 && day % 100 <= 13
        ? "th"
        : { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
    const el = $("#todayDate");
    el.dateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    el.textContent = `${date.toLocaleDateString("en-AU", { weekday: "long" })}, ${day}${suffix} of ${date.toLocaleDateString("en-AU", { month: "long" })} (${date.toLocaleDateString("en-GB")})`;
  }

  applyDisplayPreferences() {
    const always = state.settings.alwaysShowTileDetails === true;
    document.documentElement.dataset.tileDetails = always ? "always" : "hover";
    els.tileDetailsToggle.checked = always;
    this.services.tabs.applyView();
  }

  applyTheme() {
    const theme = state.settings.theme || "umber";
    const mode = state.settings.mode || "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.mode = mode;
    const dark = mode !== "light";
    els.modeToggle.checked = dark;
    els.modeLabel.textContent = dark ? "Dark mode" : "Light mode";
    this.applyDisplayPreferences();
    $$("[data-theme-choice]").forEach((card) => {
      const active = card.dataset.themeChoice === theme;
      card.classList.toggle("is-active", active);
      card.setAttribute("aria-pressed", String(active));
    });
  }

  setSection(section) {
    this.services.tabs.select(section);
  }

  async downloadContent() {
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
      this.toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Download Content";
    }
  }

  setupTooltips() {
    const tip = document.createElement("div");
    tip.id = "appTooltip";
    tip.className = "app-tooltip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("popover", "manual");
    tip.hidden = true;
    document.body.append(tip);
    let owner = null;
    const observer = new MutationObserver(() => {
      if (owner?.isConnected) show(owner);
      else hide();
    });
    function hide() {
      observer.disconnect();
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
      observer.observe(target, {
        attributes: true,
        attributeFilter: [
          "data-tooltip",
          "data-tooltip-description",
          "data-tooltip-url",
        ],
      });
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
    document.addEventListener("pointerdown", (event) => {
      if (!owner?.contains(event.target)) hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hide();
    });
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
  }

  setupStickyNavbar() {
    const navbar = document.querySelector(".topbar");
    if (!navbar) return;
    const update = () => {
      const height = Math.ceil(navbar.getBoundingClientRect().height);
      if (height > 0)
        document.documentElement.style.setProperty(
          "--navbar-height",
          `${height}px`,
        );
    };
    new ResizeObserver(update).observe(navbar);
    window.addEventListener("resize", update);
    update();
  }

  async init() {
    try {
      const data = await api.bootstrap();
      const defaultSettings = state.settings;
      Object.assign(state, data);
      state.settings = { ...defaultSettings, ...(data.settings || {}) };
      state.fonts = Array.isArray(state.fonts) ? state.fonts : [];
      this.services.tabs.load(state.tabs);
      this.services.editor.registerFontFaces();
      this.services.collections.ensureCollections();
    } catch (error) {
      this.toast(
        `Could not load the hub: ${error.message}. Serve this folder through PHP.`,
        "error",
      );
      return;
    }
    this.loadLocalTheme();
    this.updateToday();

    let calendarResizeFrame = 0;
    window.addEventListener("resize", () => {
      if (!ENABLE_CALENDAR_MODULE || !state.calendar?.exists) return;
      cancelAnimationFrame(calendarResizeFrame);
      calendarResizeFrame = requestAnimationFrame(
        this.services.calendar.renderCalendar,
      );
    });
    this.applyTheme();
    this.services.tabs.select(state.section);
    this.setupStickyNavbar();
    Object.values(this.services).forEach((feature) => feature.bindEvents?.());
    this.services.collections.setupDragAndDrop();
    this.setupTooltips();
  }

  async handleClick(e) {
    const themeChoice = e.target.closest("[data-theme-choice]");
    if (themeChoice) {
      state.settings.theme = themeChoice.dataset.themeChoice;
      this.applyTheme();
      try {
        this.saveLocalTheme();
      } catch (err) {
        this.toast(err.message, "error");
      }
      return;
    }
    const nav = e.target.closest("[data-section]");
    if (nav?.classList.contains("nav-tab")) {
      this.setSection(nav.dataset.section);
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
        this.renderTopLinks();
        this.toast("Top link deleted");
      } catch (err) {
        deleteTopLink.disabled = false;
        this.toast(err.message, "error");
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
      this.services.editor.setTopLinkImage(link?.image || null);
      els.topLinkModal.showModal();
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
      if (
        state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase())
      ) {
        state.pendingTags = state.pendingTags.filter(
          (t) => t.toLowerCase() !== tag.toLowerCase(),
        );
        this.services.editor.renderTagEditor();
      } else this.services.editor.addTag(tag);
      return;
    }
    const removeFormTag = e.target.closest("[data-remove-form-tag]");
    if (removeFormTag) {
      state.pendingTags = state.pendingTags.filter(
        (t) => t !== removeFormTag.dataset.removeFormTag,
      );
      this.services.editor.renderTagEditor();
      return;
    }
    if (e.target.closest("#retrieveLinkThumbnail")) {
      await this.services.editor.retrieveLinkThumbnail();
      return;
    }
    const color = e.target.closest("[data-tile-color]");
    if (color) {
      this.services.editor.selectTileBackground(
        Number(color.dataset.tileColor),
      );
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
      this.services.editor.setTopLinkImage();
      return;
    }
    if (e.target.closest("#thumbnailAdd")) {
      $("#thumbnailPickerInput")?.click();
      return;
    }
    const saved = e.target.closest("[data-bookmark-id]");
    if (saved) {
      this.services.viewer.activateTile(saved.dataset.bookmarkId);
      return;
    }
    const tile = e.target.closest("[data-tile-id]");
    if (tile && !e.target.closest("button,a,input,textarea,select")) {
      this.services.viewer.activateTile(tile.dataset.tileId);
    }
  }

  bindEvents() {
    els.tileDetailsToggle.addEventListener("change", () => {
      state.settings.alwaysShowTileDetails = els.tileDetailsToggle.checked;
      this.applyDisplayPreferences();
      this.saveLocalTheme();
    });
    $("#downloadContentButton").addEventListener("click", this.downloadContent);
    els.topLinkModal.addEventListener("close", () =>
      this.services.editor.setTopLinkImage(),
    );
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
      if (file) this.services.editor.setTopLinkImage(file);
    });
    els.topLinkModal.addEventListener("paste", (e) => {
      const file = [...e.clipboardData.files].find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        this.services.editor.setTopLinkImage(file);
      }
    });
    els.settingsButton.addEventListener("click", () =>
      els.settingsModal.showModal(),
    );
    els.modeToggle.addEventListener("change", async () => {
      state.settings.mode = els.modeToggle.checked ? "dark" : "light";
      this.applyTheme();
      try {
        this.saveLocalTheme();
      } catch (e) {
        this.toast(e.message, "error");
      }
    });
    els.topLinkForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const editingId = state.editingTopLinkId;
      if (!this.beginSubmission(editingId ? "Saving..." : "Adding...")) return;
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
        this.renderTopLinks();
        els.topLinkModal.close();
        this.toast(editingId ? "Top link updated" : "Top link added");
      } catch (err) {
        this.toast(err.message, "error");
      } finally {
        this.endSubmission();
      }
    });
    document.addEventListener("click", this.handleClick);
    new MutationObserver(this.raiseNotifications).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
  }
}
