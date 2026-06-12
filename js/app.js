import { createUser, initAuth, getCurrentUser, updateCurrentUser } from "./auth.js";
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
    button.textContent = user ? "Change User" : "Login";
  }
}

async function openIdentityFlow() {
  const existingUser = await getCurrentUser();
  const displayName = await openIdentityModal({
    title: existingUser ? "Change user" : "Create user",
    description: existingUser
      ? "Update the lightweight profile used for this browser."
      : "Create a lightweight user profile to continue.",
    submitText: existingUser ? "Save Name" : "Create User",
    initialName: existingUser?.displayName ?? "",
  });

  if (!displayName) {
    return false;
  }

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

  document.getElementById("identity-action-btn")?.addEventListener("click", async () => {
    await openIdentityFlow();
  });

  await loadBoardState();
  const stopPolling = subscribeToRoomUpdates();
  window.addEventListener("beforeunload", stopPolling, { once: true });
  await setCurrentUserLabel();
  renderApp();
  createToast("App shell loaded");
}

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("kanban:statechange", renderApp);
