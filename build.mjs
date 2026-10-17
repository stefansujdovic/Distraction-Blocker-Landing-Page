/**
 * Site build — run `node build.mjs` before every commit. No dependencies.
 *
 * 1. Partials   Every page marks shared blocks with
 *                 <!-- @partial NAME --> ... <!-- @end NAME -->
 *               and the content between the markers is replaced with
 *               _partials/NAME.html. Edit the partial, never the copy in a
 *               page. Pages are both source and output (no dist folder), so
 *               running the build twice changes nothing.
 * 2. Sitemap    sitemap.xml is regenerated from every indexable page: the
 *               <loc> is its canonical URL, the <lastmod> its JSON-LD
 *               WebPage "dateModified". Bump that date when the page's
 *               content changes.
 * 3. Checks     The build fails (exit code 1) when a page has no <title>,
 *               meta description or correct canonical, does not have exactly
 *               one <h1>, has invalid JSON-LD, links to a missing file or
 *               #anchor, or when the app version differs between pages and
 *               llms.txt.
 *
 * New page: create folder/index.html (clean URL /folder/), use root-relative
 * links (/assets/..., /#faq) and add the four partial markers.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://distraction-blocker.com";
const SKIP_DIRS = new Set(["_partials", "seo-plan", "node_modules"]);

const errors = [];
const fail = (page, msg) => errors.push(`${page}: ${msg}`);

/* ---------- collect pages ---------- */
function findPages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name.startsWith(".") || SKIP_DIRS.has(entry.name) ? [] : findPages(full);
    }
    return entry.name.endsWith(".html") ? [full] : [];
  });
}
const toPosix = (p) => p.split(sep).join("/");
const pages = findPages(ROOT).map((full) => toPosix(relative(ROOT, full))).sort();

/* Public URL path of a page file: index.html -> /, vs/x/index.html -> /vs/x/ */
const urlPath = (file) => "/" + file.replace(/(^|\/)index\.html$/, "$1");

/* ---------- 1. partials ---------- */
const partials = {};
for (const name of readdirSync(join(ROOT, "_partials"))) {
  partials[name.replace(/\.html$/, "")] = readFileSync(join(ROOT, "_partials", name), "utf8").replace(/\s+$/, "");
}

const html = {};
let changed = 0;
for (const page of pages) {
  const path = join(ROOT, page);
  const before = readFileSync(path, "utf8");
  const after = before.replace(
    /([ \t]*)<!-- @partial ([\w-]+) -->[\s\S]*?<!-- @end \2 -->/g,
    (block, indent, name) => {
      if (!(name in partials)) {
        fail(page, `unknown partial "${name}"`);
        return block;
      }
      return `${indent}<!-- @partial ${name} -->\n${partials[name]}\n${indent}<!-- @end ${name} -->`;
    }
  );
  if (after !== before) {
    writeFileSync(path, after);
    changed++;
  }
  html[page] = after;
}

/* ---------- 3. checks (collects data for the sitemap too) ---------- */
const ids = (src) => new Set([...src.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const pageIds = Object.fromEntries(pages.map((p) => [p, ids(html[p])]));
const versions = new Map(); // version -> where it was found
const sitemapEntries = [];

function resolveLink(fromPage, href) {
  const [rawPath, hash = ""] = href.split("#");
  let file;
  if (rawPath === "") file = fromPage;
  else {
    const abs = rawPath.startsWith("/") ? rawPath : "/" + toPosix(join(dirname(fromPage), rawPath));
    file = abs.slice(1).split("?")[0];
    if (file === "" || file.endsWith("/")) file += "index.html";
    else if (existsSync(join(ROOT, file)) && statSync(join(ROOT, file)).isDirectory()) file += "/index.html";
  }
  return { file: toPosix(file), hash };
}

for (const page of pages) {
  const src = html[page];
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(src);

  if (!/<title>[^<]+<\/title>/.test(src)) fail(page, "missing <title>");
  if (!/<meta name="description"\s+content="[^"]+"/.test(src)) fail(page, "missing meta description");

  const canonical = src.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expected = ORIGIN + urlPath(page);
  if (!noindex && canonical !== expected) fail(page, `canonical is ${canonical ?? "missing"}, expected ${expected}`);

  const h1s = (src.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) fail(page, `has ${h1s} <h1> elements, expected 1`);

  let dateModified;
  for (const [, json] of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try {
      data = JSON.parse(json);
    } catch (e) {
      fail(page, `invalid JSON-LD: ${e.message}`);
      continue;
    }
    for (const node of data["@graph"] || [data]) {
      if (node["@type"] === "WebPage") dateModified = node.dateModified;
      if (node["@type"] === "SoftwareApplication") versions.set(node.softwareVersion, `${page} (JSON-LD)`);
    }
  }
  for (const [, v] of src.matchAll(/· v(\d+\.\d+\.\d+) ·/g)) versions.set(v, `${page} (dl-meta)`);

  for (const [, attr, href] of src.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|javascript:|\/\/)/.test(href) || href === "#") continue;
    const { file, hash } = resolveLink(page, href);
    if (!existsSync(join(ROOT, file))) fail(page, `${attr}="${href}" points to missing ${file}`);
    else if (hash && pageIds[file] && !pageIds[file].has(hash)) fail(page, `${attr}="${href}" has no #${hash} target`);
  }

  if (!noindex) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateModified || "")) fail(page, 'JSON-LD WebPage needs "dateModified": "YYYY-MM-DD"');
    sitemapEntries.push({ loc: canonical || expected, lastmod: dateModified, home: page === "index.html" });
  }
}

const llmsVersion = readFileSync(join(ROOT, "llms.txt"), "utf8").match(/- Version: (\d+\.\d+\.\d+)/)?.[1];
if (llmsVersion) versions.set(llmsVersion, "llms.txt");
if (versions.size > 1) {
  fail("version", "mismatch — " + [...versions].map(([v, where]) => `${v} in ${where}`).join(", "));
}

/* ---------- 2. sitemap ---------- */
sitemapEntries.sort((a, b) => b.home - a.home || a.loc.localeCompare(b.loc));
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapEntries.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </url>\n`).join("") +
  "</urlset>\n";
const sitemapPath = join(ROOT, "sitemap.xml");
if (!errors.length && readFileSync(sitemapPath, "utf8") !== sitemap) {
  writeFileSync(sitemapPath, sitemap);
  changed++;
}

/* ---------- report ---------- */
console.log(`${pages.length} pages, ${sitemapEntries.length} in sitemap, ${changed} file(s) updated.`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s), sitemap.xml not updated:\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log("All checks passed.");
