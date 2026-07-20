// src/firebase/firestore.js
// Firestore helpers for the jewelry catalog

import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import app from "./firebaseConfig";

export const db = getFirestore(app);

const JEWELRY_COL = "jewelry";

// ── READ ─────────────────────────────────────────────────────

/** Fetch all active jewelry items (for user-facing catalog) */
export const fetchActiveJewelry = async () => {
  const q = query(
    collection(db, JEWELRY_COL),
    where("active", "==", true),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Fetch ALL jewelry items (for admin panel) */
export const fetchAllJewelry = async () => {
  const q = query(collection(db, JEWELRY_COL), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Fetch a single jewelry item by ID */
export const fetchJewelryById = async (id) => {
  const snap = await getDoc(doc(db, JEWELRY_COL, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// ── WRITE ────────────────────────────────────────────────────

/**
 * Add a new jewelry item to Firestore.
 * @param {object} data — jewelry metadata (without id/createdAt)
 * @returns {string} The new document ID
 */
export const addJewelryItem = async (data) => {
  const ref = await addDoc(collection(db, JEWELRY_COL), {
    ...data,
    active: data.active ?? true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

/**
 * Update any fields on a jewelry item
 * @param {string} id
 * @param {object} updates
 */
export const updateJewelryItem = async (id, updates) => {
  await updateDoc(doc(db, JEWELRY_COL, id), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

/** Toggle active status */
export const toggleJewelryActive = async (id, active) => {
  await updateDoc(doc(db, JEWELRY_COL, id), {
    active,
    updatedAt: serverTimestamp(),
  });
};

/** Permanently delete a jewelry item */
export const deleteJewelryItem = async (id) => {
  await deleteDoc(doc(db, JEWELRY_COL, id));
};
