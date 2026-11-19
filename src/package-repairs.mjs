import { existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { basename, dirname, join, relative } from "node:path";
import { parseJavaScript } from "@red-cup-engineering/javascript-parser-service";
import { readJavaScriptModuleRequestSites } from "@red-cup-engineering/javascript-parser-service/module-reference-sites";
import { knowledgeReading } from "@red-cup-engineering/signcell";
import { scriptReferences } from "./check-jsnode-package.mjs";
import { withField, withRepositoryField } from "./manifest-field.mjs";
import { decodePointer, encodePointer } from "./observation.mjs";
import { enclosingRepositories, gitmodulesDeclarations } from "./package-identity.mjs";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const keyOf = property => property.key.type === "Literal" ? String(property.key.value) : property.key.name;
const parentOf = at => at.slice(0, at.lastIndexOf("/"));
const collapsible = at => at === "/bin" || at.split("/").length > 2;
const literal = (node, text) => ({ start: node.start - 1, end: node.end - 1, text: JSON.stringify(text) });

const syntax = source => parseJavaScript(`(${source})`).body[0].expression;

function members(container, at) {
  return container.type === "ObjectExpression"
    ? container.properties.map(entry => ({ slot: entry, at: `${at}/${encodePointer(keyOf(entry))}` }))
    : container.elements.map((entry, index) => ({ slot: entry, at: `${at}/${index}` }));
}

function locate(root, at) {
  let node = root;
  for (const segment of at.split("/").slice(1).map(decodePointer)) {
    node = node?.type === "ObjectExpression" ? node.properties.find(entry => keyOf(entry) === segment)?.value
      : node?.type === "ArrayExpression" ? node.elements[Number(segment)] : undefined;
    if (!node) return null;
  }
  return node;
}

function removalEdits(root, pointers) {
  const removing = new Set(pointers);
  for (let changed = true; changed;) {
    changed = false;
    for (const parent of new Set([...removing].map(parentOf))) {
      const container = collapsible(parent) ? locate(root, parent) : null;
      const inside = container ? members(container, parent).map(({ at }) => at) : [];
      if (inside.length && inside.every(at => removing.has(at))) { inside.forEach(at => removing.delete(at)); removing.add(parent); changed = true; }
    }
  }
  const removed = [...removing].filter(at => locate(root, at) && ![...removing].some(other => at.startsWith(`${other}/`)));
  const edits = [];
  for (const parent of new Set(removed.map(parentOf))) {
    const container = parent ? locate(root, parent) : root;
    const slots = members(container, parent);
    for (let first = 0; first < slots.length; first += 1) {
      if (!removed.includes(slots[first].at)) continue;
      let last = first;
      while (last + 1 < slots.length && removed.includes(slots[last + 1].at)) last += 1;
      const [start, end] = last + 1 < slots.length ? [slots[first].slot.start, slots[last + 1].slot.start]
        : first > 0 ? [slots[first - 1].slot.end, slots[last].slot.end] : [container.start + 1, container.end - 1];
      edits.push({ start: start - 1, end: end - 1, text: "" });
      first = last;
    }
  }
  return { removed, edits };
}

function scriptValue(script, dead) {
  if (/\|\||;|(?:^|[^|])\|(?:[^|]|$)/u.test(script)) return undefined;
  const kept = script.split(/\s*&&\s*/u).flatMap(clause => {
    const references = scriptReferences(clause);
    const gone = references.filter(reference => dead.has(reference.path ?? `run ${reference.run}`));
    if (gone.length === 0) return [clause];
    if (!references.some(reference => reference.path !== undefined && !gone.includes(reference))) return [];
    return [gone.reduce((text, { path }) => text.split(/\s+/u).filter(token => token.replace(/^(['"])(.*)\1$/u, "$2") !== path).join(" "), clause)];
  });
  return kept.length ? kept.join(" && ") : null;
}

function spanEdit(before, after) {
  let start = 0, tail = 0;
  while (start < before.length && before[start] === after[start]) start += 1;
  while (tail < Math.min(before.length, after.length) - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return { start, end: before.length - tail, text: after.slice(start, after.length - tail) };
}

function twinOf(dir, target) {
  const match = /^(\.\/)?dist\/(.+)\.([cm]?js)$/u.exec(target);
  if (!match) return null;
  const twin = [`src/${match[2]}.mjs`, `src/${match[2]}.${match[3]}`].find(path => existsSync(join(dir, path)));
  return twin === undefined ? null : `${match[1] ?? ""}${twin}`;
}

export function manifestRepair({ source, dir, cells }) {
  const root = syntax(source);
  const manifest = JSON.parse(source);
  const actions = [], edits = [], renames = [];
  const active = cells.filter(at => knowledgeReading(at) === "active");
  const removals = new Set(), deadScripts = new Map(), repoints = [];
  for (const at of active.filter(({ predicate }) => predicate === "target-exists")) {
    for (const { at: where, observed } of at.against) {
      if (where.startsWith("/scripts/")) {
        const name = decodePointer(where.slice("/scripts/".length));
        deadScripts.set(name, (deadScripts.get(name) ?? new Set()).add(observed.path ?? `run ${observed.run}`));
        continue;
      }
      const twin = typeof observed.target === "string" ? twinOf(dir, observed.target) : null;
      if (twin !== null) repoints.push({ where, from: observed.target, to: twin });
      else removals.add(where);
    }
  }
  const scripts = { ...(manifest.scripts ?? {}) };
  for (let pending = [...deadScripts]; pending.length;) {
    const removedNow = [];
    for (const [name, dead] of pending) {
      if (typeof scripts[name] !== "string") continue;
      const value = scriptValue(scripts[name], dead);
      if (value === undefined) { actions.push({ action: "keep-script", at: `/scripts/${encodePointer(name)}`, because: "not a plain && chain" }); continue; }
      if (value === null) { delete scripts[name]; removedNow.push(name); } else scripts[name] = value;
    }
    pending = Object.entries(scripts).flatMap(([name, script]) => {
      const dead = new Set(scriptReferences(script).filter(({ run }) => removedNow.includes(run)).map(({ run }) => `run ${run}`));
      return dead.size ? [[name, dead]] : [];
    });
  }
  for (const [name, value] of Object.entries(manifest.scripts ?? {})) {
    const at = `/scripts/${encodePointer(name)}`;
    if (!Object.hasOwn(scripts, name)) { removals.add(at); actions.push({ action: "remove", at, original: value }); }
    else if (scripts[name] !== value) { edits.push(literal(locate(root, at), scripts[name])); actions.push({ action: "rewrite", at, original: value, text: scripts[name] }); }
  }
  const removal = removalEdits(root, [...removals]);
  for (const at of removal.removed.filter(at => !at.startsWith("/scripts/"))) actions.push({ action: "remove", at, original: manifestValue(manifest, at) });
  for (const { where, from, to } of repoints) {
    if (removal.removed.some(at => where === at || where.startsWith(`${at}/`))) continue;
    edits.push(literal(locate(root, where), to));
    actions.push({ action: "repoint", at: where, original: from, text: to });
  }
  edits.push(...removal.edits);
  const reading = predicate => cells.find(at => at.predicate === predicate);
  const leaf = reading("name-leaf-is-folder"), scope = reading("scope-is-house-organization"), url = reading("repository-url-names-folder");
  if ([leaf, scope].some(at => at && knowledgeReading(at) === "active") && typeof manifest.name === "string") {
    const owner = scope && scope.object !== null ? scope.object : manifest.name.startsWith("@") ? manifest.name.split("/")[0] : null;
    const name = owner === null ? basename(dir) : `${owner}/${basename(dir)}`;
    edits.push(literal(locate(root, "/name"), name));
    actions.push({ action: "rename-package", at: "/name", original: manifest.name, text: name });
    renames.push({ from: manifest.name, to: name });
  }
  if (url && knowledgeReading(url) === "active") {
    if (!existsSync(join(dir, ".git"))) actions.push({ action: "plan-repository-url", at: "/repository", text: url.object, because: "the package directory is not its own repository" });
    else if (manifest.repository === undefined) {
      edits.push(spanEdit(source, withRepositoryField(source, { url: url.object.replace(/^git\+/u, "") }).text));
      actions.push({ action: "insert", at: "/repository", text: url.object });
    } else {
      const at = typeof manifest.repository === "string" ? "/repository" : "/repository/url";
      const node = locate(root, at);
      if (node) { edits.push(literal(node, url.object)); actions.push({ action: "rewrite", at, original: manifestValue(manifest, at), text: url.object }); }
    }
  }
  return { edits: edits.map(edit => ({ ...edit, original: source.slice(edit.start, edit.end) })), actions, renames };
}

function manifestValue(manifest, at) {
  return at.split("/").slice(1).map(decodePointer).reduce((value, key) => value?.[key], manifest);
}

export function manifestFieldEdits(source, { remove = [], set = {} }) {
  const { edits } = removalEdits(syntax(source), remove.map(field => `/${encodePointer(field)}`));
  let text = [...edits].sort((left, right) => right.start - left.start).reduce((at, { start, end, text: inserted }) => at.slice(0, start) + inserted + at.slice(end), source);
  for (const [key, value] of Object.entries(set)) text = withField(text, key, value).text;
  if (text === source) return [];
  const edit = spanEdit(source, text);
  return [{ ...edit, original: source.slice(edit.start, edit.end) }];
}

export function repositoryPlan({ root, dir, cells }) {
  const plans = [];
  const prefix = cells.find(at => at.predicate === "free-of-internal-prefix");
  if (prefix && knowledgeReading(prefix) === "active" && /^internal-/u.test(basename(dir))) {
    const to = basename(dir).replace(/^internal-(?:561-group-)?/u, "561-group-");
    const [parent] = enclosingRepositories(root, dir);
    plans.push({ plan: "rename-folder", from: relative(root, dir), to: relative(root, join(dirname(dir), to)),
      repository: existsSync(join(dir, ".git")) ? { from: basename(dir), to } : null,
      gitmodules: parent && gitmodulesDeclarations(parent).declarations.some(({ path }) => path === relative(parent, dir)) ? relative(root, join(parent, ".gitmodules")) : null });
  }
  const mount = cells.find(at => at.predicate === "mount-declared-by-parent");
  if (mount && knowledgeReading(mount) === "active")
    plans.push({ plan: "declare-mount", in: mount.against[0].path, path: relative(root, dir), declaredBy: mount.against[0].observed.declaredBy });
  return plans;
}

export function importerEdits(path, source, renames) {
  const text = /\.[cm]?ts$/u.test(path) ? stripTypeScriptTypes(source) : source;
  return readJavaScriptModuleRequestSites(parseJavaScript(text)).flatMap(site => {
    const rename = renames.find(({ from }) => site.specifier === from || site.specifier?.startsWith(`${from}/`));
    if (!rename || site.start === null || source.slice(site.start + 1, site.end - 1) !== site.specifier) return [];
    return [{ start: site.start + 1, end: site.end - 1, original: site.specifier, text: rename.to + site.specifier.slice(rename.from.length) }];
  });
}

export function dependentManifestEdits(source, renames) {
  const root = syntax(source);
  return DEPENDENCY_FIELDS.flatMap(field => {
    const container = locate(root, `/${field}`);
    if (container?.type !== "ObjectExpression") return [];
    return container.properties.flatMap(entry => {
      const rename = renames.find(({ from }) => keyOf(entry) === from);
      return rename ? [{ ...literal(entry.key, rename.to), original: source.slice(entry.key.start - 1, entry.key.end - 1) }] : [];
    });
  });
}
