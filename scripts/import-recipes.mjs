/**
 * Imports recipe data straight from the open-source Sunflower Land repo.
 *
 * Fetches a few `.ts` source files from GitHub, walks their TypeScript AST
 * with the official TypeScript compiler, and extracts ingredient/coin/sfl
 * data into a structured JSON file at `src/data/recipes.json`.
 *
 * Run via: `node scripts/import-recipes.mjs`
 *
 * The script intentionally has zero side-effects on the running app — the
 * generated JSON is committed alongside source.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "src", "data", "recipes.json");

const BASE = "https://raw.githubusercontent.com/sunflower-land/sunflower-land/main/src/features/game/types";

/**
 * Each entry tells the importer which top-level constants to extract from a
 * given source file, and which category to assign to those recipes.
 */
const SOURCES = [
  {
    file: "buildings.ts",
    extracts: [{ const: "BUILDINGS", category: "Buildings" }],
  },
  {
    file: "tools.ts",
    extracts: [
      { const: "WORKBENCH_TOOLS", category: "Tools" },
      { const: "TREASURE_TOOLS", category: "Tools" },
    ],
  },
  {
    file: "consumables.ts",
    extracts: [
      { const: "FIRE_PIT_COOKABLES", category: "Food" },
      { const: "KITCHEN_COOKABLES", category: "Food" },
      { const: "BAKERY_COOKABLES", category: "Food" },
      { const: "DELI_COOKABLES", category: "Food" },
      { const: "JUICE_COOKABLES", category: "Food" },
      { const: "COOKABLE_CAKES", category: "Food" },
    ],
  },
  {
    file: "craftables.ts",
    extracts: [
      { const: "FOODS", category: "Food" },
      { const: "CAKES", category: "Food" },
      { const: "TOOLS", category: "Tools" },
      { const: "SHOVELS", category: "Tools" },
      { const: "BLACKSMITH_ITEMS", category: "Decorations" },
      { const: "MARKET_ITEMS", category: "Decorations" },
      { const: "BARN_ITEMS", category: "Decorations" },
      { const: "WAR_BANNERS", category: "Decorations" },
      { const: "ANIMALS", category: "Other" },
      { const: "QUEST_ITEMS", category: "Other" },
    ],
  },
  {
    file: "decorations.ts",
    extracts: [
      { const: "LANDSCAPING_DECORATIONS", category: "Decorations" },
      { const: "POTION_HOUSE_DECORATIONS", category: "Decorations" },
      { const: "DECORATIONS", category: "Decorations" },
    ],
  },
];

async function fetchFile(file) {
  const url = `${BASE}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return await res.text();
}

/**
 * Walks the AST of a source file and returns the requested top-level
 * `export const X = { ... }` object literals.
 */
/**
 * Some SFL exports are wrapped in arrow functions: `export const X = () => ({...})`.
 * Unwrap and return the inner ObjectLiteralExpression, or null if the shape is
 * something unexpected.
 */
function unwrapToObject(node) {
  if (!node) return null;
  if (ts.isObjectLiteralExpression(node)) return node;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    let body = node.body;
    if (ts.isParenthesizedExpression(body)) body = body.expression;
    if (ts.isObjectLiteralExpression(body)) return body;
    if (ts.isBlock(body)) {
      // look for a single `return { ... };` statement
      for (const stmt of body.statements) {
        if (ts.isReturnStatement(stmt) && stmt.expression) {
          const u = unwrapToObject(stmt.expression);
          if (u) return u;
        }
      }
    }
  }
  if (ts.isParenthesizedExpression(node)) return unwrapToObject(node.expression);
  return null;
}

function extractConsts(source, names) {
  const sf = ts.createSourceFile("input.ts", source, ts.ScriptTarget.ESNext, true);
  const found = {};
  function walk(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          names.includes(decl.name.text) &&
          decl.initializer
        ) {
          const obj = unwrapToObject(decl.initializer);
          if (obj) found[decl.name.text] = obj;
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return found;
}

/** Evaluates a numeric expression: number literals, `60 * 60`, `Infinity`. */
function evalNumeric(node) {
  if (!node) return undefined;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const v = evalNumeric(node.operand);
    return v === undefined ? undefined : -v;
  }
  if (ts.isBinaryExpression(node)) {
    const l = evalNumeric(node.left);
    const r = evalNumeric(node.right);
    if (l === undefined || r === undefined) return undefined;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken: return l * r;
      case ts.SyntaxKind.PlusToken: return l + r;
      case ts.SyntaxKind.MinusToken: return l - r;
      case ts.SyntaxKind.SlashToken: return l / r;
    }
  }
  if (ts.isIdentifier(node) && node.text === "Infinity") return Infinity;
  return undefined;
}

/** Extracts the numeric value from a `new Decimal(N)` or `new Decimal("N")`. */
function evalDecimal(node) {
  if (!node) return undefined;
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Decimal") {
    const arg = node.arguments?.[0];
    if (!arg) return undefined;
    if (ts.isStringLiteral(arg)) return Number(arg.text);
    return evalNumeric(arg);
  }
  // Plain number fallback (some tables don't use Decimal).
  return evalNumeric(node);
}

/** Extracts the string content of a property name (handles "quoted" too). */
function propName(prop) {
  if (ts.isIdentifier(prop.name)) return prop.name.text;
  if (ts.isStringLiteral(prop.name)) return prop.name.text;
  if (ts.isNumericLiteral(prop.name)) return prop.name.text;
  return undefined;
}

/**
 * Given an object literal expression and a known shape (`buildings`, `tools`,
 * `consumables`, `craftables`), returns an array of normalized Recipe entries.
 */
function parseRecipes(obj, category, kind) {
  const out = [];
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propName(prop);
    if (!name) continue;
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

    const def = prop.initializer;
    const rec = {
      key: toKey(name),
      name,
      category,
      ingredients: {},
    };

    let hasIngredients = false;
    let hasCost = false;

    for (const p of def.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const k = propName(p);
      if (k === "coins" || k === "price") {
        const v = evalNumeric(p.initializer);
        if (v !== undefined && Number.isFinite(v) && v > 0) {
          rec.coins = v;
          hasCost = true;
        }
      } else if (k === "sfl" || k === "flower") {
        const v = evalDecimal(p.initializer) ?? evalNumeric(p.initializer);
        if (v !== undefined && Number.isFinite(v) && v > 0) {
          rec.flower = v;
          hasCost = true;
        }
      } else if (k === "ingredients") {
        // Some recipes wrap ingredients in `() => ({...})` for skill-based variants.
        const ingObj = unwrapToObject(p.initializer);
        if (ingObj) {
          for (const ing of ingObj.properties) {
            if (!ts.isPropertyAssignment(ing)) continue;
            const ingName = propName(ing);
            if (!ingName) continue;
            const amt = evalDecimal(ing.initializer);
            if (amt !== undefined && amt > 0) {
              rec.ingredients[ingName] = amt;
              hasIngredients = true;
            }
          }
        } else if (ts.isArrayLiteralExpression(p.initializer)) {
          // [{ item: "Wood", amount: new Decimal(5) }, ...]
          for (const el of p.initializer.elements) {
            if (!ts.isObjectLiteralExpression(el)) continue;
            let item, amount;
            for (const sub of el.properties) {
              if (!ts.isPropertyAssignment(sub)) continue;
              const sk = propName(sub);
              if (sk === "item") {
                if (ts.isStringLiteral(sub.initializer)) item = sub.initializer.text;
              } else if (sk === "amount") {
                amount = evalDecimal(sub.initializer);
              }
            }
            if (item && amount && amount > 0) {
              rec.ingredients[item] = amount;
              hasIngredients = true;
            }
          }
        }
      } else if (k === "experience" && kind === "consumable") {
        const v = evalNumeric(p.initializer);
        if (v !== undefined) rec.experience = v;
      } else if (k === "building" && kind === "consumable") {
        if (ts.isStringLiteral(p.initializer)) rec.building = p.initializer.text;
      } else if (k === "cookingSeconds" && kind === "consumable") {
        const v = evalNumeric(p.initializer);
        if (v !== undefined) rec.cookingSeconds = v;
      } else if (k === "constructionSeconds") {
        const v = evalNumeric(p.initializer);
        if (v !== undefined) rec.constructionSeconds = v;
      } else if (k === "marketRate") {
        // Used to derive rough sfl/coin equivalents in older tables.
        const v = evalNumeric(p.initializer);
        if (v !== undefined && v > 0 && rec.coins === undefined) {
          rec.coins = v;
          hasCost = true;
        }
      }
    }

    // Skip recipes with no actual cost or ingredients (these tend to be
    // placeholders for legacy items, NPCs, or system-only entries).
    if (!hasIngredients && !hasCost) continue;

    out.push(rec);
  }
  return out;
}

function toKey(name) {
  return name.replace(/[^A-Za-z0-9]+/g, "");
}

async function main() {
  const allRecipes = [];
  const seen = new Set();

  for (const src of SOURCES) {
    process.stdout.write(`• fetching ${src.file}... `);
    let text;
    try {
      text = await fetchFile(src.file);
    } catch (e) {
      console.warn(`SKIPPED (${e.message})`);
      continue;
    }
    const constNames = src.extracts.map((e) => e.const);
    const found = extractConsts(text, constNames);

    let count = 0;
    for (const ext of src.extracts) {
      const obj = found[ext.const];
      if (!obj) continue;
      const kind = src.file === "consumables.ts" ? "consumable" : "default";
      const recipes = parseRecipes(obj, ext.category, kind);
      for (const r of recipes) {
        // Disambiguate keys across files (e.g. "Tent" appears in buildings).
        let key = r.key;
        let i = 2;
        while (seen.has(key)) {
          key = `${r.key}_${i++}`;
        }
        r.key = key;
        seen.add(key);
        allRecipes.push(r);
        count++;
      }
    }
    console.log(`${count} recipes`);
  }

  allRecipes.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(allRecipes, null, 2), "utf8");

  const byCat = {};
  for (const r of allRecipes) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  console.log(`\n✅ Wrote ${allRecipes.length} recipes to ${path.relative(ROOT, OUT_PATH)}`);
  for (const [c, n] of Object.entries(byCat)) console.log(`   ${c.padEnd(12)} ${n}`);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
