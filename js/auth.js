import { clearUser, getUser, setUser } from "./storage.js";

export async function initAuth() {
  return getUser();
}

export async function getCurrentUser() {
  return getUser();
}

export async function signOut() {
  await clearUser();
}

export async function createUser(displayName) {
  const user = {
    token: crypto.randomUUID(),
    displayName,
  };

  await setUser(user);
  return user;
}
