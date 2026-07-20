// src/firebase/storage.js
// Firebase Storage upload helpers

import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import app from "./firebaseConfig";

export const storage = getStorage(app);

/**
 * Upload a file to Firebase Storage with progress callback.
 *
 * @param {string} path       — Storage path e.g. "jewelry/necklace/j-001.png"
 * @param {File}   file       — The File object to upload
 * @param {Function} onProgress — Called with (0-100) during upload
 * @returns {Promise<string>}  — Download URL
 */
export const uploadFile = (path, file, onProgress) =>
  new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
    });

    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (err) => reject(err),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });

/**
 * Upload a user's photo (blob / File)
 * Path: users/{uid}/photos/{type}.jpg   (type = "half" | "full")
 *
 * @param {string} uid
 * @param {"half"|"full"} type
 * @param {File|Blob} file
 * @param {Function} onProgress
 * @returns {Promise<string>}
 */
export const uploadUserPhoto = (uid, type, file, onProgress) =>
  uploadFile(`users/${uid}/photos/${type}.jpg`, file, onProgress);

/**
 * Upload an admin jewelry image
 * Path: jewelry/{category}/{filename}
 *
 * @param {string} category — "necklace" | "earrings" etc.
 * @param {string} filename — e.g. "j-1721234567890.png"
 * @param {File}   file
 * @param {Function} onProgress
 * @returns {Promise<string>}
 */
export const uploadJewelryImage = (category, filename, file, onProgress) =>
  uploadFile(`jewelry/${category}/${filename}`, file, onProgress);

/**
 * Delete a file from Storage by its full gs:// or https:// URL
 * Gracefully ignores "object not found" errors.
 */
export const deleteStorageFile = async (url) => {
  try {
    const fileRef = ref(storage, url);
    await deleteObject(fileRef);
  } catch (err) {
    if (err.code !== "storage/object-not-found") throw err;
  }
};
