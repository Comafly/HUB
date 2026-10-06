import { Feature } from "./feature.js?v=20261007-watchlist-controls";
import { IMAGE_LIMIT, encode, escapeHtml } from "./context.js?v=20261007-watchlist-controls";

export class MediaManager extends Feature {
  constructor(services) {
    super(services);
    this.preparation = Promise.resolve();
  }

  mediaUrlKind(value) {
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (
        /\.(jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|mov|m4v|ogv)$/i.test(
          url.pathname,
        )
      )
        return "direct";
      if (
        /^(www\.|m\.|vm\.|vt\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com|facebook\.com|fb\.watch)$/.test(
          url.hostname,
        )
      )
        return "social";
    } catch {}
    return null;
  }

  async compressImage(file, progress = () => {}) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const draw = () => {
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      // Convert format first, resize second, and reduce quality last.
      draw();
      let blob = file.type === "image/jpeg" ? file : await encode(canvas, 1);
      progress(0.3, "Converted to JPG");
      const scale = Math.min(1, 1920 / canvas.width, 1080 / canvas.height);
      if (scale < 1) {
        canvas.width = Math.max(1, Math.round(canvas.width * scale));
        canvas.height = Math.max(1, Math.round(canvas.height * scale));
        draw();
        blob = await encode(canvas, 1);
      }
      progress(0.6, "Resolution checked");
      for (
        let quality = 0.9;
        blob.size > IMAGE_LIMIT && quality >= 0.1;
        quality -= 0.1
      ) {
        blob = await encode(canvas, quality);
        progress(0.6 + ((0.9 - quality) / 0.8) * 0.35, "Reducing JPG quality");
      }
      if (blob.size > IMAGE_LIMIT)
        throw new Error(`${file.name} could not be compressed below 2 MB.`);
      progress(1, "Complete");
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } catch (error) {
      throw new Error(`Cannot compress ${file.name}: ${error.message}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  askMedia(message, names = []) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "modal";
      const card = document.createElement("div");
      card.className = "modal-card modal-card--confirm";
      const heading = document.createElement("h2");
      heading.textContent = message;
      card.append(heading);
      if (names.length) {
        const list = document.createElement("ul");
        names.forEach((name) => {
          const li = document.createElement("li");
          li.textContent = name;
          list.append(li);
        });
        card.append(list);
      }
      const actions = document.createElement("div");
      actions.className = "modal-actions";
      for (const [label, value] of [
        ["No", false],
        ["Yes", true],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn btn--${value ? "primary" : "ghost"}`;
        button.textContent = label;
        button.onclick = () => {
          dialog.returnValue = value ? "yes" : "no";
          dialog.close();
        };
        actions.append(button);
      }
      card.append(actions);
      dialog.append(card);
      document.body.append(dialog);
      dialog.addEventListener(
        "close",
        () => {
          const yes = dialog.returnValue === "yes";
          dialog.remove();
          resolve(yes);
        },
        { once: true },
      );
      dialog.showModal();
    });
  }

  chooseImagesToCompress(files) {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "modal compression-picker";
      const previews = files.map((file) => URL.createObjectURL(file));
      dialog.innerHTML = `<div class="modal-card modal-card--confirm"><h2>These images are over 2 MB. Would you like to compress them?</h2><div class="compression-image-list">${files.map((file, i) => `<label class="compression-image"><img src="${escapeHtml(previews[i])}" alt=""><span>${escapeHtml(file.name)}</span><input type="checkbox" checked data-compress-index="${i}" aria-label="Compress ${escapeHtml(file.name)}"></label>`).join("")}</div><div class="modal-actions"><button type="button" class="btn btn--ghost" data-compression-no>No</button><button type="button" class="btn btn--primary" data-compression-yes>Yes</button></div></div>`;
      let selected = [];
      dialog.querySelector("[data-compression-no]").onclick = () =>
        dialog.close();
      dialog.querySelector("[data-compression-yes]").onclick = () => {
        selected = [
          ...dialog.querySelectorAll("[data-compress-index]:checked"),
        ].map((input) => files[Number(input.dataset.compressIndex)]);
        dialog.close();
      };
      dialog.addEventListener(
        "close",
        () => {
          previews.forEach((url) => URL.revokeObjectURL(url));
          dialog.remove();
          resolve(selected);
        },
        { once: true },
      );
      document.body.append(dialog);
      dialog.showModal();
    });
  }

  prepareImages(files) {
    const run = async () => {
      let oversized = files.filter(
        (file) =>
          file instanceof File &&
          file.type.startsWith("image/") &&
          file.size > IMAGE_LIMIT,
      );
      if (!oversized.length) return files;
      oversized = await this.chooseImagesToCompress(oversized);
      if (!oversized.length) return files;
      if (
        !this.services.application.beginSubmission(
          "Compressing 1 / " + oversized.length,
        )
      )
        throw new Error("Another operation is in progress. Please try again.");
      const started = performance.now();
      let completed = 0,
        current = 1;
      const update = () =>
        this.services.editor.setEmbedProgress(
          Math.min(completed, (performance.now() - started) / 3000),
          `Compressing ${current} / ${oversized.length}`,
          "Compression progress",
        );
      update();
      const timer = setInterval(update, 50);
      try {
        const converted = new Map();
        for (let i = 0; i < oversized.length; i++) {
          current = i + 1;
          const file = oversized[i];
          update();
          converted.set(
            file,
            await this.compressImage(file, (ratio) => {
              completed = (i + ratio) / oversized.length;
              update();
            }),
          );
        }
        return files.map((file) => converted.get(file) || file);
      } finally {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, Math.ceil(3000 - (performance.now() - started)) + 1),
          ),
        );
        this.services.editor.setEmbedProgress(
          completed,
          `Compressing ${current} / ${oversized.length}`,
          "Compression progress",
        );
        clearInterval(timer);
        this.services.application.endSubmission();
      }
    };
    const result = this.preparation.then(run);
    this.preparation = result.catch(() => {});
    return result;
  }

  bindEvents() {}
}
