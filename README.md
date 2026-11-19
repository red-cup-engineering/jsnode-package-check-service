# JSNode package checking

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Observes one Node.js package directory, and the JavaScript files under it, as signcell cells `⟨subject, predicate, object⟩` whose witnesses for and against each name the file, its SHA-256 and the place in it that was read.

- `packageCells({ root, dir, source, organizations })` and `packageNameCells(root, manifests)`: name, scope, repository URL, mount and `bin`/`exports`/`main`/`files`/`scripts` target cells.
- `sourceCells({ root, path, source, packageDir })` from `./source-markers`: environment reads, absolute paths, writes, credential reads and hosts.
- `manifestRepair`, `repositoryPlan`, `importerEdits` and `dependentManifestEdits` from `./package-repairs`: exact edits for cells settled told-false, for `computer-code-engine`'s `applyExactSourceEdits`.

The `software-development` command of `software-development-engine` composes these.
