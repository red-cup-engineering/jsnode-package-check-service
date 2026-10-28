# JSNode package checking

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

**Code owner:** Red Cup Engineering, JavaScript normalization. The original `checkJsnodePackage({ directory })` reads a package directory and reports its current conventions without writing to that package. This is the modern Code successor to the executable portion of `emsenn/561-group-conformance-algebra`; the historical Yushi/Jiancha names denote reusable Coesite offices and duties, not another executable library.

## Import and inspect

```js
import { checkJsnodePackage } from "@red-cup-engineering/jsnode-package-check-service";
const report = await checkJsnodePackage({ directory: "/absolute/path/services/example" });
const { findings, violationCount, byConvention, cells } = report;
```

The checker now also observes **M6**, the optional `package.json#bin` command-to-file boundary. A declared command must point to an existing, regular in-package file (including a file under `scripts/`); missing, escaped and out-of-package symlink targets are violations, while absent `bin` is informational and unwitnessed. This is an **observed path** claim, not proof of command execution, archive inclusion, runtime safety or deployability. Regression cases live in `test/check-jsnode-bin.test.mjs` and the owning [package-form specification](https://github.com/red-cup-engineering/jsnode-package-engineering-services-section/blob/main/content/text/documents/specifications/2026-10-28-jsnode-package-form-and-concurrent-boundaries.md).

The established `JsnodePackageCheckReport`, its `JsnodePackageCheckFinding` entries, `violationCount`, and `byConvention` remain available to existing consumers. The additional `cells` array contains **native SignCell** predications `(inspected-source-revision, conforms-to-jsnode-rule, invariant-id)`, with actual source observations on `for` or `against`. SignCell, not this checker, determines their FOUR reading.

Each cell's subject carries the content address of the manifest text, scanned source text, explicitly *uninspected* source entries, observed export-target presence/type/ownership and current checker source. Symlinks and other unresolved source entries cannot silently support a clean source-wide scan; a source-law finding with incomplete coverage remains unknown unless a specific negative witness was actually observed. The witness also identifies the evaluated rule and the selected input fields/inspection domain. Only manifest/file and source checks with recorded observations emit positive/negative witnesses. Retired, skipped, informational, wildcard-unknown or otherwise unobserved rules remain cells with **no evidence**; a report's lack of a violation is not independently a positive fact. A historical `law-allow` comment is not authority to cancel another finding. Those exceptions must be separately asserted and admitted by the actual policy owner.

The historical convention labels `live`, `adapted`, `dead` describe **rule lineage**, not the four-valued truth coordinates.

## Existing presentation and HTTP suppliers

For an authorized inspection interface, supply the **same** `report.cells` to the already owned SignCraft audit projection rather than rewriting an HTML table or a second charge algebra:

```js
import { pageOfCells, renderDocument, AUDIT } from "@red-cup-engineering/signcraft/page";
const page = pageOfCells(report.cells, { contexts: [AUDIT] });
const html = renderDocument(page, "audit", { mode: "audit", title: "Package inspection" });
```

Under SignCraft's `AUDIT` context, unknown cells are rendered explicitly with the shared `⊥` reading; ordinary public views may omit them. Auditors can also obtain the same separately counted unknown population from `renderSectionFrame(cells).absurd`. Visibility restrictions remain independent of whether evidence is unknown. The original `emsenn/yushi` route `/audit/<encoded-path>`, package index and `/health` are historical behavior, not a mandate to create a bespoke Code or web-server package: the existing Computer Web Server supplies request routing, and the responsible receiver must configure authorized paths, live reads, and disclosure.

**Scope limitation:** a source inspection is a reproducible code observation within its described extent. It is not an exhaustive runtime dependency evaluation (owned separately by `inspect-installed-npm-package-service`), a proof that the governing rule is scientifically valid, a deployment or an independently received customer's judgment.
