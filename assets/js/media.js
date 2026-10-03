export const IMAGE_LIMIT = 2 * 1024 * 1024;

export function mediaUrlKind(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (/\.(jpe?g|png|webp|gif|avif|bmp|svg|mp4|webm|mov|m4v|ogv)$/i.test(url.pathname)) return 'direct';
    if (/^(www\.|m\.|vm\.|vt\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|tiktok\.com|instagram\.com)$/.test(url.hostname)) return 'social';
  } catch {}
  return null;
}

const encode = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to convert image to JPG.')), 'image/jpeg', quality));

export async function compressImage(file, progress = () => {}) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const draw = () => {
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    // Convert format first, resize second, and reduce quality last.
    draw();
    let blob = file.type === 'image/jpeg' ? file : await encode(canvas, 1);
    progress(.3, 'Converted to JPG');
    const scale = Math.min(1, 1920 / canvas.width, 1080 / canvas.height);
    if (scale < 1) {
      canvas.width = Math.max(1, Math.round(canvas.width * scale));
      canvas.height = Math.max(1, Math.round(canvas.height * scale));
      draw();
      blob = await encode(canvas, 1);
    }
    progress(.6, 'Resolution checked');
    for (let quality = .9; blob.size > IMAGE_LIMIT && quality >= .1; quality -= .1) {
      blob = await encode(canvas, quality);
      progress(.6 + (.9 - quality) / .8 * .35, 'Reducing JPG quality');
    }
    if (blob.size > IMAGE_LIMIT) throw new Error(`${file.name} could not be compressed below 2 MB.`);
    progress(1, 'Complete');
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch (error) {
    throw new Error(`Cannot compress ${file.name}: ${error.message}`);
  } finally { URL.revokeObjectURL(url); }
}

export function askMedia(message, names = []) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    const card = document.createElement('div'); card.className = 'modal-card modal-card--confirm';
    const heading = document.createElement('h2'); heading.textContent = message; card.append(heading);
    if (names.length) {
      const list = document.createElement('ul');
      names.forEach(name => { const li = document.createElement('li'); li.textContent = name; list.append(li); });
      card.append(list);
    }
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    for (const [label, value] of [['No', false], ['Yes', true]]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `btn btn--${value ? 'primary' : 'ghost'}`; button.textContent = label;
      button.onclick = () => { dialog.returnValue = value ? 'yes' : 'no'; dialog.close(); }; actions.append(button);
    }
    card.append(actions); dialog.append(card); document.body.append(dialog);
    dialog.addEventListener('close', () => { const yes = dialog.returnValue === 'yes'; dialog.remove(); resolve(yes); }, { once: true });
    dialog.showModal();
  });
}

// Serialize prompts so a batch never opens competing dialogs.
let preparation = Promise.resolve();
export function prepareImages(files) {
  const run = async () => {
    const oversized = files.filter(file => file instanceof File && file.type.startsWith('image/') && file.size > IMAGE_LIMIT);
    if (!oversized.length || !await askMedia('These images are over 5mb, would you like to compress?', oversized.map(file => file.name))) return files;
    const dialog = document.createElement('dialog'); dialog.className = 'modal';
    dialog.innerHTML = '<div class="modal-card modal-card--confirm"><h2>Compressing images</h2><p role="status" aria-live="polite"></p><progress max="1" value="0" aria-label="Image conversion progress"></progress></div>';
    dialog.addEventListener('cancel', event => event.preventDefault()); document.body.append(dialog); dialog.showModal();
    try {
      const converted = new Map();
      for (let i = 0; i < oversized.length; i++) {
        const file = oversized[i];
        converted.set(file, await compressImage(file, (ratio, stage) => {
          dialog.querySelector('progress').value = (i + ratio) / oversized.length;
          dialog.querySelector('p').textContent = `${i + 1} / ${oversized.length}: ${file.name} — ${stage}`;
        }));
      }
      return files.map(file => converted.get(file) || file);
    } finally { dialog.close(); dialog.remove(); }
  };
  const result = preparation.then(run); preparation = result.catch(() => {}); return result;
}
