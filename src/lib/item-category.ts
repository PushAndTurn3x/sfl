/**
 * Maps an item name to a user-friendly category for the dashboard.
 *
 * Strategy:
 *  1. Hand-curated sets for items that aren't reliably tagged in
 *     marketplace_items.json (Crops, Tools, Buildings, Fish, etc).
 *  2. Fallback to marketplace_items.json `category` field via the
 *     resolveItemId / lookup map in item-ids.ts.
 *  3. Final fallback "Other" so nothing gets silently dropped.
 */

import marketplaceData from "@/data/marketplace_items.json";

export type ItemCategory =
  | "Currency"
  | "Crops"
  | "Seeds"
  | "Fruits"
  | "Resources"
  | "Fish"
  | "Tools"
  | "Buildings"
  | "Land"
  | "Animals"
  | "Food"
  | "Wearables"
  | "Collectibles"
  | "Buds"
  | "Pets"
  | "Other";

interface RawItem {
  id: number;
  name: string;
  category: string;
  type: string;
}

const ITEMS = (marketplaceData.items as RawItem[]) ?? [];
const NAME_INDEX = new Map<string, RawItem>();
for (const it of ITEMS) {
  if (it.name && !NAME_INDEX.has(it.name)) NAME_INDEX.set(it.name, it);
}

// ---- Hand-curated sets (highest priority) ----

const CROPS = new Set([
  "Sunflower", "Potato", "Pumpkin", "Carrot", "Cabbage", "Beetroot",
  "Cauliflower", "Parsnip", "Radish", "Wheat", "Kale", "Rhubarb",
  "Zucchini", "Yam", "Soybean", "Broccoli", "Pepper", "Onion",
  "Turnip", "Artichoke", "Barley", "Corn", "Eggplant",
  "Rice", "Olive", "Grape",
]);

const FRUITS = new Set([
  "Tomato", "Lemon", "Blueberry", "Orange", "Apple", "Banana",
  "Celestine", "Lunara", "Duskberry",
]);

const RAW_RESOURCES = new Set([
  "Wood", "Stone", "Iron", "Gold", "Crimstone", "Sunstone", "Salt",
  "Oil", "Honey", "Egg", "Milk", "Wool", "Feather", "Leather",
  "Merino Wool", "Crude Oil",
]);

const FISH = new Set([
  "Anchovy", "Tuna", "Sea Bass", "Sea Horse", "Horse Mackerel", "Squid",
  "Red Snapper", "Moray Eel", "Olive Flounder", "Halibut", "Parrotfish",
  "Goldfish", "Porgy", "Sunfish", "Zebra Fish", "Surgeonfish", "Angelfish",
  "Hammerhead Shark", "Saw Shark", "Swordfish", "Marlin", "Octopus",
  "Mackerel", "Salmon", "Trout", "Mahi Mahi", "Crab", "Lobster",
  "Coelacanth", "Whale Shark", "Anglerfish", "Tilapia", "Catfish", "Pike",
  "Oarfish", "Weakfish", "Ray", "Muskellunge", "Barnacle", "Isopod",
  "Hermit Crab", "Football fish", "Starlight Tuna", "Twilight Anglerfish",
  "Radiant Ray", "Phantom Barracuda", "Gilded Swordfish", "Crimson Carp",
  "Battle Fish", "Lemon Shark",
]);

const TOOLS = new Set([
  "Axe", "Pickaxe", "Stone Pickaxe", "Iron Pickaxe", "Gold Pickaxe",
  "Rod", "Oil Drill", "Crab Pot", "Mariner Pot", "Salt Rake",
  "Sand Shovel", "Sand Drill", "Petting Hand", "Shovel", "Rusty Shovel",
  "Power Pickaxe", "Power Axe",
]);

const BUILDINGS = new Set([
  "Town Center", "Market", "Workbench", "Fire Pit", "Water Well",
  "Compost Bin", "Kitchen", "Crafting Box", "Barn", "Hen House",
  "Henhouse", "Bakery", "Deli", "Smoothie Shack", "Toolshed",
  "Warehouse", "Tent", "House", "Manor", "Mansion",
  "Premium Compost Bin", "Turbo Composter", "Greenhouse", "Pet House",
  "Aging Shed", "Salt Mine", "Lava Pit", "Crop Machine",
]);

const LAND = new Set([
  "Basic Land", "Crop Plot", "Tree", "Stone Rock", "Iron Rock",
  "Gold Rock", "Crimstone Rock", "Sunstone Rock", "Oil Reserve",
  "Fruit Patch", "Flower Bed", "Beehive", "Mushroom",
]);

const CURRENCY = new Set([
  "Gem", "Cheer", "Floater", "Love Charm", "Mark", "Block Buck",
  "Treasure Token", "Trading Token", "Bud Ticket", "Easter Token",
  "Bumpkin Coupon", "Trade Point",
]);

const ANIMALS = new Set(["Chicken", "Cow", "Sheep"]);

// Foods: cooked items end with these patterns or specific known names.
const FOOD_SUFFIXES = ["Cake", "Stew", "Soup", "Bread", "Bun", "Cookie", "Pie", "Tart", "Smoothie", "Juice", "Salad", "Sandwich", "Stir Fry", "Roast", "Soup"];
const FOOD_KNOWN = new Set([
  "Reindeer Carrot", "Bumpkin Broth", "Mashed Potato", "Boiled Eggs",
  "Kale Stew", "Goblin's Treat", "Cabbers n Mash", "Sunflower Cake",
  "Pumpkin Soup", "Roast Veggies", "Bumpkin Salad", "Goblin Brunch",
  "Fried Tofu", "Club Sandwich", "Popcorn", "Wheat Cake",
  "Bumpkin ganoush", "Honey Cheddar", "Honey Cake", "Orange Cake",
  "Sunflower Crunch", "Cornbread", "Eggplant Cake", "Honey Cup",
  "Beetroot Blaze", "Kale Mushroom Pie", "Wood Bread",
]);

function isFood(name: string): boolean {
  if (FOOD_KNOWN.has(name)) return true;
  return FOOD_SUFFIXES.some((s) => name.endsWith(" " + s));
}

// ---- Public API ----

export function getItemCategory(name: string): ItemCategory {
  if (CURRENCY.has(name)) return "Currency";
  if (CROPS.has(name)) return "Crops";
  if (FRUITS.has(name)) return "Fruits";
  if (name.endsWith(" Seed") || name.endsWith(" Plant")) return "Seeds";
  if (RAW_RESOURCES.has(name)) return "Resources";
  if (FISH.has(name)) return "Fish";
  if (TOOLS.has(name)) return "Tools";
  if (BUILDINGS.has(name)) return "Buildings";
  if (LAND.has(name)) return "Land";
  if (ANIMALS.has(name)) return "Animals";
  if (isFood(name)) return "Food";

  const item = NAME_INDEX.get(name);
  if (item) {
    if (item.category === "Wearables") return "Wearables";
    if (item.category === "Collectibles") return "Collectibles";
    if (item.category === "Buds") return "Buds";
    if (item.category === "Pets") return "Pets";
    if (item.category === "Resources") return "Resources";
    if (item.category === "Seeds") return "Seeds";
  }

  // Common fallbacks for items unique to player-state (banners, scarecrows, dolls)
  if (name.endsWith(" Banner") || name.endsWith(" Scarecrow")) return "Collectibles";
  if (name.endsWith(" Bear")) return "Collectibles";
  if (name.endsWith(" Egg")) return "Collectibles";
  if (name.endsWith(" Doll")) return "Collectibles";

  return "Other";
}

export const CATEGORY_ORDER: ItemCategory[] = [
  "Currency",
  "Crops",
  "Fruits",
  "Seeds",
  "Resources",
  "Fish",
  "Food",
  "Tools",
  "Buildings",
  "Land",
  "Animals",
  "Collectibles",
  "Wearables",
  "Buds",
  "Pets",
  "Other",
];

const CATEGORY_EMOJI: Record<ItemCategory, string> = {
  Currency: "💎",
  Crops: "🌾",
  Fruits: "🍎",
  Seeds: "🌱",
  Resources: "⛏️",
  Fish: "🐟",
  Food: "🍞",
  Tools: "🔧",
  Buildings: "🏠",
  Land: "🟫",
  Animals: "🐔",
  Collectibles: "🎁",
  Wearables: "👕",
  Buds: "🌸",
  Pets: "🐾",
  Other: "📦",
};

export function getCategoryEmoji(c: ItemCategory): string {
  return CATEGORY_EMOJI[c];
}

/** Group an inventory map by category. Categories with 0 items are skipped. */
export function groupByCategory(
  balances: Record<string, number>,
): Map<ItemCategory, Array<{ name: string; qty: number }>> {
  const out = new Map<ItemCategory, Array<{ name: string; qty: number }>>();
  for (const [name, qty] of Object.entries(balances)) {
    const cat = getItemCategory(name);
    const list = out.get(cat) ?? [];
    list.push({ name, qty });
    out.set(cat, list);
  }
  // Sort within each category: highest qty first, then alpha
  for (const list of out.values()) {
    list.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }
  return out;
}
