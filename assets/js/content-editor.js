import { api } from "./api.js";
import { Feature } from "./feature.js";
import {
  IMAGE_LIMIT,
  encode,
  state,
  $,
  $$,
  els,
  TILE_COLOR_GROUPS,
  TILE_COLOR_COUNT,
  BUILTIN_FONT_OPTIONS,
  FONT_UPLOAD_ICON,
  ALIGN_ORDER,
  ALIGN_ICONS,
  escapeHtml,
  normalizeUrl,
  safeHostname,
  displayText,
  tileColor,
} from "./context.js";

export class ContentEditor extends Feature {
  constructor(services) {
    super(services);
    this.metadataCache = new WeakMap();
    this.metadataRevision = 0;
    this.urlProcessing = null;
    this.linkMetadataTimer = undefined;
    this.videoPosterCache = new Map();
  }

  revokePreviewUrls() {
    state.previewUrls.forEach(URL.revokeObjectURL);
    state.previewUrls = [];
  }

  filePreviewUrl(file) {
    if (typeof file === "string") return escapeHtml(file);
    const u = URL.createObjectURL(file);
    state.previewUrls.push(u);
    return u;
  }

  pendingFiles() {
    return state.pendingDrop?.files || [];
  }

  detectFileType(file) {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    if (/\.(ttf|otf|woff2?)$/i.test(file.name)) return "font";
    return "file";
  }

  detectFiles(files) {
    const arr = [...files];
    if (!arr.length) return null;
    const types = arr.map(this.detectFileType);
    return {
      type: types.every((t) => t === "image") ? "image" : types[0],
      files: arr,
    };
  }

  detectDrop(dt) {
    const fileDrop = this.detectFiles(dt.files || []);
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

  async refreshMetadataTags() {
    const revision = ++this.metadataRevision;
    const files = [...this.pendingFiles()];
    const row = $("#metadataTags");
    row.textContent = files.some((f) => typeof f !== "string")
      ? "Reading file metadata…"
      : "";
    const results = await Promise.all(
      files.map(async (file) => {
        if (typeof file === "string")
          return state.pendingDrop?.fileMetadata?.[file] || {};
        if (!this.metadataCache.has(file))
          this.metadataCache.set(
            file,
            api.inspectMetadata(file).catch(() => ({ unavailable: true })),
          );
        return this.metadataCache.get(file);
      }),
    );
    if (revision !== this.metadataRevision) return;
    const tags = [...new Set(results.flatMap((m) => m.tags || []))];
    row.innerHTML = tags.length
      ? `<span class="metadata-label">File metadata</span>${tags.map((t) => `<span class="metadata-tag">${escapeHtml(t)}</span>`).join("")}`
      : results.some((m) => m.unavailable)
        ? "Metadata preview unavailable; extraction will be retried when saved."
        : "";
  }

  renderTagEditor() {
    els.tagCapsules.innerHTML = state.pendingTags
      .map(
        (tag) =>
          `<span class="tag-capsule">${escapeHtml(tag)}<button class="capsule-x" type="button" data-remove-form-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button></span>`,
      )
      .join("");
    els.contentForm.elements.tags.value = state.pendingTags.join(",");
    els.presetTags.innerHTML = (
      this.services.tabs.current.tagPresets ||
      (this.services.tabs.current.filterField
        ? []
        : this.services.tabs.current.filters || [])
    )
      .map(
        (tag) =>
          `<button type="button" class="preset-tag ${state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? "is-added" : ""}" aria-pressed="${state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase())}" data-preset-tag="${tag}">${tag}</button>`,
      )
      .join("");
  }

  normalizeTag(raw) {
    return raw
      .trim()
      .replace(/^,+|,+$/g, "")
      .replace(/\s+/g, " ");
  }

  addTag(raw) {
    const tag = this.normalizeTag(raw);
    if (!tag) return;
    if (!state.pendingTags.some((t) => t.toLowerCase() === tag.toLowerCase()))
      state.pendingTags.push(tag);
    this.renderTagEditor();
  }

  commitTagInput() {
    const raw = els.tagInput.value;
    if (raw.trim()) this.addTag(raw);
    els.tagInput.value = "";
  }

  customUploadMarkup({
    id,
    name = "",
    accept = "",
    label = "Choose file",
    multiple = false,
    helper = "",
  }) {
    return `<div class="custom-upload"><input id="${id}" ${name ? `name="${name}"` : ""} type="file" ${accept ? `accept="${accept}"` : ""} ${multiple ? "multiple" : ""} hidden><button class="upload-button" type="button" data-file-trigger="${id}"><span class="upload-button-icon">＋</span><span>${label}</span></button><span class="upload-file-name" data-file-name="${id}">No file selected</span></div>${helper ? `<small>${helper}</small>` : ""}`;
  }

  singleImagePickerMarkup(file = state.pendingThumbnail, topLink = false) {
    const thumb = file
      ? `<div class="gallery-thumb"><img src="${topLink ? escapeHtml(state.topLinkPreviewUrl) : this.filePreviewUrl(file)}" alt="${escapeHtml(file.name || "Thumbnail")}"><button type="button" class="capsule-x gallery-remove" ${topLink ? "data-remove-top-link-image" : "data-remove-thumbnail"} aria-label="Remove thumbnail">×</button></div>`
      : "";
    return `<div class="gallery-picker gallery-picker--single">${thumb}<button type="button" class="gallery-add" id="${topLink ? "topLinkImageAdd" : "thumbnailAdd"}" aria-label="Add thumbnail"><span class="image-placeholder">▧</span><b>+</b></button></div><input id="${topLink ? "topLinkImageInput" : "thumbnailPickerInput"}" type="file" accept="image/*" hidden>`;
  }

  async setTopLinkImage(file = null) {
    try {
      if (file instanceof File)
        [file] = await this.services.media.prepareImages([file]);
    } catch (error) {
      this.services.application.toast(error.message, "error");
      return;
    }
    if (state.topLinkPreviewUrl) URL.revokeObjectURL(state.topLinkPreviewUrl);
    state.pendingTopLinkImage = file;
    state.topLinkPreviewUrl =
      typeof file === "string" ? file : file ? URL.createObjectURL(file) : null;
    $("#topLinkImagePicker").innerHTML = this.singleImagePickerMarkup(
      file,
      true,
    );
  }

  selectedMediaMarkup(type) {
    if (!["image", "video", "audio", "font", "file"].includes(type)) return "";
    const accept =
      {
        image: "image/*",
        video: "video/*",
        audio: "audio/*",
        font: ".ttf,.otf,.woff,.woff2",
      }[type] || "";
    const thumbs = this.pendingFiles()
      .map((file, i) => {
        const name =
          typeof file === "string" ? file.split("/").pop() : file.name;
        const fileType =
          typeof file === "string" ? type : this.detectFileType(file);
        const symbol =
          { video: "▶", audio: "♪", font: "Aa", file: "↗" }[fileType] || "↗";
        const preview =
          fileType === "image"
            ? `<img src="${this.filePreviewUrl(file)}" alt="">`
            : fileType === "video"
              ? `<video src="${this.filePreviewUrl(file)}" muted playsinline preload="metadata"></video>`
              : `<span class="file-preview-symbol" aria-hidden="true">${symbol}</span>`;
        return `<div class="gallery-thumb" title="${escapeHtml(name)}">${preview}<span class="file-preview-name">${escapeHtml(name)}</span><button type="button" class="capsule-x gallery-remove" data-remove-pending-file="${i}" aria-label="Remove ${escapeHtml(name)}">×</button></div>`;
      })
      .join("");
    return `<div class="gallery-picker" id="galleryPicker">${thumbs}<button type="button" class="gallery-add" id="galleryAdd" aria-label="Add files"><span class="image-placeholder">▧</span><b>+</b></button></div><input id="galleryFileInput" type="file" ${accept ? `accept="${accept}"` : ""} multiple hidden>`;
  }

  fontOptionsMarkup() {
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

  registerFontFaces() {
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

  fontForTile(tile) {
    const family = tile?.textStyle?.font;
    return family ? state.fonts.find((f) => f.family === family) : null;
  }

  refreshFontSelect(selected) {
    const select = els.contentForm.elements.font;
    if (!select || select.tagName !== "SELECT") return;
    const current = selected ?? select.value;
    // Keep any previously saved font that is no longer in either list.
    const builtin = new Set(
      [...BUILTIN_FONT_OPTIONS.matchAll(/value="([^"]*)"/g)].map((m) =>
        m[1].replace(/&#39;/g, "'"),
      ),
    );
    const legacy = [...select.options].filter(
      (o) =>
        !builtin.has(o.value) && !state.fonts.some((f) => f.family === o.value),
    );
    select.innerHTML = this.fontOptionsMarkup();
    select.append(...legacy);
    select.value = current;
  }

  tileBackgroundPickerMarkup() {
    const groups = TILE_COLOR_GROUPS.map(
      (group) =>
        `<div class="tile-color-group" role="group" aria-label="${group.label} background colours"><small class="tile-color-label">${group.label}</small><div class="tile-color-swatches">${group.indices.map((index, variant) => `<button type="button" class="tile-color-option" style="background:var(--tile-color-${index})" data-tile-color="${index}" data-tooltip="${group.label}${group.indices.length > 1 ? ` ${variant + 1}` : ""}" aria-label="${group.label} background colour${group.indices.length > 1 ? ` ${variant + 1}` : ""}" aria-pressed="${state.pendingDrop.backgroundColor === index}"><span>Aa</span></button>`).join("")}</div></div>`,
    ).join("");
    return `<div class="tile-background-picker">${this.singleImagePickerMarkup()}<div class="tile-color-options">${groups}</div></div><small>Choose one thumbnail or a background colour.</small>`;
  }

  fieldMarkup(type, pending = {}) {
    if (type === "entry" && this.services.tabs.current.form === "watchlist")
      return this.services.watchlist.fieldsMarkup(pending);
    if (type === "entry")
      return (
        this.services.tabs.fieldsMarkup(pending) +
        `<div class="field field--wide"><span>Thumbnail</span>${this.singleImagePickerMarkup()}</div>`
      );
    const media = this.selectedMediaMarkup(type);
    if (type === "media")
      return `<div class="field field--wide"><span>Media</span><div class="media-empty-drop"><strong>Drop media here</strong><small>Drag files into this modal, paste an image, or choose files manually.</small><button class="upload-button" type="button" id="chooseMediaButton"><span class="upload-button-icon">＋</span><span>Choose media</span></button></div></div>`;
    if (type === "link")
      return `<div class="field field--wide"><span>Thumbnail image / background</span>${this.services.board.urlBackgroundPickerMarkup()}</div>`;
    if (type === "text")
      return `<div class="text-format-row"><div class="field text-font-field"><span>Font</span><div class="font-picker-row"><select name="font">${this.fontOptionsMarkup()}</select><button type="button" class="font-upload-btn" id="fontUploadButton" aria-label="Upload a font file" data-tooltip="Upload font">${FONT_UPLOAD_ICON}</button></div><input id="fontFileInput" type="file" accept=".ttf,.otf,.woff,.woff2,.ttc,.otc,.eot" hidden /></div><label class="field text-size-field"><span>Size</span><input name="fontSize" class="scrub-input" type="number" min="12" max="96" value="28" /></label><div class="field text-style-field"><span>Style</span><div class="format-row"><label class="format-toggle"><input name="bold" type="checkbox" /><span>B</span></label><label class="format-toggle"><input name="italic" type="checkbox" /><span><i>I</i></span></label><label class="format-toggle"><input name="underline" type="checkbox" /><span><u>U</u></span></label><input name="align" type="hidden" value="left" /><button type="button" class="align-toggle" id="alignToggle" data-align-cycle aria-label="Text alignment: left" data-tooltip="Align: left"></button></div></div></div><label class="field field--wide"><span>Text</span><textarea class="text-live-preview-input" name="text" rows="1" required placeholder="Type text for your tile preview...">${escapeHtml(pending.text || "")}</textarea></label><div class="field field--wide"><span>Thumbnail image / colour</span>${this.tileBackgroundPickerMarkup()}</div>`;
    if (type === "image")
      return `<div class="field field--wide"><span>Gallery images</span>${media}<small>Drop or paste images anywhere in this modal to add them to the gallery.</small></div>`;
    if (type === "video")
      return `<div class="field field--wide"><span>Video</span>${media}<small>The first frame of the first video is used as the tile thumbnail.</small></div>`;
    const mediaLabel =
      { video: "Video", audio: "Audio", font: "Font files", file: "Files" }[
        type
      ] || "Files";
    return `<div class="field field--wide"><span>${mediaLabel}</span>${media}</div><div class="field field--wide"><span>Tile image</span>${this.singleImagePickerMarkup()}</div>`;
  }

  filesRequired(type) {
    return (
      !this.pendingFiles().length &&
      ["video", "audio", "font", "file"].includes(type)
    );
  }

  refreshDynamicFields() {
    const location = els.contentForm.elements.location;
    const entry = state.pendingDrop.type === "entry";
    const label = els.contentForm.elements.label;
    label.required = entry;
    label.closest("label").querySelector("span").textContent = entry
      ? this.services.tabs.current.nameLabel || "Name"
      : "Label";
    label.placeholder = entry ? "Media name" : "Optional label";
    els.tagEditor.closest(".field").hidden =
      entry &&
      !!this.services.tabs.current.filterField &&
      !this.services.tabs.current.showTags;
    const hideLocation = ["text", "link", "entry"].includes(
      state.pendingDrop.type,
    );
    location.closest(".field").hidden = hideLocation;
    location.disabled = hideLocation;
    this.refreshMetadataTags();
    const linkFields = $("#linkFields");
    linkFields.hidden = state.pendingDrop.type !== "link";
    if (state.pendingDrop.type === "link") {
      if (!linkFields.querySelector('[name="url"]'))
        linkFields.innerHTML = `<div class="link-field-row"><label class="field"><span>Link</span><input id="contentUrlInput" name="url" type="text" inputmode="url" required placeholder="website.com" value="${escapeHtml(state.pendingDrop.url || "")}"></label><label class="field embed-field"><span>Embed</span><input type="checkbox" id="embedUrlToggle" class="embed-switch" role="switch" disabled aria-label="Embed link"></label></div>`;
    } else linkFields.replaceChildren();
    this.syncTileControls();
    const draft = new FormData(els.contentForm);
    const preserve =
      els.contentForm.elements.type.value === state.pendingDrop.type;
    this.revokePreviewUrls();
    els.dynamicFields.innerHTML = this.fieldMarkup(
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
    if (state.pendingDrop.type === "text") this.updateTextPreview();
    this.syncEmbedButton();
    this.services.watchlist?.syncEditor();
  }

  initScrubInputs() {
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
      const v =
        input.value === "" ? Number(input.min) || 0 : Number(input.value);
      const next = clamp(input, Math.round(v));
      if (String(next) !== input.value) {
        input.value = next;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  updateTextPreviewBackground() {
    if (state.pendingDrop?.type !== "text") return;
    const preview = els.contentForm.elements.text;
    if (!preview) return;
    preview.style.backgroundColor = Number.isInteger(
      state.pendingDrop.backgroundColor,
    )
      ? tileColor(state.pendingDrop)
      : "";
  }

  selectTileBackground(index) {
    if (
      state.pendingDrop?.type !== "text" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= TILE_COLOR_COUNT
    )
      return;
    const scrollTop = els.contentForm.scrollTop;
    state.pendingDrop.backgroundColor =
      state.pendingDrop.backgroundColor === index ? null : index;
    state.pendingThumbnail = null;
    // Preserve the editor and focused swatch instead of rebuilding the form.
    els.dynamicFields
      .querySelectorAll(".gallery-picker--single .gallery-thumb")
      .forEach((thumb) => thumb.remove());
    const thumbnailInput = els.dynamicFields.querySelector(
      "#thumbnailPickerInput",
    );
    if (thumbnailInput) thumbnailInput.value = "";
    els.dynamicFields
      .querySelectorAll("[data-tile-color]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(
            Number(button.dataset.tileColor) ===
              state.pendingDrop.backgroundColor,
          ),
        );
      });
    this.revokePreviewUrls();
    this.updateTextPreviewBackground();
    els.contentForm.scrollTop = scrollTop;
  }

  updateTextPreview() {
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
    this.updateTextPreviewBackground();
    this.syncAlignToggle();
    this.autosizeTextPreview();
  }

  syncAlignToggle() {
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

  autosizeTextPreview() {
    const ta = els.contentForm.elements.text;
    if (!ta || ta.tagName !== "TEXTAREA" || !ta.offsetParent) return;
    ta.style.height = "auto";
    const cs = getComputedStyle(ta);
    const border =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    ta.style.height = `${ta.scrollHeight + border}px`;
  }

  async openContentModal(pending, editing = false) {
    if (!pending || $("#submissionModal").open) return;
    if (this.services.tabs.current.editor === "entry")
      pending = {
        ...pending,
        type: "entry",
        files: [],
        mediaType:
          pending.mediaType ||
          (state.tag !== "All"
            ? state.tag
            : this.services.tabs.current.filters?.[0]),
      };
    const section = state.section;
    try {
      pending = {
        ...pending,
        files: await this.services.media.prepareImages([
          ...(pending.files || []),
        ]),
      };
    } catch (error) {
      this.services.application.toast(error.message, "error");
      return;
    }
    if (state.section !== section) return;
    state.editingId = null;
    $("#deleteContentButton").hidden = true;
    $("#saveContentButton").textContent = "Add content";
    this.revokePreviewUrls();
    state.pendingDrop = {
      ...pending,
      embedPreference: editing ? !!pending.embedUrl : undefined,
      autoLabel:
        !editing ||
        !pending.label ||
        pending.label === pending.linkTitle ||
        pending.label === safeHostname(pending.url),
      autoDescription:
        !editing || !pending.description || pending.description === pending.url,
      checkedUrl: editing ? pending.url : undefined,
      files: [...(pending.files || [])],
    };
    state.pendingThumbnail = null;
    state.pendingTags = [];
    els.contentModal
      .querySelector(".modal-card")
      ?.classList.remove("is-modal-drop-target");
    this.videoPosterCache.clear();
    els.contentForm.reset();
    els.contentForm.elements.size.value = pending.size || "medium";
    els.contentForm.elements.orientation.value =
      pending.orientation || "landscape";
    els.dynamicFields.replaceChildren();
    $("#linkFields").replaceChildren();
    els.contentForm.elements.type.value = pending.type;
    els.contentTypeEyebrow.textContent = `${pending.type} content`;
    els.contentModalTitle.textContent =
      pending.type === "entry"
        ? `Add ${this.services.tabs.current.title} item`
        : `Add ${pending.type}`;
    this.refreshDynamicFields();
    this.renderTagEditor();
    els.contentModal.showModal();
    if (pending.type === "text") this.updateTextPreview();
    if (pending.type === "link" && !editing) {
      this.contentUrlChanged();
      if (pending.url) await this.processContentUrl();
    }
    return true;
  }

  async openEditModal(tileId) {
    const tile = state.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const opened = await this.openContentModal(
      { ...tile, text: displayText(tile) },
      true,
    );
    if (!opened) return;
    state.editingId = tile.id;
    state.pendingThumbnail = tile.thumbnail || null;
    state.pendingTags = [...(tile.tags || [])];
    const f = els.contentForm.elements;
    for (const name of [
      "label",
      "description",
      "location",
      "size",
      "orientation",
    ])
      if (tile[name] != null) f[name].value = tile[name];
    this.refreshDynamicFields();
    if (tile.type === "entry") this.services.tabs.fillFields(tile);
    this.services.watchlist?.syncEditor();
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
      this.updateTextPreview();
    }
    this.renderTagEditor();
    els.contentModalTitle.textContent =
      tile.type === "entry"
        ? `Edit ${this.services.tabs.current.title} item`
        : `Edit ${tile.type}`;
    $("#deleteContentButton").hidden = false;
    $("#saveContentButton").textContent = "Save changes";
    if (tile.type === "link") this.contentUrlChanged();
  }

  currentContentUrl() {
    return normalizeUrl(els.contentForm.elements.url?.value || "");
  }

  syncTileControls() {
    const f = els.contentForm.elements;
    $$("[data-tile-size]", els.contentForm).forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.tileSize === f.size.value),
      ),
    );
    const locked = this.services.tabs.current.orientation;
    if (locked) f.orientation.value = locked;
    const button = $("#orientationButton"),
      portrait = f.orientation.value === "portrait";
    button.disabled = !!locked;
    button.classList.toggle("is-portrait", portrait);
    button.dataset.tooltip = button.ariaLabel = locked
      ? `Orientation locked to ${locked}`
      : `Rotate to ${portrait ? "Landscape" : "Portrait"}`;
    button.setAttribute("aria-pressed", String(portrait));
  }

  syncEmbedButton() {
    const draft = state.pendingDrop,
      toggle = $("#embedUrlToggle"),
      retrieve = $("#retrieveLinkThumbnail");
    if (toggle) {
      toggle.disabled = !draft?.embedAllowed || state.savingContent;
      toggle.checked = !!draft?.embedUrl;
    }
    if (retrieve)
      retrieve.disabled = !this.currentContentUrl() || state.savingContent;
  }

  applyLinkDetails(draft, info) {
    if (info.title) {
      draft.linkTitle = info.title;
      if (draft.autoLabel || !els.contentForm.elements.label.value.trim())
        els.contentForm.elements.label.value = info.title;
    }
    if (info.faviconUrl) draft.faviconUrl = info.faviconUrl;
  }

  fetchLinkDetails(draft = state.pendingDrop, force = false) {
    if (!draft || draft.type !== "link") return Promise.resolve(null);
    const url = this.currentContentUrl();
    if (!url) return Promise.resolve(null);
    if (!force && draft.detailsUrl === url)
      return draft.detailsPromise || Promise.resolve(null);
    draft.detailsUrl = url;
    const revision = (draft.detailsRevision || 0) + 1;
    draft.detailsRevision = revision;
    draft.detailsPromise = api
      .inspectLink(url)
      .then((info) => {
        if (
          state.pendingDrop !== draft ||
          !els.contentModal.open ||
          this.currentContentUrl() !== url ||
          draft.detailsRevision !== revision
        )
          return null;
        this.applyLinkDetails(draft, info);
        draft.linkInfo = info;
        draft.embedAllowed = !!info.embedAllowed && !!info.embedUrl;
        if (!draft.embedAllowed) draft.embedUrl = "";
        else if (
          ["youtube", "instagram", "tiktok", "facebook"].includes(
            info.provider,
          ) &&
          draft.embedPreference !== false
        ) {
          draft.embedUrl = info.embedUrl;
          draft.provider = info.provider;
        }
        draft.embedWidth = Number(info.embedWidth || 0);
        draft.embedHeight = Number(info.embedHeight || 0);
        this.syncEmbedButton();
        return info;
      })
      .catch(() => {
        if (
          state.pendingDrop === draft &&
          this.currentContentUrl() === url &&
          draft.detailsRevision === revision
        ) {
          draft.embedAllowed = false;
          draft.embedUrl = "";
          this.syncEmbedButton();
        }
        return null;
      });
    return draft.detailsPromise;
  }

  async downloadLinkThumbnail(draft, info, url, revision) {
    if (!info?.thumbnail) throw new Error("No thumbnail was provided.");
    let file = await api.downloadMedia(info.thumbnail);
    if (file.size > IMAGE_LIMIT)
      file = await this.services.media.compressImage(file);
    if (!file.type.startsWith("image/"))
      throw new Error("The thumbnail is not an image.");
    const posterUrl = URL.createObjectURL(file);
    let dimensions;
    try {
      const image = new Image();
      image.src = posterUrl;
      await image.decode();
      dimensions = [image.naturalWidth, image.naturalHeight];
    } finally {
      URL.revokeObjectURL(posterUrl);
    }
    if (
      state.pendingDrop !== draft ||
      !els.contentModal.open ||
      this.currentContentUrl() !== url ||
      draft.thumbnailRevision !== revision
    )
      return false;
    draft.mediaWidth = dimensions[0] || 0;
    draft.mediaHeight = dimensions[1] || 0;
    state.pendingThumbnail = file;
    this.refreshDynamicFields();
    return true;
  }

  async retrieveLinkThumbnail(manual = true) {
    const draft = state.pendingDrop,
      url = this.currentContentUrl();
    if (
      !draft ||
      draft.type !== "link" ||
      !url ||
      (manual && state.savingContent)
    )
      return;
    const revision = (draft.thumbnailRevision || 0) + 1;
    draft.thumbnailRevision = revision;
    if (
      manual &&
      !this.services.application.beginSubmission("Retrieving link thumbnail...")
    )
      return;
    const started = performance.now();
    if (manual) {
      this.setContentBusy(true);
      this.setEmbedProgress(
        0.1,
        "Retrieving link thumbnail...",
        "Thumbnail retrieval progress",
      );
    }
    try {
      const info = await this.fetchLinkDetails(draft, manual);
      if (manual)
        this.setEmbedProgress(
          0.5,
          "Downloading thumbnail...",
          "Thumbnail retrieval progress",
        );
      await this.downloadLinkThumbnail(draft, info, url, revision);
      if (manual)
        this.setEmbedProgress(
          1,
          "Thumbnail ready",
          "Thumbnail retrieval progress",
        );
    } catch (error) {
      if (
        state.pendingDrop === draft &&
        this.currentContentUrl() === url &&
        draft.thumbnailRevision === revision
      )
        this.services.application.toast(
          "We couldn't retrieve the link thumbnail. You can still upload an image or use a background.",
          "error",
        );
      if (manual)
        this.setEmbedProgress(
          1,
          "Thumbnail unavailable",
          "Thumbnail retrieval progress",
        );
    } finally {
      if (manual) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, 2000 - (performance.now() - started)),
          ),
        );
        this.services.application.endSubmission();
        this.setContentBusy(false);
      }
    }
  }

  contentUrlChanged() {
    if (state.pendingDrop?.type !== "link") return;
    const draft = state.pendingDrop,
      url = this.currentContentUrl();
    const changed = draft.url !== url;
    if (changed) {
      draft.embedPreference = undefined;
      draft.embedUrl = "";
      draft.embedAllowed = false;
      draft.provider = "";
      draft.linkInfo = null;
      draft.embedWidth =
        draft.embedHeight =
        draft.mediaWidth =
        draft.mediaHeight =
          0;
      draft.linkTitle = "";
      draft.faviconUrl = "";
      draft.needsAutoThumbnail = true;
      draft.checkedUrl = undefined;
      draft.detailsUrl = undefined;
      draft.thumbnailRevision = (draft.thumbnailRevision || 0) + 1;
    }
    draft.url = url;
    if (
      draft.autoDescription ||
      !els.contentForm.elements.description.value.trim()
    )
      els.contentForm.elements.description.value = url;
    if (!url && draft.autoLabel) els.contentForm.elements.label.value = "";
    this.syncEmbedButton();
    clearTimeout(this.linkMetadataTimer);
    if (url)
      this.linkMetadataTimer = setTimeout(async () => {
        const info = await this.fetchLinkDetails(draft);
        if (
          info &&
          state.pendingDrop === draft &&
          this.currentContentUrl() === url &&
          !draft.autoThumbnailUrls?.has(url)
        ) {
          (draft.autoThumbnailUrls ||= new Set()).add(url);
          // Existing edit thumbnails remain intact until URL changes or the user retrieves explicitly.
          if (
            info.thumbnail &&
            (!state.pendingThumbnail || draft.needsAutoThumbnail)
          ) {
            draft.needsAutoThumbnail = false;
            await this.retrieveLinkThumbnail(false);
          }
        }
      }, 450);
  }

  setEmbedProgress(ratio, message, label = "Embedding progress") {
    $("#submissionMessage").textContent = message;
    $("#submissionProgress").hidden = false;
    $("#submissionProgressBar").style.width = `${Math.round(ratio * 100)}%`;
    $("#submissionProgressAmount").textContent = message;
    $("#submissionProgressPercent").textContent = `${Math.round(ratio * 100)}%`;
    const track = $("#submissionProgress .submission-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  }

  toggleLinkEmbedding() {
    const draft = state.pendingDrop,
      toggle = $("#embedUrlToggle");
    if (!draft || toggle.disabled) return;
    draft.embedPreference = toggle.checked;
    draft.embedUrl =
      toggle.checked && draft.embedAllowed
        ? draft.linkInfo?.embedUrl || ""
        : "";
    draft.provider = draft.embedUrl ? draft.linkInfo?.provider || "" : "";
    this.syncEmbedButton();
  }

  async processContentUrl() {
    if (this.urlProcessing) return this.urlProcessing;
    if (state.pendingDrop?.type !== "link") return;
    const draft = state.pendingDrop,
      url = this.currentContentUrl();
    if (draft.checkedUrl === url || !url) return;
    const run = async () => {
      let kind = this.services.media.mediaUrlKind(url);
      if (kind === "social") {
        draft.checkedUrl = url;
        return;
      }
      if (!kind) {
        try {
          if ((await api.inspectMediaUrl(url)).direct) kind = "direct";
        } catch {}
      }
      if (
        state.pendingDrop !== draft ||
        !els.contentModal.open ||
        this.currentContentUrl() !== url
      )
        return;
      draft.checkedUrl = url;
      if (kind !== "direct") return;
      if (
        !(await this.services.media.askMedia(
          "You're directly linking media. Download and convert to media post?",
        ))
      )
        return;
      this.services.application.beginSubmission("Downloading media...");
      try {
        const file = await api.downloadMedia(url);
        this.services.application.endSubmission();
        const [converted] = await this.services.media.prepareImages([file]);
        if (state.pendingDrop !== draft || !els.contentModal.open) return;
        state.pendingDrop = {
          ...draft,
          type: this.detectFileType(converted),
          files: [converted],
          embedUrl: "",
        };
        state.pendingThumbnail = null;
        this.refreshDynamicFields();
        els.contentTypeEyebrow.textContent = `${state.pendingDrop.type} content`;
        els.contentModalTitle.textContent = `Add ${state.pendingDrop.type}`;
      } catch (error) {
        draft.checkedUrl = undefined;
        this.services.application.toast(error.message, "error");
        return false;
      } finally {
        this.services.application.endSubmission();
      }
    };
    this.urlProcessing = run();
    try {
      return await this.urlProcessing;
    } finally {
      this.urlProcessing = null;
    }
  }

  setContentBusy(busy) {
    state.savingContent = busy;
    this.syncEmbedButton();
    $("#saveContentButton").disabled = busy;
    $("#deleteContentButton").disabled = busy;
    this.services.watchlist?.syncEditor();
  }

  firstVideoFrame(file) {
    if (this.videoPosterCache.has(file)) return this.videoPosterCache.get(file);
    const result = new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const local = file instanceof File;
      const src = local ? URL.createObjectURL(file) : file;
      let finished = false;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener("loadeddata", capture);
        video.removeEventListener("error", fail);
        video.pause();
        video.removeAttribute("src");
        video.load();
        if (local) URL.revokeObjectURL(src);
      };
      const fail = () => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error("Unable to read the first video frame."));
      };
      const capture = async () => {
        if (finished || !video.videoWidth || !video.videoHeight) return;
        finished = true;
        try {
          const scale = Math.min(
            1,
            1920 / video.videoWidth,
            1080 / video.videoHeight,
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const context = canvas.getContext("2d");
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          let poster = new File(
            [await encode(canvas, 0.85)],
            "video-first-frame.jpg",
            { type: "image/jpeg" },
          );
          if (poster.size > IMAGE_LIMIT)
            poster = await this.services.media.compressImage(poster);
          resolve(poster);
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      };
      const timer = setTimeout(fail, 15000);
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.addEventListener("loadeddata", capture);
      video.addEventListener("error", fail);
      video.src = src;
      video.load();
    });
    this.videoPosterCache.set(file, result);
    result.catch(() => this.videoPosterCache.delete(file));
    return result;
  }

  async handleContentSubmit(event) {
    event.preventDefault();
    if (state.savingContent) return;
    this.setContentBusy(true);
    try {
      if ((await this.processContentUrl()) === false) return;
      if (state.pendingDrop?.type === "link") {
        clearTimeout(this.linkMetadataTimer);
        await this.fetchLinkDetails();
      }
      if (state.pendingDrop?.type === "video" && this.pendingFiles()[0]) {
        const draft = state.pendingDrop,
          first = this.pendingFiles()[0];
        const showingStatus = this.services.application.beginSubmission(
          "Preparing video thumbnail...",
        );
        try {
          const poster = await this.firstVideoFrame(first);
          if (state.pendingDrop !== draft || !els.contentModal.open) return;
          state.pendingThumbnail = poster;
        } catch (error) {
          // A playable video remains uploadable even if the browser cannot export a frame.
          if (state.pendingDrop === draft) state.pendingThumbnail = null;
        } finally {
          if (showingStatus) this.services.application.endSubmission();
        }
      }
    } finally {
      this.setContentBusy(false);
    }
    const type = state.pendingDrop?.type;
    if (type === "media") {
      this.services.application.toast(
        "Choose, drop, or paste media first",
        "error",
      );
      return;
    }
    if (
      ["image", "video", "audio", "font", "file"].includes(type) &&
      !this.pendingFiles().length
    ) {
      this.services.application.toast("Choose at least one file", "error");
      return;
    }
    this.commitTagInput();
    const form = new FormData(els.contentForm),
      editingId = state.editingId;
    form.set(
      "section",
      state.tiles.find((tile) => tile.id === editingId)?.section ||
        state.section,
    );
    if (type === "link") {
      form.set("url", normalizeUrl(form.get("url")));
      form.set("embedUrl", state.pendingDrop.embedUrl || "");
      for (const name of [
        "embedWidth",
        "embedHeight",
        "mediaWidth",
        "mediaHeight",
      ])
        form.set(name, String(state.pendingDrop[name] || 0));
      form.set(
        "urlBackground",
        state.pendingDrop.urlBackground ||
          this.services.board.defaultUrlBackground(state.pendingDrop),
      );
      form.set("faviconUrl", state.pendingDrop.faviconUrl || "");
      form.set("linkTitle", state.pendingDrop.linkTitle || "");
    }
    if (type === "text") {
      form.set(
        "backgroundColor",
        String(
          Number.isInteger(state.pendingDrop.backgroundColor)
            ? state.pendingDrop.backgroundColor
            : Math.floor(Math.random() * TILE_COLOR_COUNT),
        ),
      );
      form.set("location", "");
    }
    form.set(
      "existingFiles",
      JSON.stringify(
        this.pendingFiles().filter((file) => typeof file === "string"),
      ),
    );
    this.pendingFiles()
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
    const uploadTotal = [...form.values()].reduce(
      (sum, value) => sum + (value instanceof File ? value.size : 0),
      0,
    );
    const hasUploadFiles = uploadTotal > 0;
    if (
      !this.services.application.beginSubmission(
        editingId ? "Saving..." : "Adding...",
        { cancelable: hasUploadFiles },
      )
    )
      return;
    if (hasUploadFiles)
      this.services.application.updateSubmissionProgress({
        loaded: 0,
        total: uploadTotal,
        ratio: 0,
      });
    this.setContentBusy(true);
    state.activeUploadCanceled = false;
    const controller = hasUploadFiles ? new AbortController() : null;
    state.activeUploadController = controller;
    $("#submissionCancel").disabled = false;
    try {
      const uploadOptions = controller
        ? {
            signal: controller.signal,
            onProgress: this.services.application.updateSubmissionProgress,
          }
        : {};
      const tile = await (editingId
        ? api.updateTile(form, uploadOptions)
        : api.createTile(form, uploadOptions));
      if (editingId)
        state.tiles = state.tiles.map((t) => (t.id === editingId ? tile : t));
      else state.tiles.unshift(tile);
      els.contentModal.close();
      state.pendingDrop = null;
      this.revokePreviewUrls();
      this.services.board.renderTags();
      this.services.board.renderTiles();
      this.services.collections.renderBookmarks();
      document.dispatchEvent(
        new CustomEvent("hub:content-change", {
          detail: { action: editingId ? "update" : "create", tile },
        }),
      );
      this.services.application.toast(
        editingId ? "Content updated" : "Content added",
      );
    } catch (error) {
      if (error?.name === "AbortError" || state.activeUploadCanceled)
        this.services.application.toast("Upload canceled");
      else this.services.application.toast(error.message, "error");
    } finally {
      this.setContentBusy(false);
      this.services.application.endSubmission();
    }
  }

  async deleteEditingContent() {
    const id = state.editingId;
    if (
      !id ||
      state.savingContent ||
      !confirm("Delete this content and remove it from all collections?")
    )
      return;
    this.setContentBusy(true);
    try {
      await api.deleteTile(id);
      state.tiles = state.tiles.filter((t) => t.id !== id);
      state.collections.forEach(
        (c) => (c.items = c.items.filter((item) => item !== id)),
      );
      els.contentModal.close();
      this.services.board.renderTiles();
      this.services.collections.renderBookmarks();
      document.dispatchEvent(
        new CustomEvent("hub:content-change", {
          detail: { action: "delete", id },
        }),
      );
      this.services.application.toast("Content deleted");
    } catch (error) {
      this.services.application.toast(error.message, "error");
    } finally {
      this.setContentBusy(false);
    }
  }

  handleModalImages(images) {
    return this.handleModalFiles(images);
  }

  async handleModalFiles(files) {
    const draft = state.pendingDrop;
    try {
      files = await this.services.media.prepareImages(files);
    } catch (error) {
      this.services.application.toast(error.message, "error");
      return;
    }
    if (!draft || state.pendingDrop !== draft || !els.contentModal.open) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (["text", "link", "entry"].includes(state.pendingDrop.type)) {
      if (images[0]) {
        state.pendingDrop.backgroundColor = null;
        state.pendingThumbnail = images[0];
        this.refreshDynamicFields();
      }
      return;
    }
    if (state.pendingDrop.type === "image") {
      if (images.length) {
        state.pendingDrop.files.push(...images);
        this.refreshDynamicFields();
      } else
        this.services.application.toast(
          "Only images can be added to this gallery",
          "error",
        );
      return;
    }
    if (state.pendingDrop.type === "media") {
      const detected = this.detectFiles(files);
      if (detected) {
        state.pendingDrop = detected;
        this.refreshDynamicFields();
      }
      return;
    }
    if (images.length) {
      state.pendingDrop.backgroundColor = null;
      state.pendingThumbnail = images[0];
      this.refreshDynamicFields();
      return;
    }
    const matching = files.filter(
      (f) => this.detectFileType(f) === state.pendingDrop.type,
    );
    if (matching.length) {
      state.pendingDrop.files.push(...matching);
      this.refreshDynamicFields();
    } else
      this.services.application.toast(
        "Choose a file matching this content type",
        "error",
      );
  }

  async handleClick(e) {
    const sizeButton = e.target.closest("[data-tile-size]");
    if (sizeButton) {
      els.contentForm.elements.size.value = sizeButton.dataset.tileSize;
      this.syncTileControls();
      return;
    }
    if (e.target.closest("#orientationButton")) {
      if (this.services.tabs.current.orientation) return;
      const field = els.contentForm.elements.orientation;
      field.value = field.value === "portrait" ? "landscape" : "portrait";
      this.syncTileControls();
      return;
    }
    const background = e.target.closest("[data-url-background]");
    if (background && state.pendingDrop?.type === "link") {
      state.pendingDrop.thumbnailRevision =
        (state.pendingDrop.thumbnailRevision || 0) + 1;
      (state.pendingDrop.autoThumbnailUrls ||= new Set()).add(
        this.currentContentUrl(),
      );
      state.pendingDrop.urlBackground = background.dataset.urlBackground;
      state.pendingThumbnail = null;
      this.refreshDynamicFields();
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
        this.openContentModal({ type: "media", files: [] });
      } else if (choice.dataset.contentChoice === "link") {
        this.openContentModal({ type: "link", url: "" });
      } else {
        this.openContentModal({ type: "text", text: "" });
      }
      return;
    }
    const removePending = e.target.closest("[data-remove-pending-file]");
    if (removePending) {
      state.pendingDrop.files.splice(
        Number(removePending.dataset.removePendingFile),
        1,
      );
      this.refreshDynamicFields();
      return;
    }
    if (e.target.closest("[data-remove-thumbnail]")) {
      state.pendingDrop.thumbnailRevision =
        (state.pendingDrop.thumbnailRevision || 0) + 1;
      (state.pendingDrop.autoThumbnailUrls ||= new Set()).add(
        this.currentContentUrl(),
      );
      state.pendingThumbnail = null;
      this.refreshDynamicFields();
      return;
    }
  }

  bindEvents() {
    $("#deleteContentButton").addEventListener(
      "click",
      this.deleteEditingContent,
    );
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
        ALIGN_ORDER[
          (ALIGN_ORDER.indexOf(input.value) + 1) % ALIGN_ORDER.length
        ];
      input.value = next;
      this.updateTextPreview();
    });
    this.initScrubInputs();
    window.addEventListener("resize", () => {
      this.autosizeTextPreview();
      if (els.mediaViewer.open) this.services.viewer.applyViewerTransform();
    });
    document.addEventListener("keydown", (e) => {
      if (
        e.target === els.tagInput &&
        (e.key === "Enter" || e.key === "," || e.key === " ")
      ) {
        e.preventDefault();
        this.commitTagInput();
      } else if (
        e.target === els.tagInput &&
        e.key === "Tab" &&
        !e.shiftKey &&
        els.tagInput.value.trim()
      ) {
        // Only intercept Tab when there is a tag to complete; otherwise move focus normally.
        e.preventDefault();
        this.commitTagInput();
      }
      const tile = e.target.closest?.("[data-tile-id],[data-bookmark-id]");
      if (tile && e.target === tile && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        this.services.viewer.activateTile(
          tile.dataset.tileId || tile.dataset.bookmarkId,
        );
      }
    });
    document.addEventListener("change", async (e) => {
      if (e.target.id === "embedUrlToggle") {
        this.toggleLinkEmbedding();
        return;
      }
      if (e.target.matches('#contentForm [name="url"]')) {
        this.contentUrlChanged();
        await this.processContentUrl();
        return;
      }
      let selectedFiles = [...(e.target.files || [])];
      if (
        [
          "galleryFileInput",
          "thumbnailPickerInput",
          "replacementFileInput",
        ].includes(e.target.id)
      ) {
        try {
          selectedFiles =
            await this.services.media.prepareImages(selectedFiles);
        } catch (error) {
          this.services.application.toast(error.message, "error");
          return;
        }
      }
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
          this.registerFontFaces();
          this.refreshFontSelect(font.family);
          if (document.fonts?.load)
            await document.fonts.load(`16px '${font.name}'`).catch(() => {});
          this.updateTextPreview();
          this.services.application.toast(`Font "${font.name}" added`);
        } catch (error) {
          this.services.application.toast(error.message, "error");
        } finally {
          button?.removeAttribute("disabled");
        }
        return;
      }
      if (e.target?.id === "topLinkImageInput") {
        const file = e.target.files?.[0];
        if (file?.type.startsWith("image/")) this.setTopLinkImage(file);
        return;
      }
      if (e.target?.id === "galleryFileInput") {
        state.pendingDrop.files.push(
          ...selectedFiles.filter(
            (f) =>
              state.pendingDrop.type === "file" ||
              this.detectFileType(f) === state.pendingDrop.type,
          ),
        );
        this.refreshDynamicFields();
        return;
      }
      if (e.target?.id === "thumbnailPickerInput" && e.target.files?.[0]) {
        state.pendingDrop.thumbnailRevision =
          (state.pendingDrop.thumbnailRevision || 0) + 1;
        (state.pendingDrop.autoThumbnailUrls ||= new Set()).add(
          this.currentContentUrl(),
        );
        state.pendingDrop.backgroundColor = null;
        state.pendingThumbnail = selectedFiles[0];
        this.refreshDynamicFields();
        return;
      }
      if (e.target?.id === "replacementFileInput" && e.target.files?.length) {
        state.pendingDrop.files = selectedFiles;
        this.refreshDynamicFields();
        return;
      }
      if (e.target?.type === "file") {
        const label = document.querySelector(
          `[data-file-name="${e.target.id}"]`,
        );
        if (label)
          label.textContent = e.target.files?.length
            ? [...e.target.files].map((f) => f.name).join(", ")
            : "No file selected";
      }
      if (
        state.pendingDrop?.type === "text" &&
        e.target.closest("#contentForm")
      )
        this.updateTextPreview();
    });
    els.contentForm.addEventListener("input", (e) => {
      if (state.pendingDrop?.type === "link") {
        if (e.target.name === "url") this.contentUrlChanged();
        if (e.target.name === "label")
          state.pendingDrop.autoLabel = !e.target.value.trim();
        if (e.target.name === "description")
          state.pendingDrop.autoDescription = !e.target.value.trim();
      }
      if (
        state.pendingDrop?.type === "text" &&
        e.target.matches('[name="text"],[name="fontSize"]')
      )
        this.updateTextPreview();
    });
    els.contentAddButton.addEventListener("click", () => {
      if (this.services.tabs.current.editor === "entry")
        this.openContentModal({ type: "entry", files: [] });
      else els.contentTypeModal.showModal();
    });
    els.contentFilePicker.addEventListener("change", async () => {
      const pending = this.detectFiles(els.contentFilePicker.files);
      if (!pending) return;
      if (els.contentModal.open && state.pendingDrop?.type === "media") {
        await this.handleModalFiles([...els.contentFilePicker.files]);
      } else await this.openContentModal(pending);
      els.contentFilePicker.value = "";
    });
    els.contentForm.addEventListener("submit", this.handleContentSubmit);
    els.contentModal.addEventListener("dragover", (e) => {
      if (!state.pendingDrop) return;
      e.preventDefault();
      e.stopPropagation();
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
      this.handleModalFiles(files);
    });
    document.addEventListener("paste", (e) => {
      if (e.target.matches?.('#contentForm [name="url"]')) {
        setTimeout(() => {
          this.contentUrlChanged();
          this.processContentUrl();
        }, 0);
        return;
      }
      if (
        !document.querySelector("dialog[open]") &&
        !e.target.closest?.("input,textarea,[contenteditable]")
      ) {
        const value = (e.clipboardData?.getData("text/plain") || "").trim();
        if (/^https?:\/\//i.test(value)) {
          e.preventDefault();
          this.openContentModal({ type: "link", url: value });
          return;
        }
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) {
          e.preventDefault();
          this.openContentModal(this.detectFiles(files));
          return;
        }
      }
      if (
        !els.contentModal.open ||
        !state.pendingDrop ||
        ![
          "media",
          "image",
          "video",
          "audio",
          "font",
          "file",
          "text",
          "link",
          "entry",
        ].includes(state.pendingDrop.type)
      )
        return;
      const images = [...(e.clipboardData?.files || [])].filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!images.length) return;
      e.preventDefault();
      this.handleModalImages(images);
    });
    els.contentModal.addEventListener("close", () => {
      els.contentModal
        .querySelector(".modal-card")
        ?.classList.remove("is-modal-drop-target");
      this.videoPosterCache.clear();
      clearTimeout(this.linkMetadataTimer);
      this.revokePreviewUrls();
      state.pendingTags = [];
      state.pendingThumbnail = null;
    });
    document.addEventListener("click", this.handleClick);
  }
}
