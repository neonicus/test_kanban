const USER_KEY = "kanban_user";
const CURRENT_ROOM_KEY = "kanban_current_room";

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getUser() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user) {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  storage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function clearUser() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(USER_KEY);
}

export function getCurrentRoomId() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  return storage.getItem(CURRENT_ROOM_KEY);
}

export function setCurrentRoomId(roomId) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (!roomId) {
    storage.removeItem(CURRENT_ROOM_KEY);
    return;
  }

  storage.setItem(CURRENT_ROOM_KEY, roomId);
}
