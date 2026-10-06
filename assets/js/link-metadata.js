/** Strip Instagram's social metadata wrapper without truncating stored captions. */
export function isInstagramLink(value = {}) {
  if (value.provider === "instagram") return true;
  try {
    return /^(?:www\.|m\.)?instagram\.com$/i.test(new URL(value.url || value).hostname);
  } catch { return false; }
}

export function cleanInstagramText(value) {
  let text = String(value || "").trim();
  // Metadata may wrap the entire value, the caption, or both in quotes.
  const unquote = (s) => s.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/gu, "");
  text = unquote(text);
  text = text.replace(/^(?=[\s\S]*\b(?:likes?|comments?|views?)\b)[\d\s.,kmb]+\s+(?:likes?|comments?|views?)[\s\S]*?\s[-–—]\s+@?[\w.]+\s+on\s+[^:]+:\s*/iu, "");
  text = text.replace(/^[^\n:]+\s+on Instagram\s*:\s*/iu, "");
  text = unquote(text)
    .replace(/(^|[^\p{L}\p{M}\p{N}_])(?:[@#][\p{L}\p{M}\p{N}_.]+)+/gu, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,;!?])/g, "$1")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return unquote(text).trim();
}

export function cleanLinkInfo(info, url) {
  if (!info || !isInstagramLink({url, provider: info.provider})) return info;
  return {...info, title: cleanInstagramText(info.title), description: cleanInstagramText(info.description)};
}

export function cleanLinkTile(tile) {
  if (tile?.type !== "link" || !isInstagramLink(tile)) return tile;
  return {...tile, label: cleanInstagramText(tile.label), description: cleanInstagramText(tile.description), linkTitle: cleanInstagramText(tile.linkTitle)};
}
