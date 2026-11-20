import { readGitmodules } from "@red-cup-engineering/git-engine/gitmodules";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";

export const DIVISIONS = Object.freeze(["engineering", "science", "operations"]);
export const OWNERS = Object.freeze([...DIVISIONS, "561-group", "public"]);

/** The owner a repository-relative section path stands in: the owner root it sits under, or null outside the five. */
export function sectionOwner(path) {
  const root = /^services\/([a-z0-9-]+?)-services-section(?:\/|$)/u.exec(String(path))?.[1];
  return OWNERS.includes(root) ? root : null;
}

/**
 * The package and repository a section's path derives, never a caller's choice: its custody is read from the path
 * (sectionOwner), its organization from the Group's one-home rule (sourceOrganizations), and both the package
 * scope and the repository owner are that organization, the package and repository names the section's directory.
 * @param {string} path The repo-relative section path.
 * @param {Record<string, string>} organizations The custody-to-organization binding (readSourceOrganizations).
 * @returns {{custody: string, organization: string, packageName: string, repository: {type: string, url: string}} | {refused: string, path: string, custody?: string}}
 */
export function deriveSectionPackage(path, organizations) {
  const trimmed = path.replace(/\/+$/u, "");
  const custody = sectionOwner(trimmed);
  if (custody === null) return { refused: "PATH_DERIVES_NO_CUSTODY", path: trimmed };
  const organization = organizations[custody];
  if (typeof organization !== "string" || organization.length === 0) return { refused: "CUSTODY_HAS_NO_ORGANIZATION", path: trimmed, custody };
  const name = posix.basename(trimmed);
  return {
    custody,
    organization,
    packageName: `@${organization}/${name}`,
    repository: { type: "git", url: `git+https://github.com/${organization}/${name}.git` },
  };
}


export function enclosingRepositories(root, directory) {
  const found = [];
  for (let at = dirname(directory); ; at = dirname(at)) {
    if (existsSync(join(at, ".git"))) found.push(at);
    if (at === root || at === dirname(at)) return found;
  }
}

export function gitmodulesDeclarations(repository) {
  const path = join(repository, ".gitmodules");
  if (!existsSync(path)) return { path, source: null, declarations: [] };
  const source = readFileSync(path, "utf8");
  return { path, source, declarations: readGitmodules(repository).map(({ path }) => ({ path, start: 0, end: source.length })) };
}

export function mountDeclaration(root, directory) {
  const [parent, ...ancestors] = enclosingRepositories(root, directory);
  if (parent === undefined) return null;
  const read = gitmodulesDeclarations(parent);
  const own = read.declarations.find(entry => entry.path === relative(parent, directory));
  const declaredBy = own ? parent : ancestors.find(repository =>
    gitmodulesDeclarations(repository).declarations.some(entry => entry.path === relative(repository, directory))) ?? null;
  return { parent, gitmodules: read.path, source: read.source, declaration: own ?? null, declaredBy };
}
