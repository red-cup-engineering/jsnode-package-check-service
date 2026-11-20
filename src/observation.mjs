import { sha256Hex } from "@red-cup-engineering/semiotic-content-address-system";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { cell } from "@red-cup-engineering/signcell";

const own = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const OBSERVER = `${own.name}@${own.version}`;



export const estatePath = (root, path) => relative(root, path).split(sep).join("/") || ".";

export const encodePointer = key => String(key).replaceAll("~", "~0").replaceAll("/", "~1");

export const decodePointer = segment => segment.replaceAll("~1", "/").replaceAll("~0", "~");

export const pointer = (...keys) => keys.map(key => `/${encodePointer(key)}`).join("");

export const witnessOf = (path, source) => {
  const digest = source === null ? null : sha256Hex(source);
  return (at, observed) => ({ observer: OBSERVER, path, sha256: digest, at, observed });
};

export function testify(subject, predicate, object, holds, witness) {
  if (holds === null) return cell(subject, predicate, object);
  return cell(subject, predicate, object, holds ? { for: [witness] } : { against: [witness] });
}
