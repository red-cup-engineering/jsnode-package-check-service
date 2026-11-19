import { existsSync, globSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { cell } from "@red-cup-engineering/signcell";
import { surfaceDeclarations } from "./carrier-surface.mjs";
import { decodePointer, estatePath, OBSERVER, pointer, sha256, testify, witnessOf } from "./observation.mjs";
import { deriveSectionPackage, mountDeclaration } from "./package-identity.mjs";

const GLOB = /[*?[{]/u;
const NODE_SOURCE = /\.[cm]?[jt]s$/u;
const PATH_FLAGS = new Set(["--import", "--require", "-r", "--loader", "--experimental-loader"]);
const unquote = token => token.replace(/^(['"])(.*)\1$/u, "$2");
const matches = (dir, pattern) => globSync(pattern.replace(/^\.\//u, ""), { cwd: dir }).length > 0;
const isFile = path => existsSync(path) && statSync(path).isFile();

export function scriptReferences(script) {
  const references = [];
  for (const clause of script.split(/&&|\|\||;|\|/u)) {
    const tokens = clause.trim().split(/\s+/u).map(unquote);
    const run = /^p?npm$/u.test(tokens[0]) ? (tokens[1] === "run" ? tokens[2] : ["test", "start"].includes(tokens[1]) ? tokens[1] : null) : null;
    if (run && /^[\w:.-]+$/u.test(run)) references.push({ run });
    let many = false;
    for (let index = tokens.findIndex(token => token === "node" || token.endsWith("/node")) + 1; index > 0 && index < tokens.length; index += 1) {
      const token = tokens[index];
      if (PATH_FLAGS.has(token)) { if (/^\.{1,2}\//u.test(tokens[index + 1] ?? "")) references.push({ path: tokens[index + 1] }); index += 1; continue; }
      if (["-e", "--eval", "-p", "--print"].includes(token)) break;
      if (token === "--check" || token === "--test") { many = true; continue; }
      if (token.startsWith("-")) continue;
      if (NODE_SOURCE.test(token) || GLOB.test(token)) references.push({ path: token });
      if (!many) break;
    }
  }
  return references;
}

function targetCells(dir, manifest, told) {
  const declarations = surfaceDeclarations(manifest);
  if (manifest.main !== undefined && !declarations.some(({ field }) => field === "main")) declarations.push({ field: "main", target: manifest.main, pointer: "/main" });
  const cells = declarations.map(({ target, pointer: at }) => {
    const [, top, key] = at.split("/");
    const place = top === "main" ? "main" : top === "bin" ? `bin:${key === undefined ? basename(dir) : decodePointer(key)}`
      : `exports:${key !== undefined && decodePointer(key).startsWith(".") ? decodePointer(key) : "."}`;
    const exists = typeof target !== "string" || target === "" ? false : GLOB.test(target) ? (matches(dir, target) || null) : isFile(join(dir, target));
    return told("target-exists", `${place}→${target}`, exists, at, { target, exists });
  });
  (Array.isArray(manifest.files) ? manifest.files : []).forEach((entry, index) => {
    if (typeof entry !== "string" || entry.startsWith("!")) return;
    const exists = GLOB.test(entry) ? (matches(dir, entry) || null) : existsSync(join(dir, entry));
    cells.push(told("target-exists", `files:${entry}`, exists, pointer("files", index), { target: entry, exists }));
  });
  const scripts = manifest.scripts !== null && typeof manifest.scripts === "object" ? manifest.scripts : {};
  for (const [name, script] of Object.entries(scripts)) {
    if (typeof script !== "string") continue;
    for (const reference of scriptReferences(script)) {
      const exists = reference.run !== undefined ? typeof scripts[reference.run] === "string"
        : /(?:^|\/)node_modules\//u.test(reference.path) ? null
          : GLOB.test(reference.path) ? matches(dir, reference.path) : existsSync(join(dir, reference.path));
      const object = `scripts.${name}:${reference.run !== undefined ? `run ${reference.run}` : reference.path}`;
      cells.push(told("target-exists", object, exists, pointer("scripts", name), { ...reference, exists }));
    }
  }
  return cells;
}

function mountCells(root, dir, subject) {
  if (dir === root || !existsSync(join(dir, ".git"))) return [];
  const mount = mountDeclaration(root, dir);
  if (mount === null) return [];
  const witness = witnessOf(estatePath(root, mount.gitmodules), mount.source)(
    mount.declaration ? `${mount.declaration.start}:${mount.declaration.end}` : "",
    { declaredBy: mount.declaredBy === null ? null : estatePath(root, mount.declaredBy) });
  return [testify(subject, "mount-declared-by-parent", `repo:${estatePath(root, mount.parent)}`, mount.declaration !== null, witness)];
}

export function packageCells({ root, dir, source, organizations }) {
  const rel = estatePath(root, dir);
  const subject = `pkg:${rel}`;
  const witness = witnessOf(rel === "." ? "package.json" : `${rel}/package.json`, source);
  const told = (predicate, object, holds, at, observed) => testify(subject, predicate, object, holds, witness(at, observed));
  let manifest;
  try { manifest = JSON.parse(source); } catch (error) { return [told("manifest-parses", "package.json", false, "", error.message)]; }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return [told("manifest-parses", "package.json", false, "", manifest)];
  const folder = basename(dir);
  const name = typeof manifest.name === "string" ? manifest.name : null;
  const leaf = name === null ? null : name.split("/").pop();
  const derived = deriveSectionPackage(rel, organizations);
  const repository = manifest.repository;
  const url = typeof repository === "string" ? repository : typeof repository?.url === "string" ? repository.url : null;
  return [
    told("manifest-parses", "package.json", true, "", null),
    told("name-leaf-is-folder", folder, leaf === folder, "/name", name),
    told("free-of-internal-prefix", folder, !/^internal-/u.test(folder) && !/^internal-/u.test(leaf ?? ""), "/name", name),
    derived.refused ? cell(subject, "scope-is-house-organization", null)
      : told("scope-is-house-organization", `@${derived.organization}`, name?.split("/")[0] === `@${derived.organization}`, "/name", name),
    derived.refused ? cell(subject, "repository-url-names-folder", null)
      : told("repository-url-names-folder", derived.repository.url, url === derived.repository.url, typeof repository === "string" ? "/repository" : "/repository/url", url),
    ...mountCells(root, dir, subject),
    ...targetCells(dir, manifest, told),
  ];
}

export function packageName(dir, source) {
  try {
    const name = JSON.parse(source)?.name;
    return typeof name === "string" ? { dir, name, sha256: sha256(source) } : null;
  } catch { return null; }
}

export function packageNameCells(root, names) {
  return Object.entries(Object.groupBy(names.filter(Boolean), ({ name }) => name)).flatMap(([name, homes]) => homes.map(({ dir, sha256: digest }) => {
    const rel = estatePath(root, dir);
    return testify(`name:${name}`, "names-one-package", `pkg:${rel}`, homes.length === 1,
      { observer: OBSERVER, path: rel === "." ? "package.json" : `${rel}/package.json`, sha256: digest, at: "/name", observed: homes.map(home => estatePath(root, home.dir)) });
  }));
}
