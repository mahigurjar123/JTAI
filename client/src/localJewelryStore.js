// Temporary in-memory jewelry catalog — used while Firebase Firestore/Storage
// are not yet enabled on the project. Seeded with a default catalog (bundled
// assets) so the app always has something to show; items added via
// AdminPanel are also kept here for the session, but reset on page refresh.
// Swap back to the Firebase-backed AdminPanel/JewelrySelector calls once
// Firestore + Storage are enabled.

import neckGoldKundan from "./assets/jewelry/neck_gold_kundan.png";
import earEmeraldDrops from "./assets/jewelry/ear_emerald_drops.png";
import noseMinimalRing from "./assets/jewelry/nose_minimal_ring.png";
import tikkaRoyalPearl from "./assets/jewelry/tikka_royal_pearl.png";

const DEFAULT_CATALOG = [
  {
    id: "default-neck-gold-kundan",
    name: "Gold Kundan Bridal Necklace",
    category: "necklace",
    imageUrl: neckGoldKundan,
    anchorPoint: { x: 0.5, y: 0.02 },
    tags: ["bridal", "heavy", "trending"],
    price: 45000,
    active: true,
    createdAt: 0,
  },
  {
    id: "default-ear-emerald-drops",
    name: "Emerald Drop Earrings",
    category: "earrings",
    imageUrl: earEmeraldDrops,
    anchorPoint: { x: 0.5, y: 0.05 },
    tags: ["minimal", "daily-wear", "trending"],
    price: 18000,
    active: true,
    createdAt: 0,
  },
  {
    id: "default-nose-royal-ring",
    name: "Royal Kundan Nath",
    category: "nose-ring",
    imageUrl: noseMinimalRing,
    // Measured centroid of the main ring body (excludes the long side chain)
    anchorPoint: { x: 0.28, y: 0.57 },
    tags: ["bridal", "heavy"],
    price: 22000,
    active: true,
    createdAt: 0,
  },
  {
    id: "default-tikka-royal-pearl",
    name: "Royal Pearl Maang Tikka",
    category: "maang-tikka",
    imageUrl: tikkaRoyalPearl,
    anchorPoint: { x: 0.5, y: 0.03 },
    tags: ["bridal", "trending"],
    price: 15000,
    active: true,
    createdAt: 0,
  },
];

let items = [...DEFAULT_CATALOG];
let nextId = 1;
const listeners = new Set();

const notify = () => listeners.forEach((cb) => cb(items));

export const subscribeLocalJewelry = (cb) => {
  listeners.add(cb);
  cb(items);
  return () => listeners.delete(cb);
};

export const getLocalJewelry = () => items;

export const addLocalJewelryItem = (data) => {
  const item = {
    id: `local-${nextId++}`,
    ...data,
    createdAt: Date.now(),
  };
  items = [item, ...items];
  notify();
  return item.id;
};

export const toggleLocalJewelryActive = (id, active) => {
  items = items.map((item) => (item.id === id ? { ...item, active } : item));
  notify();
};

export const deleteLocalJewelryItem = (id) => {
  items = items.filter((item) => item.id !== id);
  notify();
};
