import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { packageCells, packageName } from "@red-cup-engineering/jsnode-package-check-service";
import { withRepositoryField } from "@red-cup-engineering/jsnode-package-check-service/manifest-field";
import { deriveSectionPackage } from "@red-cup-engineering/jsnode-package-check-service/package-identity";
import { importerEdits, manifestFieldEdits, manifestRepair } from "@red-cup-engineering/jsnode-package-check-service/package-repairs";
import { sourceCells } from "@red-cup-engineering/jsnode-package-check-service/source-markers";
import { carrierSurfaceViolations } from "@red-cup-engineering/jsnode-package-check-service/carrier-surface";
import edition from "@red-cup-engineering/jsnode-package-check-service/package.json" with { type: "json" };

test("the installed checker witnesses existing and absent package targets while preserving the observed private manifest", async t => {
  const root = await mkdtemp(join(tmpdir(), "checked-jsnode-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const relative = "services/engineering-services-section/services/copper";
  const dir = join(root, relative);
  await mkdir(dir, { recursive: true });
  const organizations = { engineering: "red-cup-engineering" };
  const identity = deriveSectionPackage(relative, organizations);
  const manifest = {
    name: identity.packageName, version: "0.1.0", private: true, type: "module",
    exports: { ".": "./index.mjs" }, bin: { copper: "./missing.mjs" }
  };
  const source = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(join(dir, "index.mjs"), "export const value = 1;\n");
  await writeFile(join(dir, "package.json"), source);
  const observed = packageCells({ root, dir, source, organizations });
  const exported = observed.find(cell => cell.object === "exports:.→./index.mjs");
  const missing = observed.find(cell => cell.object === "bin:copper→./missing.mjs");
  const digest = createHash("sha256").update(source).digest("hex");
  assert.equal(packageName(dir, source).sha256, digest);
  assert.equal(exported.for[0].observer, edition.name + "@" + edition.version);
  assert.equal(exported.for[0].sha256, digest);
  assert.equal(missing.against[0].at, "/bin/copper");
  assert.equal(missing.against[0].path, relative + "/package.json");
  assert.equal((await readFile(join(dir, "package.json"), "utf8")), source);
  assert.ok(carrierSurfaceViolations(manifest, ["package.json", "index.mjs"]).some(issue => issue.target === "./missing.mjs"));
  const invalid = packageCells({ root, dir, source: "{", organizations });
  assert.equal(invalid[0].predicate, "manifest-parses");
  assert.equal(invalid[0].against.length, 1);
});

test("Fabrication's repository declaration and the development engine's source edits retain their exact original subjects", () => {
  const source = '{\n  "name": "copper",\n  "private": true\n}\n';
  const placement = { url: "https://github.com/red-cup-engineering/copper.git", directory: "services/copper" };
  const added = withRepositoryField(source, placement);
  assert.equal(added.changed, true);
  assert.deepEqual(JSON.parse(added.text), { name: "copper", private: true,
    repository: { type: "git", url: "git+" + placement.url, directory: placement.directory } });
  assert.deepEqual(withRepositoryField(added.text, { url: "https://example.org/other.git" }),
    { text: added.text, changed: false });
  const [edit] = manifestFieldEdits(source, { set: { type: "module" } });
  assert.equal(source.slice(edit.start, edit.end), edit.original);
  assert.equal(JSON.parse(source.slice(0, edit.start) + edit.text + source.slice(edit.end)).private, true);
  const module = 'import { shape } from "old-package/subpath";\nexport { shape };\n';
  const [rename] = importerEdits("index.mjs", module, [{ from: "old-package", to: "new-package" }]);
  assert.equal(module.slice(rename.start, rename.end), rename.original);
  assert.equal(rename.text, "new-package/subpath");
  assert.ok(sourceCells({ root: "/selected", path: "/selected/index.mjs", source: module, packageDir: "/selected" })
    .some(cell => cell.predicate === "parses" && cell.for.length === 1));
  assert.deepEqual(manifestRepair({ source, dir: "/selected/copper", cells: [] }).edits, []);
});
