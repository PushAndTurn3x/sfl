/**
 * Rebuilds `src/data/marketplace_items.json` from the authoritative SFL
 * source (GitHub). The mapping lives in two TypeScript files:
 *
 *   - `src/features/game/types/index.ts`      → KNOWN_IDS   (collectibles,
 *                                                 resources, seeds, tools)
 *   - `src/features/game/types/bumpkin.ts`    → ITEM_NAMES  (wearables, by ID)
 *
 * Both are parsed with permissive regexes that tolerate comments and trailing
 * commas. The result is a self-contained JSON with real item names grouped
 * into our app-level categories.
 *
 * Run: `node scripts/update-marketplace.mjs`
 *      (requires Node 18+ for global fetch)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "data", "marketplace_items.json");

const SOURCES = {
  knownIds:
    "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types/index.ts",
  itemNames:
    "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types/bumpkin.ts",
};

/**
 * Heuristic classifier: maps an item name to our marketplace category.
 * Order matters — more specific patterns first.
 */
function classify(name) {
  if (/ Seed$| Plant$| Bean$/i.test(name)) return "Seeds";
  if (
    /^(Sunflower|Potato|Pumpkin|Carrot|Cabbage|Beetroot|Cauliflower|Parsnip|Radish|Wheat|Kale|Eggplant|Corn|Soybean|Rhubarb|Zucchini|Yam|Broccoli|Pepper|Onion|Turnip|Artichoke|Barley)$/.test(
      name,
    )
  )
    return "Resources"; // crops
  if (
    /^(Apple|Blueberry|Orange|Banana|Tomato|Lemon|Grape|Rice|Olive|Duskberry|Lunara|Celestine)$/.test(
      name,
    )
  )
    return "Resources"; // fruits
  if (/^(Wood|Stone|Iron|Gold|Crimstone|Sunstone|Oil|Salt|Honey|Milk|Egg|Feather|Wool|Merino Wool|Leather|Gem)$/.test(name))
    return "Resources";
  if (/ Pansy$| Cosmos$| Balloon Flower$| Carnation$| Daffodil$| Lotus$| Edelweiss$| Gladiolus$| Lavender$| Clover$|Prism Petal|Celestial Frostbloom|Primula Enigma/i.test(name))
    return "Resources"; // flowers
  if (/Scarecrow|Nancy|Kuebiko|Cauliflower|Parsnip|Bunny|Peeled|Victoria|Cabbage Boy|Cabbage Girl|Purple Trail|Obie|Maximus|Poppy|Kernaldo|Cornelia|Squirrel Monkey|Nana|Banana Chicken|Apple Pie|Lunar Calendar|Scary Mike|Laurie/i.test(name))
    return "Collectibles"; // boost collectibles
  return "Collectibles"; // safe default
}

/**
 * Parses an `export const OBJECT_NAME: ... = { ... };` block from TS source.
 * Returns an object `{ key: number }`. Keys are unwrapped from quotes if
 * quoted, and lines starting with `//` are skipped.
 */
function parseMappingBlock(source, objectName) {
  const startRe = new RegExp(`export const ${objectName}[^=]*=\\s*\\{`);
  const match = startRe.exec(source);
  if (!match) throw new Error(`Could not find ${objectName} in source`);
  let i = match.index + match[0].length; // position right after the opening {
  let depth = 1;
  const start = i;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  if (depth !== 0) throw new Error(`Unterminated ${objectName}`);
  const body = source.slice(start, i - 1);

  const out = {};
  // Match:   "Quoted Name": 123    or    Identifier: 123
  const entryRe = /(?:^|\n)\s*(?:"([^"]+)"|([A-Za-z_][\w]*))\s*:\s*(\d+)/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const key = m[1] ?? m[2];
    const id = Number(m[3]);
    // Skip commented-out lines (entryRe can't see the comment from here).
    // Peek back to the beginning of the line for a leading "//".
    const lineStart = body.lastIndexOf("\n", m.index - 1) + 1;
    const linePrefix = body.slice(lineStart, m.index);
    if (linePrefix.trim().startsWith("//")) continue;
    out[key] = id;
  }
  return out;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} failed: HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log("[marketplace] fetching SFL source files…");
  const [knownIdsSrc, itemNamesSrc] = await Promise.all([
    fetchText(SOURCES.knownIds),
    fetchText(SOURCES.itemNames),
  ]);

  const KNOWN_IDS = parseMappingBlock(knownIdsSrc, "KNOWN_IDS");
  const ITEM_IDS = parseMappingBlock(itemNamesSrc, "ITEM_IDS");

  console.log(
    `[marketplace] parsed KNOWN_IDS=${Object.keys(KNOWN_IDS).length}, ` +
      `wearable ITEM_IDS=${Object.keys(ITEM_IDS).length}`,
  );

  const items = [];
  // Collectibles + resources: category inferred heuristically.
  for (const [name, id] of Object.entries(KNOWN_IDS)) {
    items.push({ id, name, category: classify(name), type: "collectible" });
  }
  // Wearables: always "Wearables" category.
  for (const [name, id] of Object.entries(ITEM_IDS)) {
    items.push({ id, name, category: "Wearables", type: "wearable" });
  }

  // Buds & Pets are NFTs minted per-ID (no static name). Represent as meta
  // entries so the UI can surface the collection without enumerating 10k IDs.
  items.push({ id: 0, name: "Bud NFTs", category: "Buds", type: "nft-collection" });
  items.push({ id: 0, name: "Pet NFTs", category: "Pets", type: "nft-collection" });

  const categories = Array.from(new Set(items.map((i) => i.category))).sort();

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "sunflower-land/sunflower-land (KNOWN_IDS + ITEM_IDS)",
    categories,
    itemCount: items.length,
    items,
  };

  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`[marketplace] wrote ${items.length} items → ${OUT_PATH}`);
  console.log(`[marketplace] categories: ${categories.join(", ")}`);
}

main().catch((err) => {
  console.error("[marketplace] FAILED:", err.message);
  process.exit(1);
});
