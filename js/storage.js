let currentUser = null;
let currentRoomId = null;

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

export function getCurrentRoomId() {
  return currentRoomId;
}

export function setCurrentRoomId(roomId) {
  currentRoomId = roomId || null;
}
