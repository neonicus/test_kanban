// Kanban Board Controller Logic

let roomId = null;
let boardState = null;
let currentActiveTaskId = null; // Track which task modal is active for details polling
let commentsPollInterval = null;
let subtasksPollInterval = null;

// Filter & Sort State
const filters = {
  search: '',
  assignee: '',
  priority: '',
  label: '',
  sort: 'default'
};

document.addEventListener('DOMContentLoaded', () => {
  // Check auth first
  checkAuthAndRedirect();
  updateHeaderProfileWidget();

  // Extract Room ID from URL query
  const urlParams = new URLSearchParams(window.location.search);
  roomId = urlParams.get('id');

  if (!roomId) {
    showToast('Room ID is missing. Redirecting...', 'error');
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1500);
    return;
  }

  // Load Initial Board Data
  fetchBoardData().then(() => {
    // Start board state polling (every 3 seconds)
    setInterval(fetchBoardData, 3000);
  });

  // Setup Event Listeners
  setupBoardEventListeners();
});

// Modal toggle helper
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (show) {
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
    // Clean up task details polling if closed
    if (modalId === 'modal-task-details') {
      currentActiveTaskId = null;
      clearInterval(commentsPollInterval);
      clearInterval(subtasksPollInterval);
    }
  }
}

// Fetch Board Details (Room, Columns, Members, Tasks, Labels)
async function fetchBoardData() {
  try {
    const data = await apiCall(`/rooms/${roomId}`, 'GET');
    boardState = data;
    
    // Check if user has active role, otherwise they were kicked or room deleted
    if (!boardState.room) {
      showToast('Board does not exist anymore.', 'error');
      window.location.href = '/';
      return;
    }

    renderBoardHeader();
    renderSidebar();
    populateToolbarFilters();
    renderBoardColumns();
  } catch (err) {
    console.error('Fetch Board Data Error:', err);
  }
}

// Render Room Header Information
function renderBoardHeader() {
  const room = boardState.room;
  document.getElementById('room-display-name').innerText = room.name;
  
  // Find owner name from members
  const owner = boardState.members.find(m => m.role === 'owner');
  const ownerName = owner ? owner.displayName : 'Unknown';
  document.getElementById('room-display-owner').innerText = `Owner: ${ownerName}`;

  const roomIdTag = document.getElementById('tag-room-id');
  roomIdTag.querySelector('span').innerText = `Room ID: ${room.id}`;
  roomIdTag.onclick = () => {
    navigator.clipboard.writeText(room.id);
    showToast('Room ID copied to clipboard!', 'success');
  };

  // Adjust display according to role permissions
  const isOwner = room.userRole === 'owner';
  
  // Sidebar owner-only controls
  document.getElementById('sidebar-owner-controls').style.display = isOwner ? 'block' : 'none';
  // Column add button
  document.getElementById('btn-add-status-placeholder').style.display = isOwner ? 'flex' : 'none';
  // Sidebar Label add button
  document.getElementById('btn-manage-labels').style.display = isOwner ? 'block' : 'none';
}

// Render Sidebar Panels
function renderSidebar() {
  // 1. Members list
  const membersList = document.getElementById('sidebar-members-list');
  const isOwner = boardState.room.userRole === 'owner';
  const myToken = getUserToken();

  membersList.innerHTML = boardState.members.map(member => {
    const onlineIndicator = member.isOnline 
      ? '<span class="online-indicator" title="Online"></span>' 
      : '<span class="offline-indicator" title="Offline"></span>';
    
    // Add promotion/demotion actions for Owner
    let actionHtml = '';
    if (isOwner && member.token !== myToken) {
      actionHtml = `
        <button class="btn-member-action" onclick="openMemberRoleDialog('${member.token}', '${member.displayName}', '${member.role}')" title="Change Role">
          ⚙️
        </button>
      `;
    }

    return `
      <div class="member-item">
        <div class="member-info">
          <div class="member-status">
            ${getAvatarHtml(member.displayName, member.avatarColor, '1.8rem')}
            ${onlineIndicator}
          </div>
          <span class="user-name" style="font-size:0.9rem;">${escapeHtml(member.displayName)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:0.25rem;">
          <span class="member-role role-${member.role}">${member.role}</span>
          ${actionHtml}
        </div>
      </div>
    `;
  }).join('');

  // 2. Labels list
  const labelsList = document.getElementById('sidebar-labels-list');
  if (boardState.labels.length === 0) {
    labelsList.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">No labels created yet.</span>`;
  } else {
    labelsList.innerHTML = boardState.labels.map(label => {
      const deleteBtn = isOwner 
        ? `<button onclick="deleteLabel('${label.id}')" style="background:transparent; border:none; color:var(--priority-urgent); cursor:pointer; font-size:0.8rem;">✕</button>`
        : '';
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.3rem 0.6rem; border-radius:6px; border:1px solid var(--border-color);">
          <span class="label-badge" style="background-color: ${label.color}">${escapeHtml(label.name)}</span>
          ${deleteBtn}
        </div>
      `;
    }).join('');
  }
}

// Open Dialog to promote/demote members (Owner only)
function openMemberRoleDialog(userToken, displayName, currentRole) {
  const isOwner = boardState.room.userRole === 'owner';
  if (!isOwner) return;

  const roleSelect = prompt(
    `Change role for "${displayName}":\nEnter "owner" to transfer ownership,\n"member" to promote to Member,\n"visitor" to demote to Visitor.`,
    currentRole
  );

  if (roleSelect === null) return; // Cancelled
  const normalizedRole = roleSelect.trim().toLowerCase();

  if (!['owner', 'member', 'visitor'].includes(normalizedRole)) {
    showToast('Invalid role. Use "owner", "member", or "visitor".', 'error');
    return;
  }

  if (normalizedRole === currentRole) return;

  if (normalizedRole === 'owner') {
    const confirmTransfer = confirm(`WARNING: Transferring ownership will make "${displayName}" the owner. You will be demoted to "member". Proceed?`);
    if (!confirmTransfer) return;
  }

  apiCall(`/rooms/${roomId}/members`, 'POST', {
    userToken,
    role: normalizedRole
  }).then(res => {
    showToast(res.message, 'success');
    fetchBoardData();
  }).catch(err => console.error(err));
}

// Delete room label (Owner only)
async function deleteLabel(labelId) {
  if (!confirm('Are you sure you want to delete this label? It will be removed from all tasks.')) return;
  try {
    const res = await apiCall(`/rooms/${roomId}/labels/${labelId}`, 'DELETE');
    showToast(res.message, 'success');
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// Populate filters in the Toolbar dynamically
function populateToolbarFilters() {
  const assigneeSelect = document.getElementById('filter-assignee');
  const labelSelect = document.getElementById('filter-label');

  // Remember current selections
  const selectedAssignee = filters.assignee;
  const selectedLabel = filters.label;

  // 1. Assignees Dropdown
  assigneeSelect.innerHTML = '<option value="">All Assignees</option>';
  boardState.members.forEach(member => {
    assigneeSelect.innerHTML += `<option value="${member.token}">${escapeHtml(member.displayName)}</option>`;
  });
  assigneeSelect.value = selectedAssignee;

  // 2. Labels Dropdown
  labelSelect.innerHTML = '<option value="">All Labels</option>';
  boardState.labels.forEach(label => {
    labelSelect.innerHTML += `<option value="${label.id}">${escapeHtml(label.name)}</option>`;
  });
  labelSelect.value = selectedLabel;
}

// Render Columns & Cards List
function renderBoardColumns() {
  const container = document.getElementById('kanban-columns-container');
  const isOwner = boardState.room.userRole === 'owner';
  const isVisitor = boardState.room.userRole === 'visitor';

  // Keep reference to add status placeholder
  const addPlaceholder = document.getElementById('btn-add-status-placeholder');
  
  // Clear other children
  const cols = container.querySelectorAll('.column');
  cols.forEach(c => c.remove());

  // Render each column status
  boardState.statuses.forEach(status => {
    // Filter tasks belonging to this column
    let statusTasks = boardState.tasks.filter(t => t.statusId === status.id);

    // Apply Toolbar Filters on client-side
    if (filters.search) {
      const q = filters.search.toLowerCase();
      statusTasks = statusTasks.filter(t => 
        t.title.toLowerCase().includes(q) || 
        (t.description && t.description.toLowerCase().includes(q))
      );
    }
    if (filters.assignee) {
      statusTasks = statusTasks.filter(t => t.assignedTo === filters.assignee);
    }
    if (filters.priority) {
      statusTasks = statusTasks.filter(t => t.priority === filters.priority);
    }
    if (filters.label) {
      statusTasks = statusTasks.filter(t => t.labels.some(l => l.id === filters.label));
    }

    // Apply Sorting
    if (filters.sort === 'priority') {
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      statusTasks.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    } else if (filters.sort === 'dueDate') {
      statusTasks.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    } else if (filters.sort === 'created') {
      statusTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Determine WIP limit warning state
    const limit = status.wipLimit;
    const taskCount = statusTasks.length;
    const isWipExceeded = limit !== null && taskCount > limit;

    const columnDiv = document.createElement('div');
    columnDiv.className = `column ${isWipExceeded ? 'wip-exceeded' : ''}`;
    columnDiv.dataset.statusId = status.id;

    // Draggable columns for Owners only
    if (isOwner) {
      columnDiv.draggable = true;
      columnDiv.addEventListener('dragstart', handleColumnDragStart);
      columnDiv.addEventListener('dragover', handleColumnDragOver);
      columnDiv.addEventListener('drop', handleColumnDrop);
      columnDiv.addEventListener('dragend', handleColumnDragEnd);
    }

    // Header HTML
    const limitDisplay = limit ? `${taskCount} / ${limit}` : `${taskCount}`;
    let headerActionsHtml = '';
    if (isOwner) {
      headerActionsHtml = `
        <div class="column-header-actions">
          <button class="column-btn" onclick="openEditColumnForm('${status.id}', '${status.name}', ${status.wipLimit})" title="Edit Column">✏️</button>
          <button class="column-btn" onclick="deleteColumn('${status.id}')" title="Delete Column" style="color:var(--priority-urgent);">🗑️</button>
        </div>
      `;
    }

    // Quick add button (Owner or Member)
    const quickAddButtonHtml = !isVisitor 
      ? `<button class="column-btn" onclick="openAddTaskForm('${status.id}')" title="Quick Add Task">➕</button>`
      : '';

    columnDiv.innerHTML = `
      <div class="column-header">
        <span class="column-name-title">
          ${escapeHtml(status.name)}
          <span class="column-wip-badge">${limitDisplay}</span>
        </span>
        <div style="display:flex; align-items:center; gap:0.25rem;">
          ${quickAddButtonHtml}
          ${headerActionsHtml}
        </div>
      </div>
      <div class="column-cards-list" data-status-id="${status.id}">
        <!-- Task cards injected here -->
      </div>
    `;

    // Render cards inside column list
    const cardsList = columnDiv.querySelector('.column-cards-list');
    
    // Bind Drag & Drop event listeners on target cards zone
    if (!isVisitor) {
      cardsList.addEventListener('dragover', handleCardDragOver);
      cardsList.addEventListener('drop', handleCardDrop);
    }

    if (statusTasks.length === 0) {
      cardsList.innerHTML = `<div class="empty-column-state">Empty Column</div>`;
    } else {
      statusTasks.forEach(task => {
        const card = createTaskCard(task, isVisitor);
        cardsList.appendChild(card);
      });
    }

    // Insert column before the add placeholder
    container.insertBefore(columnDiv, addPlaceholder);
  });
}

// Create Card DOM Element
function createTaskCard(task, isVisitor) {
  const card = document.createElement('div');
  card.className = `task-card ${task.isBlocked ? 'blocked-state' : ''}`;
  card.dataset.taskId = task.id;
  card.dataset.statusId = task.statusId;

  if (!isVisitor) {
    card.draggable = true;
    card.addEventListener('dragstart', handleCardDragStart);
    card.addEventListener('dragend', handleCardDragEnd);
  }

  // Click card to open detail modal
  card.onclick = (e) => {
    // Avoid modal popup when clicking on sub buttons inside card
    if (e.target.closest('button') || e.target.closest('.label-badge')) return;
    openTaskDetailsModal(task.id);
  };

  // Badges & elements
  const priorityClass = `priority-${task.priority}-badge`;
  const priorityText = task.priority.toUpperCase();
  
  // Labels row
  let labelsHtml = '';
  if (task.labels && task.labels.length > 0) {
    labelsHtml = `
      <div class="task-labels-list">
        ${task.labels.map(l => `<span class="label-badge" style="background-color: ${l.color}">${escapeHtml(l.name)}</span>`).join('')}
      </div>
    `;
  }

  // Due Date (Check Overdue status)
  let dueDateHtml = '';
  if (task.dueDate) {
    const dateObj = new Date(task.dueDate);
    const isOverdue = dateObj < new Date() && statusIsActive(task.statusId);
    
    const formattedDate = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
    dueDateHtml = `
      <div class="task-due-date ${isOverdue ? 'overdue' : ''}">
        📅 ${formattedDate} ${isOverdue ? '(Overdue)' : ''}
      </div>
    `;
  }

  // Subtasks progress
  let subtaskRatioHtml = '';
  if (task.subtaskCount > 0) {
    subtaskRatioHtml = `
      <span>☑️ ${task.subtaskCompletedCount} / ${task.subtaskCount}</span>
    `;
  }

  // Comments count
  let commentsCountHtml = '';
  if (task.commentCount > 0) {
    commentsCountHtml = `
      <span>💬 ${task.commentCount}</span>
    `;
  }

  // Assignee Avatar
  let assigneeAvatarHtml = '';
  if (task.assignedTo) {
    assigneeAvatarHtml = `
      <div style="margin-left: auto;" title="Assigned to ${escapeHtml(task.assigneeName)}">
        ${getAvatarHtml(task.assigneeName, task.assigneeColor, '1.5rem')}
      </div>
    `;
  }

  // Blocked Banner overlay
  let blockedTextHtml = '';
  if (task.isBlocked) {
    blockedTextHtml = `
      <div class="blocked-indicator-bar">
        ⚠️ Blocked: ${escapeHtml(task.blockedReason || 'No reason')}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="task-card-header">
      <span class="task-priority-badge ${priorityClass}">${priorityText}</span>
    </div>
    <div class="task-title">${escapeHtml(task.title)}</div>
    ${blockedTextHtml}
    ${labelsHtml}
    <div class="task-card-footer">
      <div class="task-metrics">
        ${subtaskRatioHtml}
        ${commentsCountHtml}
      </div>
      ${dueDateHtml}
      ${assigneeAvatarHtml}
    </div>
  `;

  return card;
}

// Check if status is not 'Done' (active status) to display overdue text
function statusIsActive(statusId) {
  const status = boardState.statuses.find(s => s.id === statusId);
  if (!status) return true;
  return status.name.toLowerCase() !== 'done';
}

// ==========================================
// Drag & Drop Handlers: TASK CARDS
// ==========================================
let draggedCard = null;

function handleCardDragStart(e) {
  draggedCard = this;
  this.classList.add('dragging');
  e.dataTransfer.setData('text/plain', this.dataset.taskId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleCardDragEnd(e) {
  this.classList.remove('dragging');
  draggedCard = null;
}

function handleCardDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

async function handleCardDrop(e) {
  e.preventDefault();
  const taskId = e.dataTransfer.getData('text/plain');
  const targetStatusId = this.dataset.statusId;

  if (!taskId || !targetStatusId) return;
  
  // Find card state to verify if target is identical status to prevent API call
  const task = boardState.tasks.find(t => t.id === taskId);
  if (task && task.statusId === targetStatusId) return;

  try {
    const res = await apiCall(`/rooms/${roomId}/tasks/${taskId}/drag`, 'PUT', {
      statusId: targetStatusId
    });

    if (res.warning) {
      showToast(res.warning, 'warning');
    } else {
      showToast(res.message, 'success');
    }
    
    // Refresh board UI
    fetchBoardData();
  } catch (err) {
    console.error('Task Drag Drop Error:', err);
  }
}

// ==========================================
// Drag & Drop Handlers: COLUMNS STATUSES (Owner only)
// ==========================================
let draggedColumn = null;

function handleColumnDragStart(e) {
  draggedColumn = this;
  this.classList.add('dragging');
  e.dataTransfer.setData('text/plain', this.dataset.statusId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleColumnDragEnd(e) {
  this.classList.remove('dragging');
  draggedColumn = null;
}

function handleColumnDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

async function handleColumnDrop(e) {
  e.preventDefault();
  const statusId = e.dataTransfer.getData('text/plain');
  const targetColumn = this;

  if (draggedColumn === targetColumn || !statusId) return;

  // Determine reordering
  const container = document.getElementById('kanban-columns-container');
  const columnsList = Array.from(container.querySelectorAll('.column'));
  
  const draggedIndex = columnsList.indexOf(draggedColumn);
  const targetIndex = columnsList.indexOf(targetColumn);

  // Reorder IDs array locally first
  const statusIds = boardState.statuses.map(s => s.id);
  statusIds.splice(draggedIndex, 1);
  statusIds.splice(targetIndex, 0, statusId);

  try {
    const res = await apiCall(`/rooms/${roomId}/statuses/reorder`, 'PUT', { statusIds });
    showToast(res.message, 'success');
    fetchBoardData();
  } catch (err) {
    console.error('Column reordering failed:', err);
  }
}

// ==========================================
// Modals Open / Create / Submit Handlers
// ==========================================

// Task Form Create
function openAddTaskForm(statusId) {
  document.getElementById('task-form-title').innerText = 'Create New Task';
  document.getElementById('input-task-id').value = '';
  document.getElementById('input-task-status-id').value = statusId;
  document.getElementById('input-task-title').value = '';
  document.getElementById('input-task-desc').value = '';
  document.getElementById('input-task-priority').value = 'medium';
  document.getElementById('input-task-duedate').value = '';

  // Populate assignee select dropdown
  const assigneeSelect = document.getElementById('input-task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
  boardState.members.forEach(member => {
    assigneeSelect.innerHTML += `<option value="${member.token}">${escapeHtml(member.displayName)}</option>`;
  });

  // Render labels selector checklists
  renderTaskFormLabels([]);

  toggleModal('modal-task-form', true);
}

// Populate task form labels checklists
function renderTaskFormLabels(selectedLabelIds = []) {
  const container = document.getElementById('task-form-labels-container');
  if (boardState.labels.length === 0) {
    container.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">No labels available. Create labels in the sidebar first.</span>';
    return;
  }

  container.innerHTML = boardState.labels.map(label => {
    const checked = selectedLabelIds.includes(label.id) ? 'checked' : '';
    return `
      <label style="display:flex; align-items:center; gap:0.25rem; font-size:0.85rem; padding:0.2rem 0.5rem; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:4px; cursor:pointer;">
        <input type="checkbox" class="task-form-label-checkbox" value="${label.id}" ${checked}>
        <span class="label-badge" style="background-color: ${label.color}">${escapeHtml(label.name)}</span>
      </label>
    `;
  }).join('');
}

// Open Task Form Edit (loads details)
function openEditTaskForm(taskId) {
  const task = boardState.tasks.find(t => t.id === taskId);
  if (!task) return;

  // Close details modal to swap overlays smoothly
  toggleModal('modal-task-details', false);

  document.getElementById('task-form-title').innerText = 'Edit Task Details';
  document.getElementById('input-task-id').value = task.id;
  document.getElementById('input-task-status-id').value = task.statusId;
  document.getElementById('input-task-title').value = task.title;
  document.getElementById('input-task-desc').value = task.description || '';
  document.getElementById('input-task-priority').value = task.priority;
  
  if (task.dueDate) {
    document.getElementById('input-task-duedate').value = new Date(task.dueDate).toISOString().substring(0, 10);
  } else {
    document.getElementById('input-task-duedate').value = '';
  }

  // Populate assignee select dropdown
  const assigneeSelect = document.getElementById('input-task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
  boardState.members.forEach(member => {
    assigneeSelect.innerHTML += `<option value="${member.token}">${escapeHtml(member.displayName)}</option>`;
  });
  assigneeSelect.value = task.assignedTo || '';

  // Render labels selector checklists
  const taskLabelIds = task.labels.map(l => l.id);
  renderTaskFormLabels(taskLabelIds);

  toggleModal('modal-task-form', true);
}

// Submit Task Form
async function handleTaskFormSubmit() {
  const taskId = document.getElementById('input-task-id').value;
  const statusId = document.getElementById('input-task-status-id').value;
  const title = document.getElementById('input-task-title').value.trim();
  const description = document.getElementById('input-task-desc').value.trim();
  const priority = document.getElementById('input-task-priority').value;
  const dueDate = document.getElementById('input-task-duedate').value;
  const assignedTo = document.getElementById('input-task-assignee').value;

  if (!title) {
    showToast('Task title is required', 'warning');
    return;
  }

  // Get selected checkboxes
  const labelCheckboxes = document.querySelectorAll('.task-form-label-checkbox:checked');
  const labelIds = Array.from(labelCheckboxes).map(cb => cb.value);

  const taskPayload = {
    title,
    description,
    priority,
    dueDate: dueDate || null,
    assignedTo: assignedTo || null,
    statusId,
    labelIds
  };

  try {
    if (taskId) {
      // Edit mode
      const res = await apiCall(`/rooms/${roomId}/tasks/${taskId}`, 'PUT', taskPayload);
      showToast(res.message, 'success');
    } else {
      // Create mode
      const res = await apiCall(`/rooms/${roomId}/tasks`, 'POST', taskPayload);
      if (res.warning) {
        showToast(res.warning, 'warning');
      } else {
        showToast('Task created successfully', 'success');
      }
    }

    toggleModal('modal-task-form', false);
    fetchBoardData();
  } catch (err) {
    console.error('Task Submission Error:', err);
  }
}

// ==========================================
// Status Column Actions (Add, Edit, Delete)
// ==========================================
function openEditColumnForm(statusId, currentName, currentWip) {
  document.getElementById('column-form-title').innerText = 'Edit Column Status';
  document.getElementById('input-column-id').value = statusId;
  document.getElementById('input-column-name').value = currentName;
  document.getElementById('input-column-wip').value = currentWip || '';
  toggleModal('modal-column-form', true);
}

async function handleColumnFormSubmit() {
  const statusId = document.getElementById('input-column-id').value;
  const name = document.getElementById('input-column-name').value.trim();
  const wipLimit = document.getElementById('input-column-wip').value;

  if (!name) {
    showToast('Column name is required', 'warning');
    return;
  }

  const payload = {
    name,
    wipLimit: wipLimit ? parseInt(wipLimit, 10) : null
  };

  try {
    if (statusId) {
      // Edit
      await apiCall(`/rooms/${roomId}/statuses/${statusId}`, 'PUT', payload);
      showToast('Column updated successfully', 'success');
    } else {
      // Create
      await apiCall(`/rooms/${roomId}/statuses`, 'POST', payload);
      showToast('Column added successfully', 'success');
    }
    toggleModal('modal-column-form', false);
    fetchBoardData();
  } catch (err) {
    console.error('Column configuration failed:', err);
  }
}

async function deleteColumn(statusId) {
  if (!confirm('Are you sure you want to delete this status column? It must be empty.')) return;
  try {
    const res = await apiCall(`/rooms/${roomId}/statuses/${statusId}`, 'DELETE');
    showToast(res.message, 'success');
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// TASK DETAILS DIALOG (Comments, Subtasks, Block state)
// ==========================================
async function openTaskDetailsModal(taskId) {
  currentActiveTaskId = taskId;
  
  // Initial draw
  await renderTaskDetails();

  // Open overlay
  toggleModal('modal-task-details', true);

  // Poll comments & subtasks while modal is open
  clearInterval(commentsPollInterval);
  commentsPollInterval = setInterval(fetchTaskComments, 3000);
  
  clearInterval(subtasksPollInterval);
  subtasksPollInterval = setInterval(fetchTaskSubtasks, 3000);
}

// Retrieve and Render details modal contents
async function renderTaskDetails() {
  const task = boardState.tasks.find(t => t.id === currentActiveTaskId);
  if (!task) {
    toggleModal('modal-task-details', false);
    return;
  }

  const role = boardState.room.userRole;
  const isVisitor = role === 'visitor';
  const myToken = getUserToken();
  
  // Title & description
  document.getElementById('details-task-title').innerText = task.title;
  document.getElementById('details-task-desc').innerText = task.description || 'No description provided.';
  
  // Priority
  const priorityBadge = document.getElementById('details-task-priority');
  priorityBadge.className = `task-priority-badge priority-${task.priority}-badge`;
  priorityBadge.innerText = task.priority.toUpperCase();

  // Blocked Banner state
  const blockedBanner = document.getElementById('details-blocked-banner');
  if (task.isBlocked) {
    blockedBanner.style.display = 'flex';
    document.getElementById('details-blocked-reason-text').innerText = task.blockedReason || 'No reason specified';
  } else {
    blockedBanner.style.display = 'none';
  }

  // Creator & Assignee details
  document.getElementById('details-task-creator').innerText = task.creatorName || 'Unknown';
  
  const assigneeArea = document.getElementById('details-task-assignee');
  if (task.assignedTo) {
    assigneeArea.innerHTML = `
      ${getAvatarHtml(task.assigneeName, task.assigneeColor, '1.4rem')}
      <span>${escapeHtml(task.assigneeName)}</span>
    `;
  } else {
    assigneeArea.innerText = 'Unassigned';
  }

  // Claim button behavior
  const claimBtn = document.getElementById('btn-details-selfassign');
  if (isVisitor) {
    claimBtn.style.display = 'none';
  } else {
    claimBtn.style.display = 'block';
    if (task.assignedTo === myToken) {
      claimBtn.innerText = '🙋 Release Task';
      claimBtn.onclick = () => updateTaskField({ assignedTo: null });
    } else {
      claimBtn.innerText = '🙋 Claim Task';
      claimBtn.onclick = () => updateTaskField({ assignedTo: myToken });
    }
  }

  // Block checkbox control (Visible only to creator or owner)
  const blockToggleContainer = document.getElementById('container-block-toggle');
  const isCreator = (task.createdBy === myToken);
  const isOwner = (role === 'owner');

  if (isVisitor) {
    blockToggleContainer.style.display = 'none';
  } else {
    blockToggleContainer.style.display = 'flex';
    const blockCheckbox = document.getElementById('checkbox-block-task');
    const blockReasonInput = document.getElementById('input-block-reason');
    
    // Unbind listeners first to avoid recursive calls
    blockCheckbox.onchange = null;
    blockReasonInput.onchange = null;

    blockCheckbox.checked = task.isBlocked;
    blockReasonInput.value = task.blockedReason || '';
    blockReasonInput.style.display = task.isBlocked ? 'block' : 'none';

    blockCheckbox.onchange = async () => {
      const checked = blockCheckbox.checked;
      blockReasonInput.style.display = checked ? 'block' : 'none';
      if (!checked) {
        // Clear block
        await updateTaskField({ isBlocked: false, blockedReason: null });
      } else {
        blockReasonInput.focus();
      }
    };

    blockReasonInput.onchange = async () => {
      await updateTaskField({ isBlocked: true, blockedReason: blockReasonInput.value.trim() });
    };
  }

  // Edit / Delete Buttons (Creator or Owner only)
  const editBtn = document.getElementById('btn-details-edit');
  const deleteBtn = document.getElementById('btn-details-delete');

  if (!isVisitor && (isOwner || isCreator)) {
    editBtn.style.display = 'block';
    editBtn.onclick = () => openEditTaskForm(task.id);
    
    deleteBtn.style.display = 'block';
    deleteBtn.onclick = () => handleDeleteTask(task.id);
  } else {
    editBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
  }

  // Due Date
  const dueDateArea = document.getElementById('details-task-duedate');
  if (task.dueDate) {
    const dateObj = new Date(task.dueDate);
    const isOverdue = dateObj < new Date() && statusIsActive(task.statusId);
    dueDateArea.innerText = `📅 ${dateObj.toLocaleDateString()}`;
    if (isOverdue) {
      dueDateArea.className = 'task-due-date overdue';
    } else {
      dueDateArea.className = 'task-due-date';
    }
  } else {
    dueDateArea.innerText = 'No due date set';
    dueDateArea.className = 'task-due-date';
  }

  // Render Labels
  const labelsArea = document.getElementById('details-task-labels');
  if (task.labels && task.labels.length > 0) {
    labelsArea.innerHTML = task.labels.map(l => `<span class="label-badge" style="background-color: ${l.color}">${escapeHtml(l.name)}</span>`).join('');
  } else {
    labelsArea.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted);">No labels</span>`;
  }

  // Enable Comments and Subtasks submission areas based on role
  document.getElementById('container-add-subtask').style.display = !isVisitor && (isOwner || isCreator) ? 'flex' : 'none';
  document.getElementById('container-add-comment').style.display = !isVisitor ? 'flex' : 'none';

  // Load subtasks and comments immediately
  fetchTaskSubtasks();
  fetchTaskComments();
}

// Update single field helper (e.g. self assign, block reason)
async function updateTaskField(fieldObject) {
  try {
    const res = await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}`, 'PUT', fieldObject);
    showToast(res.message, 'success');
    // Reload full board state then redraw modal
    await fetchBoardData();
    renderTaskDetails();
  } catch (err) {
    console.error('Update task field error:', err);
  }
}

// Handle Task Delete
async function handleDeleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task? This action is permanent.')) return;
  try {
    const res = await apiCall(`/rooms/${roomId}/tasks/${taskId}`, 'DELETE');
    showToast(res.message, 'success');
    toggleModal('modal-task-details', false);
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// Fetch Subtasks
async function fetchTaskSubtasks() {
  if (!currentActiveTaskId) return;
  try {
    const subtasks = await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/subtasks`, 'GET');
    renderSubtasks(subtasks);
  } catch (err) {
    console.error(err);
  }
}

// Render Subtasks
function renderSubtasks(subtasks) {
  const container = document.getElementById('details-subtasks-list');
  const countLabel = document.getElementById('details-subtasks-progress');
  const role = boardState.room.userRole;
  
  // Access control: Only creator or owner can manage checkboxes / delete
  const task = boardState.tasks.find(t => t.id === currentActiveTaskId);
  const myToken = getUserToken();
  const isOwner = role === 'owner';
  const isCreator = task ? (task.createdBy === myToken) : false;
  const canManage = ! (role === 'visitor') && (isOwner || isCreator);

  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  countLabel.innerText = `Subtasks (${completed} / ${total})`;

  if (total === 0) {
    container.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No subtasks created.</span>`;
    return;
  }

  container.innerHTML = subtasks.map(s => {
    const disabledAttr = canManage ? '' : 'disabled';
    const deleteBtn = canManage 
      ? `<button onclick="deleteSubtask('${s.id}')" style="background:transparent; border:none; color:var(--priority-urgent); cursor:pointer; font-size:0.9rem;">✕</button>`
      : '';
      
    return `
      <div class="subtask-item">
        <label class="subtask-check-label">
          <input type="checkbox" class="subtask-checkbox" ${s.completed ? 'checked' : ''} ${disabledAttr} onchange="toggleSubtask('${s.id}', this.checked)">
          <span class="subtask-title-text">${escapeHtml(s.title)}</span>
        </label>
        ${deleteBtn}
      </div>
    `;
  }).join('');
}

// Toggle subtask completed status
async function toggleSubtask(subtaskId, completed) {
  try {
    await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/subtasks/${subtaskId}`, 'PUT', { completed });
    fetchBoardData(); // Update card percentages too
  } catch (err) {
    console.error(err);
  }
}

// Add new subtask
async function addSubtask() {
  const titleInput = document.getElementById('input-new-subtask');
  const title = titleInput.value.trim();

  if (!title) return;

  try {
    await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/subtasks`, 'POST', { title });
    titleInput.value = '';
    fetchTaskSubtasks();
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// Delete subtask
async function deleteSubtask(subtaskId) {
  if (!confirm('Delete this subtask?')) return;
  try {
    await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/subtasks/${subtaskId}`, 'DELETE');
    fetchTaskSubtasks();
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// Fetch Comments
async function fetchTaskComments() {
  if (!currentActiveTaskId) return;
  try {
    const comments = await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/comments`, 'GET');
    renderComments(comments);
  } catch (err) {
    console.error(err);
  }
}

// Render Comments
function renderComments(comments) {
  const container = document.getElementById('details-comments-list');
  const myToken = getUserToken();
  const isOwner = boardState.room.userRole === 'owner';

  if (comments.length === 0) {
    container.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No comments yet. Be the first to start the discussion!</span>`;
    return;
  }

  container.innerHTML = comments.map(c => {
    const timeFormatted = new Date(c.createdAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    }) + ` (${new Date(c.createdAt).toLocaleDateString()})`;

    // Check if writer or board owner to allow delete
    const canDelete = isOwner || (c.userToken === myToken);
    const deleteBtn = canDelete
      ? `<button onclick="deleteComment('${c.id}')" style="background:transparent; border:none; color:var(--priority-urgent); cursor:pointer; font-size:0.8rem;">✕</button>`
      : '';

    return `
      <div class="comment-card">
        <div class="comment-header">
          <div class="commenter-info">
            ${getAvatarHtml(c.displayName, c.avatarColor, '1.5rem')}
            <span class="user-name" style="font-size: 0.85rem; font-weight:600;">${escapeHtml(c.displayName)}</span>
            <span class="comment-time">${timeFormatted}</span>
          </div>
          ${deleteBtn}
        </div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
      </div>
    `;
  }).join('');
}

// Add new comment
async function addComment() {
  const contentInput = document.getElementById('input-new-comment');
  const content = contentInput.value.trim();

  if (!content) return;

  try {
    await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/comments`, 'POST', { content });
    contentInput.value = '';
    showToast('Comment posted', 'success');
    fetchTaskComments();
    fetchBoardData(); // updates card counters
  } catch (err) {
    console.error(err);
  }
}

// Delete comment
async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    const res = await apiCall(`/rooms/${roomId}/tasks/${currentActiveTaskId}/comments/${commentId}`, 'DELETE');
    showToast(res.message, 'success');
    fetchTaskComments();
    fetchBoardData();
  } catch (err) {
    console.error(err);
  }
}

// ==========================================
// Setup DOM Event Listeners & Actions
// ==========================================
function setupBoardEventListeners() {
  // Reset Toolbar filters
  document.getElementById('btn-clear-filters').onclick = () => {
    document.getElementById('toolbar-search').value = '';
    document.getElementById('filter-assignee').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-label').value = '';
    document.getElementById('toolbar-sort').value = 'default';
    
    filters.search = '';
    filters.assignee = '';
    filters.priority = '';
    filters.label = '';
    filters.sort = 'default';
    
    renderBoardColumns();
  };

  // Bind key and change events on Filters to redraw
  document.getElementById('toolbar-search').onkeyup = function() {
    filters.search = this.value;
    renderBoardColumns();
  };

  document.getElementById('filter-assignee').onchange = function() {
    filters.assignee = this.value;
    renderBoardColumns();
  };

  document.getElementById('filter-priority').onchange = function() {
    filters.priority = this.value;
    renderBoardColumns();
  };

  document.getElementById('filter-label').onchange = function() {
    filters.label = this.value;
    renderBoardColumns();
  };

  document.getElementById('toolbar-sort').onchange = function() {
    filters.sort = this.value;
    renderBoardColumns();
  };

  // Leave room button
  document.getElementById('btn-leave-room').onclick = () => {
    if (boardState.room.userRole === 'owner') {
      showToast('Owner cannot leave room. You must transfer ownership first.', 'warning');
      return;
    }
    if (!confirm('Leave this board? You will become a visitor if you rejoin.')) return;
    
    apiCall(`/rooms/${roomId}/leave`, 'POST').then(() => {
      showToast('Successfully left board', 'success');
      window.location.href = '/';
    }).catch(err => console.error(err));
  };

  // Delete Room button (Owner only)
  document.getElementById('btn-delete-room').onclick = () => {
    if (!confirm('CRITICAL: Delete this board and all its tasks, columns, comments? This cannot be undone.')) return;
    apiCall(`/rooms/${roomId}`, 'DELETE').then(() => {
      showToast('Board successfully deleted', 'success');
      window.location.href = '/';
    }).catch(err => console.error(err));
  };

  // Sidebar Label Create modal trigger
  document.getElementById('btn-manage-labels').onclick = () => {
    document.getElementById('input-label-name').value = '';
    toggleModal('modal-labels-form', true);
  };

  // Add room label submit
  document.getElementById('btn-create-label-submit').onclick = async () => {
    const name = document.getElementById('input-label-name').value.trim();
    const color = document.getElementById('input-label-color').value;

    if (!name) {
      showToast('Label name is required', 'warning');
      return;
    }

    try {
      await apiCall(`/rooms/${roomId}/labels`, 'POST', { name, color });
      showToast('Label created successfully', 'success');
      toggleModal('modal-labels-form', false);
      fetchBoardData();
    } catch (err) {
      console.error(err);
    }
  };

  // Add column status modal trigger
  document.getElementById('btn-add-status-placeholder').onclick = () => {
    document.getElementById('column-form-title').innerText = 'Add Column Status';
    document.getElementById('input-column-id').value = '';
    document.getElementById('input-column-name').value = '';
    document.getElementById('input-column-wip').value = '';
    toggleModal('modal-column-form', true);
  };

  // Column config form submit
  document.getElementById('btn-column-form-submit').onclick = handleColumnFormSubmit;

  // Task form submit
  document.getElementById('btn-task-form-submit').onclick = handleTaskFormSubmit;

  // Detail Modal Subtask adding
  document.getElementById('btn-add-subtask-submit').onclick = addSubtask;
  document.getElementById('input-new-subtask').onkeydown = (e) => {
    if (e.key === 'Enter') addSubtask();
  };

  // Detail Modal Comment adding
  document.getElementById('btn-add-comment-submit').onclick = addComment;
}

// Simple HTML escaping helper to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
