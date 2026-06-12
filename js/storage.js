let currentUser = null;

export function getUser() {
  return currentUser;
}

export function setUser(user) {
  currentUser = user ?? null;
  return currentUser;
}

export function clearUser() {
  currentUser = null;
}
