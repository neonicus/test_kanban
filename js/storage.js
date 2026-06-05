import { STORAGE_FILE } from "./config.js";

let storeCache = null;

async function loadStore() {
  if (storeCache) {
    return storeCache;
  }

  const response = await fetch(new URL(STORAGE_FILE.path, import.meta.url));
  if (!response.ok) {
    throw new Error(`Failed to load storage file: ${response.status}`);
  }

  const data = await response.json();
  storeCache = {
    user: data.user ?? null,
  };

  return storeCache;
}

export async function getUser() {
  const store = await loadStore();
  return store.user;
}

export async function setUser(user) {
  const store = await loadStore();
  store.user = user;
  return store.user;
}

export async function clearUser() {
  const store = await loadStore();
  store.user = null;
}
