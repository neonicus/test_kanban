import { createUser, initAuth, getCurrentUser } from "./auth.js";
import { loadBoardState } from "./boardStore.js";
import { renderLanding } from "./rooms.js";
import { renderKanban } from "./kanban.js";
import { subscribeToRoomUpdates } from "./realtime.js";
import { createToast, openIdentityModal } from "./ui.js";

const roomListEl = () => document.getElementById("room-list");
const kanbanEl = () => document.getElementById("kanban-board");

async function setCurrentUserLabel() {
  const label = document.getElementById("current-user");
  const button = document.getElementById("identity-action-btn");
  const user = await getCurrentUser();
  label.textContent = user ? user.displayName : "Guest";
  if (button) {
    button.textContent = user ? "Change Name" : "Create User";
  }
}

async function openIdentityFlow() {
  const displayName = await openIdentityModal();
  if (!displayName) {
    return false;
  }

  await createUser(displayName);
  await setCurrentUserLabel();
  return true;
}

function renderApp() {
  renderLanding(roomListEl());
  renderKanban(kanbanEl());
}

async function bootstrap() {
  await initAuth();

  let createdUser = false;
  const existingUser = await getCurrentUser();
  if (!existingUser) {
    createdUser = await openIdentityFlow();
  }

  await loadBoardState();
  const stopPolling = subscribeToRoomUpdates();
  window.addEventListener("beforeunload", stopPolling, { once: true });
  await setCurrentUserLabel();
  document.getElementById("identity-action-btn")?.addEventListener("click", async () => {
    const changed = await openIdentityFlow();
    if (changed) {
      createToast("User updated successfully");
    }
  });
  renderApp();
  createToast(createdUser ? "User created successfully" : "App shell loaded");
}

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("kanban:statechange", renderApp);
