const API_URL = 'api.php';

async function request(action, options = {}) {
  const { method = 'GET', body, params = {} } = options;
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers = { Accept: 'application/json' };
  if (typeof body === 'string') headers['Content-Type'] = 'application/json; charset=utf-8';
  const response = await fetch(url, { method, body, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || (response.status === 403
      ? 'The server denied this save (403). Ask the host to check access and security rules for hub/api.php.'
      : `Request failed (${response.status})`));
  }
  return payload.data ?? payload;
}

// Send tile metadata as a structured object; keep binary uploads multipart.
function tileRequest(action, form) {
  const metadata = {}, uploads = new FormData();
  let hasFiles = false;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') metadata[name] = value;
    else if (value.size || value.name) { uploads.append(name, value); hasFiles = true; }
  }
  if (!hasFiles) return request(action, {method: 'POST', body: JSON.stringify(metadata)});
  uploads.set('metadata', JSON.stringify(metadata));
  return request(action, {method: 'POST', body: uploads});
}

export const api = {
  inspectMetadata: (file) => {
    const form = new FormData(); form.append('file', file);
    return request('metadata.inspect', {method: 'POST', body: form});
  },
  bootstrap: () => request('bootstrap'),
  saveSettings: (settings) => request('settings.update', {
    method: 'POST',
    body: JSON.stringify(settings),
  }),
  createTile: (formData) => tileRequest('tiles.create', formData),
  updateTile: (formData) => tileRequest('tiles.update', formData),
  downloadContent: async () => {
    const response = await fetch(new URL('api.php?action=content.download', window.location.href), {credentials: 'same-origin'});
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Download failed (${response.status})`);
    }
    if (!(response.headers.get('Content-Type') || '').includes('application/zip')) throw new Error('The server did not return a ZIP backup.');
    return response.blob();
  },
  uploadFont: (file, name = '') => {
    const form = new FormData();
    form.set('font', file, file.name);
    if (name) form.set('name', name);
    return request('fonts.upload', { method: 'POST', body: form });
  },
  deleteTile: (id) => request('tiles.delete', { method: 'POST', body: JSON.stringify({ id }) }),
  createTopLink: (formData) => request('toplinks.create', { method: 'POST', body: formData }),
  updateTopLink: (formData) => request('toplinks.update', { method: 'POST', body: formData }),
  deleteTopLink: (id) => request('toplinks.delete', { method: 'POST', body: JSON.stringify({ id }) }),
  saveBookmarks: (ids) => request('bookmarks.update', { method: 'POST', body: JSON.stringify({ ids }) }),
  saveCollections: (collections) => request('collections.update', { method: 'POST', body: JSON.stringify({ collections }) }),
};
