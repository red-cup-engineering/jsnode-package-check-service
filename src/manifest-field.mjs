export function withField(text, key, value) {
  const manifest = JSON.parse(text);
  if (Object.hasOwn(manifest, key)) return { text, changed: false };
  const indent = /^([ \t]+)"/mu.exec(text)?.[1] ?? "  ";
  const block = JSON.stringify(value, null, indent).split("\n").map((line, index) => (index === 0 ? line : `${indent}${line}`)).join("\n");
  for (const anchor of ["description", "version", "name"]) {
    const line = new RegExp(`^${indent}"${anchor}": .*,\\r?$`, "mu").exec(text);
    if (!line) continue;
    const at = line.index + line[0].length;
    const inserted = `${text.slice(0, at)}\n${indent}${JSON.stringify(key)}: ${block},${text.slice(at)}`;
    try { if (JSON.stringify(JSON.parse(inserted)[key]) === JSON.stringify(value)) return { text: inserted, changed: true }; } catch {}
  }
  const trailing = text.endsWith("\n") ? "\n" : "";
  return { text: `${JSON.stringify({ ...manifest, [key]: value }, null, indent)}${trailing}`, changed: true };
}

export function withRepositoryField(text, { url, directory }) {
  return withField(text, "repository", { type: "git", url: `git+${url}`, ...(directory ? { directory } : {}) });
}
