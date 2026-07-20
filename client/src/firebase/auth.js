// src/firebase/auth.js
// Firebase anonymous authentication helpers

import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import app from "./firebaseConfig";

export const auth = getAuth(app);

/** Signs in anonymously and returns the user object */
export const ensureAnonymousAuth = () =>
  new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } catch (err) {
          reject(err);
        }
      }
    });
  });

/** Returns the current user UID, or null */
export const getCurrentUid = () => auth.currentUser?.uid ?? null;
