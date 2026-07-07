// Blume's sitemap covers content pages only; add the custom landing page so
// the most important URL on the site is listed too.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../dist/sitemap.xml", import.meta.url);
const home = "https://add-mcp.com/";

const xml = readFileSync(path, "utf-8");
if (!xml.includes(`<loc>${home}</loc>`)) {
  writeFileSync(
    path,
    xml.replace("<urlset", `$&`).replace(
      /(<urlset[^>]*>)/,
      `$1\n  <url><loc>${home}</loc></url>`,
    ),
  );
  console.log("sitemap.xml: added landing page");
}
