import { clearUser, getUser, setUser } from "./storage.js";
import { createUser as apiCreateUser, fetchCurrentUser, logout as apiLogout, updateCurrentUser as apiUpdateCurrentUser } from "./api.js";

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
  const user = getUser();
  if (user) {
    return user;
  }

  try {
    const serverUser = await fetchCurrentUser();
    if (serverUser) {
      setUser(serverUser);
    }
    return serverUser;
  } catch {
    return null;
  }
}

export async function signOut() {
  await apiLogout().catch(() => {});
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
