import { clearUser, setUser } from "./storage.js";
import {
  createUser as apiCreateUser,
  fetchCurrentUser,
  logout as apiLogout,
  updateCurrentUser as apiUpdateCurrentUser,
  fetchSession,
} from "./api.js";

export async function initAuth() {
  try {
    const session = await fetchSession();
    if (!session?.user) {
      clearUser();
      return null;
    }

    setUser(session.user);
    return session.user;
  } catch {
    clearUser();
    return null;
  }
}

export async function getCurrentUser() {
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
