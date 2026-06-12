import {
  addStatus,
  createTask,
  deleteStatus,
  deleteTask,
  getCurrentRoomSnapshot,
  leaveCurrentRoom,
  moveTask,
  updateStatus,
  updateTask,
} from "./boardStore.js";
import { createUser, getCurrentUser } from "./auth.js";
import { getUser } from "./storage.js";
import { validateStatusName } from "./validation.js";
import {
  createToast,
  openConfirmDialog,
  openIdentityModal,
  openStatusModal,
  openTaskModal,
} from "./ui.js";
import { formatDate } from "./utils.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncate(value, length = 90) {
  if (!value) {
    return "";
  }

  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function getCurrentRoomRole(room) {
  const user = getUser();
  if (!user?.token || !room?.members?.length) {
    return null;
  }

  return room.members.find((member) => member.token === user.token)?.role ?? null;
}

async function ensureLoggedIn() {
  const user = await getCurrentUser();
  if (user) {
    return user;
  }

  const displayName = await openIdentityModal({
    title: "Create user",
    description: "You need a user name before editing the board.",
    submitText: "Create User",
  });

  if (!displayName) {
    return null;
  }

  return createUser(displayName);
}

export function renderKanban(container) {
  if (!container) {
    return;
  }

  const room = getCurrentRoomSnapshot();
  if (!room) {
    container.innerHTML = `
      <div class="empty-state">
        <div>
          <strong>No active room</strong>
          <p class="muted">Create a room and enter it to start working on the board.</p>
        </div>
      </div>
    `;
    return;
  }

  const currentUser = getUser();
  const currentRole = getCurrentRoomRole(room);
  const isOwner = currentRole === "owner";
  const canCreateTasks = currentRole === "owner" || currentRole === "member";
  const canManageStatuses = currentRole === "owner";
  const canViewMembers = Boolean(currentUser);

  const tasksByStatus = room.statuses.map((status) => ({
    status,
    tasks: room.tasks.filter((task) => task.statusId === status.id),
  }));

  container.innerHTML = `
    <div class="kanban-layout">
      <aside class="board-sidebar">
        <div class="sidebar-block">
          <p class="eyebrow">Room</p>
          <h2>${escapeHtml(room.name)}</h2>
          <p class="muted">${escapeHtml(room.description || "No description")}</p>
          <div class="sidebar-actions">
            <button id="copy-room-id-btn" class="button button-small" type="button">Copy Room ID</button>
            <button id="leave-room-btn" class="button button-small" type="button">Leave Room</button>
          </div>
        </div>

        <div class="sidebar-block">
          <p class="eyebrow">My Access</p>
          <div class="chip-row">
            <span class="chip">${escapeHtml(currentRole || "visitor")}</span>
            <span class="chip">${room.statuses.length} statuses</span>
            <span class="chip">${room.tasks.length} tasks</span>
          </div>
          <p class="muted">
            ${currentRole === "owner" ? "You can manage everything in this room." : currentRole === "member" ? "You can work on tasks and move cards." : "You can only view this board until you join the room."}
          </p>
        </div>

        <div class="sidebar-block">
          <p class="eyebrow">Members</p>
          ${
            canViewMembers
              ? `
                <div class="member-list">
                  ${room.members
                    .map(
                      (member) => `
                        <div class="member-row">
                          <div>
                            <strong>${escapeHtml(member.displayName)}</strong>
                            <p class="muted">${escapeHtml(member.role)}</p>
                          </div>
                          <span class="chip">${escapeHtml(member.role)}</span>
                        </div>
                      `,
                    )
                    .join("")}
                </div>
              `
              : `<p class="muted">Login to see member details.</p>`
          }
        </div>
      </aside>

      <section class="board-content">
        <div class="board-header">
          <div>
            <p class="eyebrow">Current Room</p>
            <h2>${escapeHtml(room.name)}</h2>
            <p class="muted">${escapeHtml(room.description || "No description")}</p>
          </div>
          <div class="board-header-actions">
            <button id="add-status-btn" class="button" type="button" ${canManageStatuses ? "" : "disabled"}>Add Status</button>
            <button id="add-task-btn" class="button button-primary" type="button" ${canCreateTasks ? "" : "disabled"}>Add Task</button>
          </div>
        </div>

        <div class="kanban-toolbar">
          <span class="chip">Room ID: ${escapeHtml(room.id)}</span>
          <span class="chip">${room.statuses.length} status${room.statuses.length > 1 ? "es" : ""}</span>
          <span class="chip">${room.tasks.length} task${room.tasks.length !== 1 ? "s" : ""}</span>
        </div>

        <div class="board-columns">
          ${tasksByStatus
            .map(
              ({ status, tasks }) => `
                <section class="board-column" data-status-id="${status.id}">
                  <header class="column-header">
                    <div>
                      <h3>${escapeHtml(status.name)}</h3>
                      <p class="muted">${tasks.length} task${tasks.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div class="column-actions">
                      <button class="button button-small" type="button" data-status-action="edit" data-status-id="${status.id}" ${isOwner ? "" : "disabled"}>Edit</button>
                      <button class="button button-small" type="button" data-status-action="delete" data-status-id="${status.id}" ${isOwner ? "" : "disabled"}>Delete</button>
                    </div>
                  </header>
                  <div class="column-dropzone" data-drop-status-id="${status.id}">
                    ${
                      tasks.length
                        ? tasks
                            .map((task) => {
                              const canEditTask = currentRole === "owner" || (currentRole === "member" && currentUser?.token === task.createdByToken);
                              const draggable = canCreateTasks ? "true" : "false";

                              return `
                                <article class="task-card" draggable="${draggable}" data-task-id="${task.id}">
                                  <div class="task-card-head">
                                    <h4>${escapeHtml(task.title)}</h4>
                                    <span class="task-updated">${escapeHtml(formatDate(task.updatedAt))}</span>
                                  </div>
                                  <p class="task-description">${escapeHtml(truncate(task.description || "No description"))}</p>
                                  <div class="task-meta">
                                    <span>Assignee: ${escapeHtml(task.assignedTo || "Unassigned")}</span>
                                    <span>By: ${escapeHtml(task.createdBy || "Unknown")}</span>
                                  </div>
                                  <div class="task-actions">
                                    <button class="button button-small" type="button" data-task-action="edit" data-task-id="${task.id}" ${canEditTask ? "" : "disabled"}>Edit</button>
                                    <button class="button button-small" type="button" data-task-action="delete" data-task-id="${task.id}" ${canEditTask ? "" : "disabled"}>Delete</button>
                                  </div>
                                </article>
                              `;
                            })
                            .join("")
                        : `<div class="column-empty">Drop tasks here or add a new one.</div>`
                    }
                  </div>
                </section>
              `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;

  container.querySelector("#copy-room-id-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(room.id);
      createToast("Room ID copied");
    } catch {
      createToast("Unable to copy Room ID");
    }
  });

  container.querySelector("#leave-room-btn")?.addEventListener("click", async () => {
    const confirmed = await openConfirmDialog({
      title: "Leave Room",
      message: "Leave this room and go back to the room list?",
      confirmText: "Leave",
      danger: true,
    });

    if (!confirmed) {
      return;
    }

    leaveCurrentRoom();
    createToast("Left room");
  });

  container.querySelector("#add-status-btn")?.addEventListener("click", async () => {
    if (!canManageStatuses) {
      createToast("Only the room owner can manage statuses");
      return;
    }

    const user = await ensureLoggedIn();
    if (!user) {
      return;
    }

    const result = await openStatusModal({ title: "Add Status" });
    if (!result) {
      return;
    }

    if (!validateStatusName(result.name)) {
      createToast("Status name is required");
      return;
    }

    const created = await addStatus(result.name);
    if (!created) {
      createToast("Status name must be unique");
      return;
    }

    createToast("Status added");
  });

  container.querySelector("#add-task-btn")?.addEventListener("click", async () => {
    if (!canCreateTasks) {
      createToast("You need to join this room to add tasks");
      return;
    }

    const user = await ensureLoggedIn();
    if (!user) {
      return;
    }

    if (!room.statuses.length) {
      createToast("Add a status first");
      return;
    }

    const result = await openTaskModal({
      title: "Add Task",
      statuses: room.statuses,
    });

    if (!result) {
      return;
    }

    if (!result.title) {
      createToast("Task title is required");
      return;
    }

    const task = await createTask({
      title: result.title,
      description: result.description,
      assignedTo: result.assignedTo,
      statusId: result.statusId,
    });

    if (!task) {
      createToast("Unable to create task");
      return;
    }

    createToast("Task created");
  });

  container.querySelectorAll("[data-status-action='edit']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!isOwner) {
        createToast("Only the room owner can edit statuses");
        return;
      }

      const user = await ensureLoggedIn();
      if (!user) {
        return;
      }

      const statusId = button.dataset.statusId;
      const status = room.statuses.find((item) => item.id === statusId);
      if (!status) {
        return;
      }

      const result = await openStatusModal({
        title: "Edit Status",
        initialName: status.name,
      });

      if (!result) {
        return;
      }

      const updated = await updateStatus(statusId, result.name);
      if (!updated) {
        createToast("Status name must be unique");
        return;
      }

      createToast("Status updated");
    });
  });

  container.querySelectorAll("[data-status-action='delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!isOwner) {
        createToast("Only the room owner can delete statuses");
        return;
      }

      const user = await ensureLoggedIn();
      if (!user) {
        return;
      }

      const statusId = button.dataset.statusId;
      const confirmed = await openConfirmDialog({
        title: "Delete Status",
        message: "Delete this status? Tasks must be moved out first.",
        confirmText: "Delete",
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      const deleted = await deleteStatus(statusId);
      if (!deleted) {
        createToast("Cannot delete status with tasks");
        return;
      }

      createToast("Status deleted");
    });
  });

  container.querySelectorAll("[data-task-action='edit']").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      const task = room.tasks.find((item) => item.id === taskId);
      const canEditTask = currentRole === "owner" || (currentRole === "member" && currentUser?.token === task?.createdByToken);
      if (!canEditTask) {
        createToast("Permission denied");
        return;
      }

      const user = await ensureLoggedIn();
      if (!user) {
        return;
      }

      if (!task) {
        return;
      }

      const result = await openTaskModal({
        title: "Edit Task",
        statuses: room.statuses,
        initialTask: task,
      });

      if (!result) {
        return;
      }

      const updated = await updateTask(taskId, {
        title: result.title,
        description: result.description,
        assignedTo: result.assignedTo,
        statusId: result.statusId,
      });

      if (!updated) {
        createToast("Unable to update task");
        return;
      }

      createToast("Task updated");
    });
  });

  container.querySelectorAll("[data-task-action='delete']").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      const task = room.tasks.find((item) => item.id === taskId);
      const canDeleteTask = currentRole === "owner" || (currentRole === "member" && currentUser?.token === task?.createdByToken);
      if (!canDeleteTask) {
        createToast("Permission denied");
        return;
      }

      const user = await ensureLoggedIn();
      if (!user) {
        return;
      }

      const confirmed = await openConfirmDialog({
        title: "Delete Task",
        message: "Delete this task permanently?",
        confirmText: "Delete",
        danger: true,
      });

      if (!confirmed) {
        return;
      }

      const deleted = await deleteTask(taskId);
      if (!deleted) {
        createToast("Unable to delete task");
        return;
      }

      createToast("Task deleted");
    });
  });

  container.querySelectorAll(".task-card[draggable='true']").forEach((taskCard) => {
    taskCard.addEventListener("dragstart", (event) => {
      if (!canCreateTasks) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", taskCard.dataset.taskId);
    });
  });

  container.querySelectorAll(".column-dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      if (!canCreateTasks) {
        return;
      }

      event.preventDefault();
      zone.classList.add("column-dropzone-active");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("column-dropzone-active");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("column-dropzone-active");

      if (!canCreateTasks) {
        createToast("Permission denied");
        return;
      }

      const taskId = event.dataTransfer.getData("text/plain");
      const statusId = zone.dataset.dropStatusId;

      if (!taskId || !statusId) {
        return;
      }

      moveTask(taskId, statusId)
        .then((moved) => {
          if (moved) {
            createToast("Task updated");
          }
        })
        .catch(() => {});
    });
  });
}
