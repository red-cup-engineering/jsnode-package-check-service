import { stripTypeScriptTypes } from "node:module";
import { parseJavaScript, walkJavaScript } from "@red-cup-engineering/javascript-parser-service";
import { estatePath, testify, witnessOf } from "./observation.mjs";

const WRITES = new Set(["writeFile", "writeFileSync", "appendFile", "appendFileSync", "mkdir", "mkdirSync", "createWriteStream", "rm", "rmSync", "rename", "renameSync"]);
const READS = new Set(["readFile", "readFileSync", "createReadStream"]);
const ABSOLUTE = /^(?:\/home\/|\/Users\/|[A-Za-z]:\\)/u;
const HOST = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?|^localhost:\d+/u;
const CREDENTIAL_PATH = /credential|secret|token|key|\.pem|jwks/iu;
const CREDENTIAL_ENV = /TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL/u;
const STATE = /(?:^|\/)data\/state(?:\/|$)/u;
const CREDENTIALS = /(?:^|\/)data\/records\/credential-records(?:\/|$)/u;
export const PARSE_BUDGET = 1024 ** 2;
const VOLATILE = "names-memory-backed-or-out-of-colony-location";
const VOLATILE_PATH = /^(?:\/tmp(?:\/|$)|\/run\/user(?:\/|$)|~\/\.(?:local|cache)(?:\/|$))|(?:^|\/)\.(?:local|cache)(?:\/|$)/u;
const VOLATILE_ENV = new Set(["TMPDIR", "TMP", "TEMP", "XDG_RUNTIME_DIR", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]);

const calleeName = callee => callee?.type === "Identifier" ? callee.name
  : callee?.type === "MemberExpression" && !callee.computed ? callee.property.name : null;
const isProcessEnv = node => node?.type === "MemberExpression" && !node.computed && node.property.name === "env"
  && node.object.type === "Identifier" && node.object.name === "process";
const memberName = node => !node.computed ? node.property.name
  : node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : "*";
const located = (path, place) => place.test(path) ? true : path.includes("*") ? null : false;

function staticPath(node) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral") return node.quasis.map((quasi, index) => (quasi.value.cooked ?? "") + (index < node.expressions.length ? "*" : "")).join("");
  if (node?.type === "CallExpression" && ["join", "resolve"].includes(calleeName(node.callee))) return node.arguments.map(staticPath).join("/");
  if (node?.type === "NewExpression" && node.callee.name === "URL") return staticPath(node.arguments[0]);
  return "*";
}

function portName(node) {
  if (node?.type === "CallExpression") return portName(node.arguments[0]);
  if (node?.type === "MemberExpression") return memberName(node);
  return node?.type === "Identifier" ? node.name : "";
}

export function sourceMarkers(program) {
  const marks = [];
  const mark = (node, predicate, object, holds = true) => marks.push({ predicate, object, holds, start: node.start, end: node.end });
  walkJavaScript(program, (node, parent) => {
    if (isProcessEnv(node)) {
      const read = parent?.type === "MemberExpression" && parent.object === node;
      const names = read ? [memberName(parent)]
        : parent?.type === "VariableDeclarator" && parent.init === node && parent.id.type === "ObjectPattern"
          ? parent.id.properties.map(entry => entry.type === "Property" && !entry.computed ? entry.key.name ?? String(entry.key.value) : "*")
          : ["*"];
      for (const name of names) {
        mark(read ? parent : node, "reads-environment", name);
        mark(read ? parent : node, "reads-environment-at-configuration-place", name, null);
        if (VOLATILE_ENV.has(name)) mark(read ? parent : node, VOLATILE, `$${name}`);
        if (CREDENTIAL_ENV.test(name)) {
          mark(read ? parent : node, "reads-credential", name);
          mark(read ? parent : node, "reads-credentials-from-credential-records", name, false);
        }
      }
    } else if ((node.type === "Literal" && typeof node.value === "string") || node.type === "TemplateLiteral") {
      const text = node.type === "Literal" ? node.value : node.quasis[0]?.value.cooked ?? "";
      if (ABSOLUTE.test(text)) mark(node, "names-absolute-path", staticPath(node));
      if (VOLATILE_PATH.test(text)) mark(node, VOLATILE, staticPath(node));
      const host = HOST.exec(text)?.[0];
      if (host) mark(node, "names-host", host);
    } else if (node.type === "CallExpression") {
      const name = calleeName(node.callee);
      const target = staticPath(node.arguments[0]);
      if (name === "tmpdir") mark(node, VOLATILE, "os.tmpdir()");
      if (WRITES.has(name)) {
        mark(node, "writes-path", target);
        mark(node, "writes-inside-data-state", target, located(target, STATE));
      }
      if (READS.has(name) && CREDENTIAL_PATH.test(target)) {
        mark(node, "reads-credential", target);
        mark(node, "reads-credentials-from-credential-records", target, located(target, CREDENTIALS));
      }
    } else if (node.type === "LogicalExpression" && ["??", "||"].includes(node.operator) && node.right.type === "Literal"
      && typeof node.right.value === "number" && /PORT$/u.test(portName(node.left))) {
      mark(node, "names-host", `PORT ?? ${node.right.value}`);
    }
  });
  return marks;
}

function parsed(path, source) {
  const text = /\.[cm]?ts$/u.test(path) ? stripTypeScriptTypes(source) : source;
  try { return parseJavaScript(text); } catch { return parseJavaScript(text, { sourceType: "script" }); }
}

export function sourceCells({ root, path, source, packageDir }) {
  const rel = estatePath(root, path);
  const subject = `file:${rel}`;
  const witness = witnessOf(rel, source);
  const cells = packageDir === null ? [] : [testify(subject, "in-package", `pkg:${estatePath(root, packageDir)}`, true, witness("", null))];
  if (source.length > PARSE_BUDGET) return [...cells, testify(subject, "parses", "javascript", null)];
  let program;
  try { program = parsed(path, source); } catch (error) {
    return [...cells, testify(subject, "parses", "javascript", false, witness("", String(error?.message ?? error)))];
  }
  cells.push(testify(subject, "parses", "javascript", true, witness("", null)));
  for (const { predicate, object, holds, start, end } of sourceMarkers(program))
    cells.push(testify(subject, predicate, Buffer.from(object).toString(), holds, witness(`${start}:${end}`, Buffer.from(source.slice(start, Math.min(end, start + 240))).toString())));
  return cells;
}
