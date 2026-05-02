/**
 * Imports crop, fruit, and greenhouse produce metadata from the SFL repo.
 *
 * Extracts static game data — plant/harvest time, seed cost (coins),
 * shop sell price (coins), bumpkin level, plantingSpot, isBush — for:
 *   - Crops (22 varieties)
 *   - Greenhouse crops (Rice, Olive)
 *   - Patch fruits (9 varieties, incl. bushes and full-moon)
 *   - Greenhouse fruits (Grape)
 *
 * Combined with live sfl.world P2P prices, this lets us rank produce by
 * FLOWER/hour/plot to find the best yield for Master's farm.
 *
 * Output: src/data/produce.json
 * Run:    node scripts/import-produce.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "data", "produce.json");

const BASE =
  "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types";

const SOURCES = [
  {
    file: "crops.ts",
    constants: ["CROPS", "CROP_SEEDS", "GREENHOUSE_CROPS", "GREENHOUSE_SEEDS"],
  },
  {
    file: "fruits.ts",
    constants: [
      "PATCH_FRUIT",
      "PATCH_FRUIT_SEEDS",
      "GREENHOUSE_FRUIT",
      "GREENHOUSE_FRUIT_SEEDS",
    ],
  },
];

// ---------- TypeScript AST helpers (copied from import-recipes.mjs) ----------

function evalNumeric(node) {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  ) {
    const v = evalNumeric(node.operand);
    return v === undefined ? undefined : -v;
  }
  if (ts.isBinaryExpression(node)) {
    const l = evalNumeric(node.left);
    const r = evalNumeric(node.right);
    if (l === undefined || r === undefined) return undefined;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken:
        return l * r;
      case ts.SyntaxKind.PlusToken:
        return l + r;
      case ts.SyntaxKind.MinusToken:
        return l - r;
      case ts.SyntaxKind.SlashToken:
        return l / r;
    }
  }
  if (ts.isParenthesizedExpression(node)) return evalNumeric(node.expression);
  return undefined;
}

function propName(prop) {
  if (ts.isIdentifier(prop.name)) return prop.name.text;
  if (ts.isStringLiteral(prop.name)) return prop.name.text;
  if (ts.isNumericLiteral(prop.name)) return prop.name.text;
  return undefined;
}

function extractConsts(source, names) {
  const sf = ts.createSourceFile(
    "input.ts",
    source,
    ts.ScriptTarget.ESNext,
    true,
  );
  const found = {};
  function walk(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          names.includes(decl.name.text) &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          found[decl.name.text] = decl.initializer;
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return found;
}

/** Converts an object-literal node with simple scalar fields to a JS object. */
function parseEntry(objLit) {
  const out = {};
  for (const p of objLit.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const k = propName(p);
    if (!k) continue;
    const init = p.initializer;
    if (ts.isStringLiteral(init)) {
      out[k] = init.text;
    } else if (
      init.kind === ts.SyntaxKind.TrueKeyword ||
      init.kind === ts.SyntaxKind.FalseKeyword
    ) {
      out[k] = init.kind === ts.SyntaxKind.TrueKeyword;
    } else {
      const num = evalNumeric(init);
      if (num !== undefined) out[k] = num;
    }
  }
  return out;
}

function parseRecord(objLit) {
  const out = {};
  for (const prop of objLit.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = propName(prop);
    if (!key) continue;
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;
    out[key] = parseEntry(prop.initializer);
  }
  return out;
}

// ---------- main ----------

async function main() {
  const result = {};
  for (const src of SOURCES) {
    const url = `${BASE}/${src.file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    const text = await res.text();
    const consts = extractConsts(text, src.constants);
    for (const name of src.constants) {
      if (!consts[name]) {
        console.warn(`  [warn] ${name} not found in ${src.file}`);
        continue;
      }
      result[name] = parseRecord(consts[name]);
      console.log(
        `  parsed ${name}: ${Object.keys(result[name]).length} entries`,
      );
    }
  }

  // Normalize into a flat "produce" list that joins crop + seed metadata.
  const produce = [];

  const joinCropLike = (cropsObj, seedsObj, category, fallbackYield = 1) => {
    for (const [cropName, crop] of Object.entries(cropsObj)) {
      if (crop.disabled) continue;
      // Find matching seed (by yield field, or `${cropName} Seed` convention).
      let seedName, seed;
      for (const [sn, s] of Object.entries(seedsObj)) {
        if (s.yield === cropName) {
          seedName = sn;
          seed = s;
          break;
        }
      }
      if (!seed) continue;
      const plantSeconds = seed.plantSeconds ?? crop.harvestSeconds;
      produce.push({
        name: cropName,
        category,
        seedName,
        seedPriceCoins: seed.price,
        bumpkinLevel: seed.bumpkinLevel,
        plantingSpot: seed.plantingSpot,
        plantSeconds,
        sellPriceCoins: crop.sellPrice,
        yieldPerPlant: fallbackYield,
        isBush: !!crop.isBush,
      });
    }
  };

  joinCropLike(result.CROPS ?? {}, result.CROP_SEEDS ?? {}, "Crop");
  joinCropLike(
    result.GREENHOUSE_CROPS ?? {},
    result.GREENHOUSE_SEEDS ?? {},
    "Greenhouse Crop",
  );
  joinCropLike(result.PATCH_FRUIT ?? {}, result.PATCH_FRUIT_SEEDS ?? {}, "Fruit");
  joinCropLike(
    result.GREENHOUSE_FRUIT ?? {},
    result.GREENHOUSE_FRUIT_SEEDS ?? {},
    "Greenhouse Fruit",
  );

  // Sort by plant time asc for readability.
  produce.sort((a, b) => a.plantSeconds - b.plantSeconds);

  const payload = {
    generatedAt: new Date().toISOString(),
    source: `${BASE}/{crops,fruits}.ts`,
    count: produce.length,
    produce,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${produce.length} produce entries to ${OUT_PATH}`);
  console.log(
    `  Crop: ${produce.filter((p) => p.category === "Crop").length}`,
    `Greenhouse Crop: ${produce.filter((p) => p.category === "Greenhouse Crop").length}`,
    `Fruit: ${produce.filter((p) => p.category === "Fruit").length}`,
    `Greenhouse Fruit: ${produce.filter((p) => p.category === "Greenhouse Fruit").length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
