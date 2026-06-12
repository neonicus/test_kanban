// Landing page initialization and logic

document.addEventListener('DOMContentLoaded', () => {
  // Check user authentication
  initIdentity();
  
  // Load room listings
  fetchRooms();
  // Poll rooms every 5 seconds
  setInterval(fetchRooms, 5000);

  // Setup DOM Event Listeners
  setupEventListeners();
});

// Modal toggle helper
function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (show) {
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
  }
}

// User Profile Onboarding Check
function initIdentity() {
  const profile = getUserProfile();
  
  if (!profile) {
    // Force open identity modal
    toggleModal('modal-identity', true);
  } else {
    updateHeaderProfileWidget();
  }
}

// Event bindings
function setupEventListeners() {
  // Identity submit
  document.getElementById('btn-submit-identity').addEventListener('click', submitIdentity);
  
  // Show Create Room Modal
  document.getElementById('btn-show-create-room').addEventListener('click', () => {
    const profile = getUserProfile();
    if (!profile) {
      toggleModal('modal-identity', true);
    } else {
      toggleModal('modal-create-room', true);
    }
  });

  // Create Room Submit
  document.getElementById('btn-create-room-submit').addEventListener('click', createRoom);

  // Join Room by ID Input
  document.getElementById('btn-join-room').addEventListener('click', () => {
    const roomIdInput = document.getElementById('input-join-room-id').value.trim();
    if (!roomIdInput) {
      showToast('Please enter a Room ID', 'warning');
      return;
    }
    // Redirect directly to board page, the board controller will handle visitor access
    window.location.href = `/board.html?id=${roomIdInput}`;
  });
}

// Submit user name
async function submitIdentity() {
  const nicknameInput = document.getElementById('input-nickname').value.trim();
  const avatarColorInput = document.getElementById('input-avatar-color').value;

  if (!nicknameInput) {
    showToast('Name is required', 'warning');
    return;
  }

  if (nicknameInput.length > 30) {
    showToast('Name must be 30 characters or less', 'warning');
    return;
  }

  try {
    const data = await apiCall('/users', 'POST', {
      displayName: nicknameInput,
      avatarColor: avatarColorInput
    });

    setUserProfile(data.token, data.displayName, data.avatarColor);
    toggleModal('modal-identity', false);
    updateHeaderProfileWidget();
    showToast(`Welcome, ${data.displayName}!`, 'success');
    
    // Refresh rooms as they are now authenticated
    fetchRooms();
  } catch (err) {
    console.error('Identity Submission Error:', err);
  }
}

// Create Room Action
async function createRoom() {
  const nameInput = document.getElementById('input-room-name').value.trim();
  const descInput = document.getElementById('input-room-desc').value.trim();

  if (!nameInput) {
    showToast('Room Name is required', 'warning');
    return;
  }

  if (nameInput.length > 50) {
    showToast('Room Name must be 50 characters or less', 'warning');
    return;
  }

  try {
    const data = await apiCall('/rooms', 'POST', {
      name: nameInput,
      description: descInput
    });

    showToast('Room successfully created!', 'success');
    toggleModal('modal-create-room', false);
    
    // Redirect to Kanban board
    window.location.href = `/board.html?id=${data.id}`;
  } catch (err) {
    console.error('Room Creation Error:', err);
  }
}

// Fetch Rooms List
async function fetchRooms() {
  const profile = getUserProfile();
  if (!profile) return; // Wait until authenticated to show listings

  try {
    const rooms = await apiCall('/rooms', 'GET');
    renderRooms(rooms);
    
    const timeLabel = document.getElementById('rooms-last-updated');
    if (timeLabel) {
      timeLabel.innerText = `Updated at ${new Date().toLocaleTimeString()}`;
    }
  } catch (err) {
    console.error('Fetch Rooms Error:', err);
  }
}

// Render Room Lists
function renderRooms(rooms) {
  const grid = document.getElementById('rooms-list-grid');
  if (!grid) return;

  if (rooms.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 12px;">
        <p>No active boards found. Create a board to get started!</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    const createdDate = new Date(room.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return `
      <div class="room-card">
        <div class="room-card-header">
          <div class="room-name">${escapeHtml(room.name)}</div>
          <div class="room-date">${createdDate}</div>
        </div>
        <div class="room-desc">${escapeHtml(room.description || 'No description provided.')}</div>
        <div class="room-card-footer">
          <div class="room-meta">
            <span>👥 ${room.memberCount}</span>
            <span>📋 ${room.taskCount}</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.location.href='/board.html?id=${room.id}'" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">
            Join Board →
          </button>
        </div>
      </div>
    `;
  }).join('');
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
