// © 2026 Continuum Commerce LLC. MIT licensed.
//
// What a page SAYS, as text a snapshot can hold: every element with its id,
// classes and attributes, and every run of visible text, one per line and
// indented by depth. Used by tests/page-snapshots.test.mjs.
//
// LEFT OUT ON PURPOSE, because none of it reaches a visitor or a crawler:
//
// - Comments. These pages carry long notes for the next developer, and they
//   change far more often than the markup does. A snapshot that failed on
//   every rewritten comment would be accepted without reading, which is how
//   a snapshot suite stops catching anything.
// - Whitespace and indentation. Text is collapsed to single spaces.
// - Attribute order. Attributes are sorted, so reordering them is not a change.
//
// Also normalized: JSON-LD is parsed and printed the same way every time, and
// long SVG path data is replaced by a short hash, so a changed icon still
// shows as a change without a thousand-character line in the diff.
//
// STRICT ABOUT NESTING. A closing tag that does not match the open element
// throws, naming the page's line, so a broken edit fails here as a broken edit
// rather than as a confusing snapshot diff. These are hand-written pages that
// close every element, so optional end tags (a bare <li>, <p>) are not
// supported.

import { createHash } from 'node:crypto';

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'track', 'wbr',
]);

/** Attribute values past this length in SVG geometry print as a hash. */
const GEOMETRY = new Set(['d', 'points', 'viewbox']);
const GEOMETRY_MAX = 40;

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 10);

/** Replace comments with blank lines of the same count, so line numbers hold. */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
}

function parseAttrs(src) {
  const attrs = [];
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const value = m[2] ?? m[3] ?? m[4];
    attrs.push([m[1].toLowerCase(), value === undefined ? null : value]);
  }
  return attrs;
}

function describe(tag, attrs) {
  let head = tag;
  const rest = [];
  for (const [name, value] of attrs) {
    if (name === 'id' && value) head += `#${value}`;
    else if (name === 'class' && value) head += value.trim().split(/\s+/).map((c) => `.${c}`).join('');
    else rest.push([name, value]);
  }
  rest.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const shown = rest.map(([name, value]) => {
    if (value === null) return name;
    const v = value.replace(/\s+/g, ' ').trim();
    if (GEOMETRY.has(name) && v.length > GEOMETRY_MAX) return `${name}=#${hash(v)}`;
    return `${name}="${v}"`;
  });
  return shown.length ? `${head} [${shown.join(' ')}]` : head;
}

/** Pretty JSON for a JSON-LD block, or the collapsed text if it does not parse. */
function jsonLines(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2).split('\n');
  } catch {
    return [`(unparsed) ${text.replace(/\s+/g, ' ').trim()}`];
  }
}

/**
 * A page as a small tree, for the outline below and for the rule tests
 * (tests/page-rules.test.mjs). Element nodes are
 * `{ tag, attrs: [[name, value]], children, line }`, text nodes are
 * `{ text }` with whitespace collapsed, and a <script> or <style> keeps its
 * raw contents as `body`. Comments are gone.
 * @param {string} html   the page source
 * @param {string} [name] used in error messages
 * @returns {{ doctype: string|null, children: object[] }}
 */
export function parsePage(html, name = 'page') {
  const src = stripComments(html);
  const root = { doctype: null, children: [] };
  const stack = [];
  const lineAt = (index) => src.slice(0, index).split('\n').length;
  const into = () => (stack.length ? stack[stack.length - 1] : root).children;
  const token = /<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)|(<)/gi;
  let m;
  while ((m = token.exec(src))) {
    const [whole, closing, opening, attrSrc, selfClose, text, stray] = m;
    if (stray) throw new Error(`${name}:${lineAt(m.index)}: a stray "<" that starts no tag`);
    if (text !== undefined) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (t) into().push({ text: t });
      continue;
    }
    if (closing) {
      const tag = closing.toLowerCase();
      const open = stack.pop();
      if (!open || open.tag !== tag) {
        throw new Error(`${name}:${lineAt(m.index)}: </${tag}> closes <${open ? open.tag : 'nothing'}>`);
      }
      continue;
    }
    if (!opening) {                     // the doctype
      root.doctype = whole.replace(/\s+/g, ' ').toLowerCase();
      continue;
    }
    const tag = opening.toLowerCase();
    const node = { tag, attrs: parseAttrs(attrSrc || ''), children: [], line: lineAt(m.index) };
    into().push(node);
    if (tag === 'script' || tag === 'style') {
      // Raw text: read up to the matching close, never as markup.
      const end = src.toLowerCase().indexOf(`</${tag}`, token.lastIndex);
      if (end < 0) throw new Error(`${name}:${node.line}: <${tag}> is never closed`);
      node.body = src.slice(token.lastIndex, end);
      token.lastIndex = src.indexOf('>', end) + 1;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) stack.push(node);
  }
  if (stack.length) throw new Error(`${name}: never closed: <${stack.map((n) => n.tag).join('> <')}>`);
  return root;
}

/** An attribute's value: null when present without one, undefined when absent. */
export function attr(node, name) {
  const hit = node.attrs && node.attrs.find(([n]) => n === name);
  return hit ? hit[1] : undefined;
}

/**
 * The outline of one page.
 * @param {string} html   the page source
 * @param {string} [name] used in error messages
 * @returns {string}
 */
export function pageOutline(html, name = 'page') {
  const root = parsePage(html, name);
  const lines = root.doctype ? [root.doctype] : [];
  const walk = (nodes, depth) => {
    const pad = '  '.repeat(depth);
    for (const node of nodes) {
      if (node.text !== undefined) {
        lines.push(`${pad}"${node.text}"`);
        continue;
      }
      lines.push(pad + describe(node.tag, node.attrs));
      if (node.body !== undefined) {
        if (node.body.trim()) {
          const inner = attr(node, 'type') === 'application/ld+json'
            ? jsonLines(node.body)
            : [node.body.replace(/\s+/g, ' ').trim()];
          inner.forEach((l) => lines.push(`${pad}  ${l}`));
        }
        continue;
      }
      walk(node.children, depth + 1);
    }
  };
  walk(root.children, 0);
  return lines.join('\n');
}
