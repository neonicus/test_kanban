function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createToast(message) {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }

  root.innerHTML = `
    <div class="toast" role="status" aria-live="polite" style="
      position: fixed;
      right: 24px;
      bottom: 24px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #111827;
      color: #fff;
      box-shadow: 0 12px 30px rgba(0,0,0,0.18);
      z-index: 1000;
    ">
      ${escapeHtml(message)}
    </div>
  `;
}

export function openModal() {
  return null;
}

export function closeModal() {
  return null;
}

export function openIdentityModal() {
  const root = document.getElementById("modal-root");
  if (!root) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="identity-title">
          <form id="identity-form" class="modal-form">
            <h2 id="identity-title">Enter your name</h2>
            <p class="muted">Create a lightweight user profile to continue.</p>
            <label class="field">
              <span>Name</span>
              <input id="identity-name" name="displayName" type="text" maxlength="30" placeholder="Poon" autocomplete="name" />
            </label>
            <p id="identity-error" class="field-error" aria-live="polite"></p>
            <div class="modal-actions">
              <button type="submit" class="button button-primary">Enter</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("identity-form");
    const input = document.getElementById("identity-name");
    const error = document.getElementById("identity-error");

    input.focus();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const displayName = input.value.trim();

      if (!displayName) {
        error.textContent = "Name is required.";
        return;
      }

      if (displayName.length > 30) {
        error.textContent = "Name must be 30 characters or less.";
        return;
      }

      root.innerHTML = "";
      resolve(displayName);
    });
  });
}

export function openRoomModal() {
  const root = document.getElementById("modal-root");
  if (!root) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="room-title">
          <form id="room-form" class="modal-form">
            <h2 id="room-title">Create a room</h2>
            <p class="muted">Set up a new Kanban board room.</p>
            <label class="field">
              <span>Room Name</span>
              <input id="room-name" name="name" type="text" maxlength="50" placeholder="Sprint Planning" />
            </label>
            <label class="field">
              <span>Description</span>
              <textarea id="room-description" name="description" rows="3" maxlength="200" placeholder="Team planning board"></textarea>
            </label>
            <p id="room-error" class="field-error" aria-live="polite"></p>
            <div class="modal-actions">
              <button type="button" id="room-cancel" class="button">Cancel</button>
              <button type="submit" class="button button-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("room-form");
    const nameInput = document.getElementById("room-name");
    const descriptionInput = document.getElementById("room-description");
    const error = document.getElementById("room-error");
    const cancelBtn = document.getElementById("room-cancel");

    nameInput.focus();

    cancelBtn.addEventListener("click", () => {
      root.innerHTML = "";
      resolve(null);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = nameInput.value.trim();
      const description = descriptionInput.value.trim();

      if (!name) {
        error.textContent = "Room name is required.";
        return;
      }

      if (name.length > 50) {
        error.textContent = "Room name must be 50 characters or less.";
        return;
      }

      root.innerHTML = "";
      resolve({ name, description });
    });
  });
}

export function openStatusModal(options = {}) {
  const { title = "Status", initialName = "" } = options;
  const root = document.getElementById("modal-root");
  if (!root) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="status-title">
          <form id="status-form" class="modal-form">
            <h2 id="status-title">${escapeHtml(title)}</h2>
            <p class="muted">Add or rename a board column.</p>
            <label class="field">
              <span>Status Name</span>
              <input id="status-name" name="name" type="text" maxlength="30" placeholder="Blocked" value="${escapeHtml(initialName)}" />
            </label>
            <p id="status-error" class="field-error" aria-live="polite"></p>
            <div class="modal-actions">
              <button type="button" id="status-cancel" class="button">Cancel</button>
              <button type="submit" class="button button-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("status-form");
    const input = document.getElementById("status-name");
    const error = document.getElementById("status-error");
    const cancelBtn = document.getElementById("status-cancel");

    input.focus();

    cancelBtn.addEventListener("click", () => {
      root.innerHTML = "";
      resolve(null);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim();

      if (!name) {
        error.textContent = "Status name is required.";
        return;
      }

      if (name.length > 30) {
        error.textContent = "Status name must be 30 characters or less.";
        return;
      }

      root.innerHTML = "";
      resolve({ name });
    });
  });
}

export function openTaskModal(options = {}) {
  const { title = "Task", statuses = [], initialTask = null } = options;
  const root = document.getElementById("modal-root");
  if (!root) {
    return Promise.resolve(null);
  }

  const selectedStatusId = initialTask?.statusId ?? statuses[0]?.id ?? "";

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card modal-card-large" role="dialog" aria-modal="true" aria-labelledby="task-title">
          <form id="task-form" class="modal-form">
            <h2 id="task-title">${escapeHtml(title)}</h2>
            <p class="muted">Create or update a task on this board.</p>
            <label class="field">
              <span>Title</span>
              <input id="task-name" name="title" type="text" maxlength="100" placeholder="Build first column" value="${escapeHtml(initialTask?.title ?? "")}" />
            </label>
            <label class="field">
              <span>Description</span>
              <textarea id="task-description" name="description" rows="3" maxlength="200" placeholder="Short details">${escapeHtml(initialTask?.description ?? "")}</textarea>
            </label>
            <label class="field">
              <span>Assign To</span>
              <input id="task-assigned" name="assignedTo" type="text" maxlength="60" placeholder="Poon" value="${escapeHtml(initialTask?.assignedTo ?? "")}" />
            </label>
            <label class="field">
              <span>Status</span>
              <select id="task-status" name="statusId">
                ${statuses
                  .map(
                    (status) => `
                      <option value="${status.id}" ${status.id === selectedStatusId ? "selected" : ""}>
                        ${escapeHtml(status.name)}
                      </option>
                    `,
                  )
                  .join("")}
              </select>
            </label>
            <p id="task-error" class="field-error" aria-live="polite"></p>
            <div class="modal-actions">
              <button type="button" id="task-cancel" class="button">Cancel</button>
              <button type="submit" class="button button-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const form = document.getElementById("task-form");
    const titleInput = document.getElementById("task-name");
    const descriptionInput = document.getElementById("task-description");
    const assignedInput = document.getElementById("task-assigned");
    const statusInput = document.getElementById("task-status");
    const error = document.getElementById("task-error");
    const cancelBtn = document.getElementById("task-cancel");

    titleInput.focus();

    cancelBtn.addEventListener("click", () => {
      root.innerHTML = "";
      resolve(null);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const taskTitle = titleInput.value.trim();
      const description = descriptionInput.value.trim();
      const assignedTo = assignedInput.value.trim();
      const statusId = statusInput.value;

      if (!taskTitle) {
        error.textContent = "Task title is required.";
        return;
      }

      if (taskTitle.length > 100) {
        error.textContent = "Task title must be 100 characters or less.";
        return;
      }

      root.innerHTML = "";
      resolve({
        title: taskTitle,
        description,
        assignedTo: assignedTo || null,
        statusId,
      });
    });
  });
}

export function openConfirmDialog(options = {}) {
  const {
    title = "Confirm",
    message = "Are you sure?",
    confirmText = "Confirm",
    danger = false,
  } = options;

  const root = document.getElementById("modal-root");
  if (!root) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="modal-form">
            <h2 id="confirm-title">${escapeHtml(title)}</h2>
            <p class="muted">${escapeHtml(message)}</p>
            <div class="modal-actions">
              <button type="button" id="confirm-cancel" class="button">Cancel</button>
              <button type="button" id="confirm-ok" class="button ${danger ? "button-danger" : "button-primary"}">${escapeHtml(confirmText)}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const cancelBtn = document.getElementById("confirm-cancel");
    const okBtn = document.getElementById("confirm-ok");

    cancelBtn.addEventListener("click", () => {
      root.innerHTML = "";
      resolve(false);
    });

    okBtn.addEventListener("click", () => {
      root.innerHTML = "";
      resolve(true);
    });
  });
}
