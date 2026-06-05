function emitChange() {
  window.dispatchEvent(new CustomEvent("kanban:statechange"));
}

function now() {
  return new Date().toISOString();
}

function createDefaultStatuses() {
  return [
    { id: crypto.randomUUID(), name: "Todo", order: 0 },
    { id: crypto.randomUUID(), name: "In Progress", order: 1 },
    { id: crypto.randomUUID(), name: "Review", order: 2 },
    { id: crypto.randomUUID(), name: "Done", order: 3 },
  ];
}

const state = {
  rooms: [],
  currentRoomId: null,
};

export function getRooms() {
  return state.rooms;
}

export function getCurrentRoom() {
  return state.rooms.find((room) => room.id === state.currentRoomId) ?? null;
}

export function selectRoom(roomId) {
  state.currentRoomId = roomId;
  emitChange();
}

export function leaveCurrentRoom() {
  state.currentRoomId = null;
  emitChange();
}

export function createRoom(room) {
  const newRoom = {
    id: crypto.randomUUID(),
    name: room.name,
    description: room.description ?? "",
    ownerName: room.ownerName ?? "You",
    memberCount: 1,
    createdAt: now(),
    statuses: createDefaultStatuses(),
    tasks: [],
  };

  state.rooms.unshift(newRoom);
  state.currentRoomId = newRoom.id;
  emitChange();
  return newRoom;
}

export function addStatus(name) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  const normalizedName = name.trim().toLowerCase();
  const hasDuplicate = room.statuses.some(
    (status) => status.name.trim().toLowerCase() === normalizedName,
  );
  if (hasDuplicate) {
    return null;
  }

  const status = {
    id: crypto.randomUUID(),
    name: name.trim(),
    order: room.statuses.length,
  };

  room.statuses.push(status);
  emitChange();
  return status;
}

export function updateStatus(statusId, name) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  const status = room.statuses.find((item) => item.id === statusId);
  if (!status) {
    return null;
  }

  const normalizedName = name.trim().toLowerCase();
  const hasDuplicate = room.statuses.some(
    (item) => item.id !== statusId && item.name.trim().toLowerCase() === normalizedName,
  );
  if (hasDuplicate) {
    return null;
  }

  status.name = name.trim();
  emitChange();
  return status;
}

export function deleteStatus(statusId) {
  const room = getCurrentRoom();
  if (!room) {
    return false;
  }

  if (room.statuses.length <= 1) {
    return false;
  }

  const hasTasks = room.tasks.some((task) => task.statusId === statusId);
  if (hasTasks) {
    return false;
  }

  room.statuses = room.statuses.filter((status) => status.id !== statusId);
  room.statuses.forEach((status, index) => {
    status.order = index;
  });
  emitChange();
  return true;
}

export function createTask(task) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  const statusId = task.statusId ?? room.statuses[0]?.id;
  if (!statusId) {
    return null;
  }

  const newTask = {
    id: crypto.randomUUID(),
    title: task.title,
    description: task.description ?? "",
    createdBy: task.createdBy ?? "You",
    assignedTo: task.assignedTo ?? null,
    roomId: room.id,
    statusId,
    createdAt: now(),
    updatedAt: now(),
  };

  room.tasks.unshift(newTask);
  emitChange();
  return newTask;
}

export function updateTask(taskId, patch) {
  const room = getCurrentRoom();
  if (!room) {
    return null;
  }

  const task = room.tasks.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  Object.assign(task, {
    ...patch,
    updatedAt: now(),
  });
  emitChange();
  return task;
}

export function deleteTask(taskId) {
  const room = getCurrentRoom();
  if (!room) {
    return false;
  }

  const nextTasks = room.tasks.filter((task) => task.id !== taskId);
  const changed = nextTasks.length !== room.tasks.length;
  room.tasks = nextTasks;
  if (changed) {
    emitChange();
  }
  return changed;
}

export function moveTask(taskId, statusId) {
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
