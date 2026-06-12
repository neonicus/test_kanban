import { API_BASE_URL } from "./config.js";

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

export async function fetchCurrentUser() {
  return request("/me");
}

export async function createUser(displayName) {
  return request("/auth/login", {
    method: "POST",
    body: { displayName },
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function updateCurrentUser(displayName) {
  return request("/me", {
    method: "PATCH",
    body: { displayName },
  });
}

export async function logout() {
  return request("/auth/logout", {
    method: "POST",
  });
}

export async function listRooms() {
  return request("/rooms");
}

export async function getRoom(roomId) {
  return request(`/rooms/${roomId}`);
}

export async function createRoom(room) {
  return request("/rooms", {
    method: "POST",
    body: {
      name: room.name,
      description: room.description ?? "",
    },
  });
}

export async function joinRoom(roomId) {
  return request(`/rooms/${roomId}/join`, {
    method: "POST",
    body: {},
  });
}

export async function addStatus(roomId, name) {
  return request(`/rooms/${roomId}/statuses`, {
    method: "POST",
    body: { name },
  });
}

export async function updateStatus(statusId, name) {
  return request(`/statuses/${statusId}`, {
    method: "PATCH",
    body: { name },
  });
}

export async function deleteStatus(statusId) {
  return request(`/statuses/${statusId}`, {
    method: "DELETE",
  });
}

export async function createTask(roomId, task) {
  return request(`/rooms/${roomId}/tasks`, {
    method: "POST",
    body: task,
  });
}

export async function updateTask(taskId, patch) {
  return request(`/tasks/${taskId}`, {
    method: "PATCH",
    body: patch,
  });
}

export async function deleteTask(taskId) {
  return request(`/tasks/${taskId}`, {
    method: "DELETE",
  });
}
