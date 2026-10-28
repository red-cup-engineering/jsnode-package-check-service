import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkJsnodePackage } from "../src/check-jsnode-package.mjs";

test("a package without a bin makes no executable-surface claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-bin-empty-"));
  try {
    const dir = join(root, "services", "a-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "index.mjs"), "export const value = 1;\n");
    const manifest = {
      name: "@owner/a-service", type: "module", private: true,
      exports: "./src/index.mjs",
      scripts: { check: "node --check src/index.mjs", test: "node --test", verify: "npm test" },
    };
    await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
    const report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((item) => item.invariantId === "M6").status, "informational");
    assert.equal(report.cells.find((item) => item.object === "M6").for.length, 0);
    assert.equal(report.cells.find((item) => item.object === "M6").against.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a bin target in scripts is witnessed as an in-package regular file", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-bin-valid-"));
  try {
    const dir = join(root, "services", "a-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "src", "index.mjs"), "export const value = 1;\n");
    await writeFile(join(dir, "scripts", "run.mjs"), "#!/usr/bin/env node\nconsole.log('ready');\n");
    const manifest = {
      name: "@owner/a-service", type: "module", private: true,
      exports: "./src/index.mjs", bin: { "a-command": "scripts/run.mjs" },
      scripts: { check: "node --check src/index.mjs", test: "node --test", verify: "npm test" },
    };
    await writeFile(join(dir, "package.json"), JSON.stringify(manifest));
    const report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((item) => item.invariantId === "M6").status, "clean");
    const witness = report.cells.find((item) => item.object === "M6");
    assert.equal(witness.for.length, 1);
    assert.equal(witness.against.length, 0);
    assert.deepEqual(witness.for[0].observed.binTargets.map((item) => [item.command, item.exists]), [["a-command", true]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing, out-of-package, directory and symlink bin targets are refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-bin-invalid-"));
  try {
    const dir = join(root, "services", "a-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await mkdir(join(dir, "scripts"));
    await writeFile(join(dir, "src", "index.mjs"), "export const value = 1;\n");
    await writeFile(join(root, "outside.mjs"), "export const outside = true;\n");
    await symlink(join(root, "outside.mjs"), join(dir, "scripts", "linked.mjs"));
    const manifest = {
      name: "@owner/a-service", type: "module", private: true,
      exports: "./src/index.mjs",
      scripts: { check: "node --check src/index.mjs", test: "node --test", verify: "npm test" },
    };
    for (const bin of [
      { missing: "scripts/nope.mjs" },
      { outside: "../../outside.mjs" },
      { linked: "scripts/linked.mjs" },
      { directory: "scripts" },
      { wildcard: "scripts/*.mjs" },
      {},
      null,
    ]) {
      await writeFile(join(dir, "package.json"), JSON.stringify({ ...manifest, bin }));
      const report = await checkJsnodePackage({ directory: dir });
      assert.equal(report.findings.find((item) => item.invariantId === "M6").status, "violation", JSON.stringify(bin));
      const witness = report.cells.find((item) => item.object === "M6");
      assert.equal(witness.for.length, 0);
      assert.equal(witness.against.length, 1);
    }
    await writeFile(join(dir, "scripts", "ok.mjs"), "export const value = 2;\n");
    await writeFile(join(dir, "package.json"), JSON.stringify({ ...manifest, bin: "./scripts/ok.mjs" }));
    const report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((item) => item.invariantId === "M6").status, "clean");
  } finally { await rm(root, { recursive: true, force: true }); }
});
