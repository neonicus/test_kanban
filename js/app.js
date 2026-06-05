import { createUser, initAuth, getCurrentUser } from "./auth.js";
import { renderLanding } from "./rooms.js";
import { renderKanban } from "./kanban.js";
import { createToast, openIdentityModal } from "./ui.js";

const roomListEl = () => document.getElementById("room-list");
const kanbanEl = () => document.getElementById("kanban-board");

async function setCurrentUserLabel() {
  const label = document.getElementById("current-user");
  const user = await getCurrentUser();
  label.textContent = user ? user.displayName : "Guest";
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
    const displayName = await openIdentityModal();
    if (displayName) {
      await createUser(displayName);
      createdUser = true;
    }
  }

  await setCurrentUserLabel();
  renderApp();
  createToast(createdUser ? "User created successfully" : "App shell loaded");
}

document.addEventListener("DOMContentLoaded", bootstrap);
window.addEventListener("kanban:statechange", renderApp);
