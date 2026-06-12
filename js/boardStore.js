import {
  addStatus as apiAddStatus,
  createRoom as apiCreateRoom,
  createTask as apiCreateTask,
  deleteStatus as apiDeleteStatus,
  deleteTask as apiDeleteTask,
  fetchSession,
  getRoom as apiGetRoom,
  joinRoom as apiJoinRoom,
  listRooms as apiListRooms,
  updateSession as apiUpdateSession,
  updateStatus as apiUpdateStatus,
  updateTask as apiUpdateTask,
} from "./api.js";

function emitChange() {
  window.dispatchEvent(new CustomEvent("kanban:statechange"));
}

const state = {
  rooms: [],
  currentRoomId: null,
  currentRoom: null,
  ready: false,
};

export function getRooms() {
  return state.rooms;
}

export function getCurrentRoom() {
  return state.currentRoom;
}

async function refreshCurrentRoom() {
  if (!state.currentRoomId) {
    state.currentRoom = null;
    return null;
  }

  try {
    state.currentRoom = await apiGetRoom(state.currentRoomId);
    return state.currentRoom;
  } catch {
    state.currentRoom = null;
    state.currentRoomId = null;
    return null;
  }
}

export async function loadBoardState() {
  state.rooms = await apiListRooms();
  const session = await fetchSession();
  state.currentRoomId = session?.currentRoomId ?? null;
  await refreshCurrentRoom();
  state.ready = true;
  emitChange();
  return state;
}

export async function refreshBoardState() {
  state.rooms = await apiListRooms();
  await refreshCurrentRoom();
  emitChange();
  return state;
}

export async function selectRoom(roomId) {
  state.currentRoomId = roomId;
  try {
    await apiUpdateSession(roomId);
    await refreshCurrentRoom();
    state.rooms = await apiListRooms();
    emitChange();
    return state.currentRoom;
  } catch {
    state.currentRoom = null;
    emitChange();
    return null;
  }
}

export async function joinRoom(roomId) {
  try {
    const joinedRoom = await apiJoinRoom(roomId);
    state.rooms = await apiListRooms();
    state.currentRoomId = joinedRoom.id;
    state.currentRoom = joinedRoom;
    await apiUpdateSession(joinedRoom.id);
    emitChange();
    return joinedRoom;
  } catch {
    return null;
  }
}

export function leaveCurrentRoom() {
  state.currentRoomId = null;
  state.currentRoom = null;
  apiUpdateSession(null).catch(() => {});
  emitChange();
}

export async function createRoom(room) {
  try {
    const createdRoom = await apiCreateRoom(room);
    state.rooms = await apiListRooms();
    state.currentRoomId = createdRoom.id;
    state.currentRoom = createdRoom;
    await apiUpdateSession(createdRoom.id);
    emitChange();
    return createdRoom;
  } catch {
    return null;
  }
}

export async function addStatus(name) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  try {
    const status = await apiAddStatus(room.id, name);
    await refreshBoardState();
    emitChange();
    return status;
  } catch {
    return null;
  }
}

export async function updateStatus(statusId, name) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  try {
    const updated = await apiUpdateStatus(statusId, name);
    await refreshBoardState();
    emitChange();
    return updated;
  } catch {
    return null;
  }
}

export async function deleteStatus(statusId) {
  const room = getCurrentRoom();
  if (!room) {
    return false;
  }

  try {
    await apiDeleteStatus(statusId);
    await refreshBoardState();
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export async function createTask(task) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  const statusId = task.statusId ?? room.statuses[0]?.id;
  if (!statusId) {
    return null;
  }

  try {
    const newTask = await apiCreateTask(room.id, {
      title: task.title,
      description: task.description ?? "",
      assignedTo: task.assignedTo ?? null,
      statusId,
    });
    await refreshBoardState();
    emitChange();
    return newTask;
  } catch {
    return null;
  }
}

export async function updateTask(taskId, patch) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  try {
    const updated = await apiUpdateTask(taskId, patch);
    await refreshBoardState();
    emitChange();
    return updated;
  } catch {
    return null;
  }
}

export async function deleteTask(taskId) {
  const room = getCurrentRoom();
  if (!room) {
    return false;
  }

  try {
    await apiDeleteTask(taskId);
    await refreshBoardState();
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export async function moveTask(taskId, statusId) {
  return updateTask(taskId, { statusId });
}

export function getCurrentRoomSnapshot() {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  return {
    ...room,
    statuses: [...room.statuses].sort((a, b) => a.order - b.order),
    tasks: [...room.tasks],
  };
}
