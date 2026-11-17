import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = ".output/public/_nuxt";
const budgets = {
  js: 220 * 1024,
  css: 40 * 1024,
};

let failures = 0;
for (const file of readdirSync(root)) {
  const path = join(root, file);
  if (!statSync(path).isFile()) continue;
  const extension = file.endsWith(".js") ? "js" : file.endsWith(".css") ? "css" : null;
  if (!extension) continue;
  const raw = readFileSync(path);
  const gzip = gzipSync(raw).length;
  const budget = budgets[extension];
  if (gzip > budget) {
    failures += 1;
    console.error(
      `${file}: ${(gzip / 1024).toFixed(1)} KiB gzip exceeds ${(budget / 1024).toFixed(0)} KiB`,
    );
  }
}

if (failures) {
  process.exitCode = 1;
  console.error(`${failures} bundle budget failure(s)`);
} else {
  console.log("Bundle budgets passed");
}
