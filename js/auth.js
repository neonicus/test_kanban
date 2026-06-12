import { clearUser, getUser, setUser } from "./storage.js";
import { createUser as apiCreateUser, fetchCurrentUser, updateCurrentUser as apiUpdateCurrentUser } from "./api.js";

export async function initAuth() {
  const user = getUser();
  if (!user?.token) {
    return null;
  }

  try {
    const serverUser = await fetchCurrentUser();
    if (!serverUser) {
      clearUser();
      return null;
    }

    setUser(serverUser);
    return serverUser;
  } catch {
    clearUser();
    return null;
  }
}

export async function getCurrentUser() {
  return getUser();
}

export async function signOut() {
  clearUser();
}

export async function createUser(displayName) {
  const user = await apiCreateUser(displayName);
  setUser(user);
  return user;
}

export async function updateCurrentUser(displayName) {
  const user = await apiUpdateCurrentUser(displayName);
  setUser(user);
  return user;
}
