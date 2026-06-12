import { FIREBASE_CONFIG } from "./config.js";

export function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey) {
    return null;
  }

  return {
    config: FIREBASE_CONFIG,
  };
}
