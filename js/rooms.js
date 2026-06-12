import {
  createRoom as storeCreateRoom,
  getCurrentRoom,
  getRooms,
  selectRoom,
} from "./boardStore.js";
import { validateRoomName } from "./validation.js";
import { createToast, openRoomModal } from "./ui.js";

export function renderLanding(container) {
  if (!container) {
    return;
  }

  const rooms = getRooms();
  const activeRoom = getCurrentRoom();

  container.innerHTML = `
    <div class="landing-actions">
      <button id="create-room-btn" class="button button-primary" type="button">Create Room</button>
    </div>
    <div id="room-list-state" class="room-cards"></div>
  `;

  const createRoomBtn = container.querySelector("#create-room-btn");
  createRoomBtn.addEventListener("click", async () => {
    const room = await openRoomModal();
    if (!room) {
      return;
    }

    if (!validateRoomName(room.name)) {
      createToast("Room name is required");
      return;
    }

    const createdRoom = await storeCreateRoom({
      name: room.name,
      description: room.description,
    });

    if (!createdRoom) {
      createToast("Unable to create room");
      return;
    }

    createToast("Room created successfully");
  });

  renderRoomCards(container.querySelector("#room-list-state"), rooms, activeRoom);
}

function renderRoomCards(container, rooms = getRooms(), activeRoom = getCurrentRoom()) {
  if (!container) {
    return;
  }

  if (!rooms.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>No rooms yet</strong>
          <p class="muted">Click "Create Room" to start a new board.</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = rooms
    .map(
      (room) => `
        <article class="room-card ${activeRoom?.id === room.id ? "room-card-active" : ""}">
          <div class="room-card-header">
            <div>
              <h3>${room.name}</h3>
              <p class="muted">${room.description || "No description"}</p>
            </div>
            <span class="chip">${room.memberCount} member${room.memberCount > 1 ? "s" : ""}</span>
          </div>
          <div class="room-card-meta">
            <span>Owner: ${room.ownerName}</span>
            <span>Created: ${new Date(room.createdAt).toLocaleString()}</span>
          </div>
          <div class="room-card-actions">
            <button class="button" type="button" data-room-action="enter" data-room-id="${room.id}">
              ${activeRoom?.id === room.id ? "Open" : "Enter Room"}
            </button>
          </div>
        </article>
      `,
    )
    .join("");

  container.querySelectorAll("[data-room-action='enter']").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectRoom(button.dataset.roomId);
    });
  });
}

export function createRoom(room) {
  if (!room || !validateRoomName(room.name)) {
    return null;
  }

  return storeCreateRoom({
    name: room.name,
    description: room.description ?? "",
  });
}

export function joinRoom(roomId) {
  selectRoom(roomId);
  return getCurrentRoom();
}

export function getActiveRoom() {
  return getCurrentRoom();
}
