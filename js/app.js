import { createUser, initAuth, getCurrentUser, updateCurrentUser } from "./auth.js";
import { loadBoardState } from "./boardStore.js";
import { renderLanding } from "./rooms.js";
import { renderKanban } from "./kanban.js";
import { subscribeToRoomUpdates } from "./realtime.js";
import { createToast } from "./ui.js";

const roomListEl = () => document.getElementById("room-list");
const kanbanEl = () => document.getElementById("kanban-board");

async function setCurrentUserLabel() {
  const label = document.getElementById("current-user");
  const input = document.getElementById("display-name-input");
  const button = document.getElementById("identity-action-btn");
  const user = await getCurrentUser();
  label.textContent = user ? user.displayName : "Guest";
  if (input) {
    input.value = user?.displayName ?? "";
    input.placeholder = user ? "Update name" : "Enter name";
  }
  if (button) {
    button.textContent = user ? "Save Name" : "Create User";
  }
}

async function submitIdentityForm(event) {
  event.preventDefault();

  const input = document.getElementById("display-name-input");
  const displayName = input?.value.trim();

  if (!displayName) {
    createToast("Name is required");
    return false;
  }

  if (displayName.length > 30) {
    createToast("Name must be 30 characters or less");
    return false;
  }

  const existingUser = await getCurrentUser();
  if (existingUser?.token) {
    await updateCurrentUser(displayName);
    createToast("User updated successfully");
  } else {
    await createUser(displayName);
    createToast("User created successfully");
  }

  await setCurrentUserLabel();
  return true;
}

function renderApp() {
  renderLanding(roomListEl());
  renderKanban(kanbanEl());
}

async function bootstrap() {
  await initAuth();

  await loadBoardState();
  const stopPolling = subscribeToRoomUpdates();
  window.addEventListener("beforeunload", stopPolling, { once: true });
  await setCurrentUserLabel();
  document.getElementById("identity-form")?.addEventListener("submit", submitIdentityForm);
  renderApp();
  createToast("App shell loaded");
}

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("kanban:statechange", renderApp);
