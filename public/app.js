// Shared client helper utilities

const API_BASE = '/api';

// Get and set local user profile
function getUserToken() {
  return localStorage.getItem('kanban_user_token');
}

function setUserToken(token) {
  localStorage.setItem('kanban_user_token', token);
}

function getUserProfile() {
  const token = getUserToken();
  const displayName = localStorage.getItem('kanban_user_name');
  const avatarColor = localStorage.getItem('kanban_user_color');
  if (!token || !displayName) return null;
  return { token, displayName, avatarColor };
}

function setUserProfile(token, displayName, avatarColor) {
  setUserToken(token);
  localStorage.setItem('kanban_user_name', displayName);
  localStorage.setItem('kanban_user_color', avatarColor);
}

function clearUserProfile() {
  localStorage.removeItem('kanban_user_token');
  localStorage.removeItem('kanban_user_name');
  localStorage.removeItem('kanban_user_color');
}

// Global API Request Helper
async function apiCall(endpoint, method = 'GET', data = null) {
  const token = getUserToken();
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['X-User-Token'] = token;
  }

  const options = {
    method,
    headers
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP error! status: ${response.status}`);
    }
    
    return result;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    showToast(error.message, 'error');
    throw error;
  }
}

// Toast Notification System
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  // Set type icon
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '🚨';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Trigger browser reflow to transition
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove toast after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Render initials avatar HTML
function getAvatarHtml(name, color, size = '2rem') {
  const initials = (name || '?')
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  
  return `
    <div class="avatar" style="background-color: ${color || '#718096'}; width: ${size}; height: ${size}; line-height: ${size};">
      <span class="avatar-initials">${initials}</span>
    </div>
  `;
}

// Render dynamic user widget on top headers
function updateHeaderProfileWidget() {
  const profile = getUserProfile();
  const widget = document.getElementById('header-profile-widget');
  if (!widget) return;

  if (profile) {
    widget.innerHTML = `
      ${getAvatarHtml(profile.displayName, profile.avatarColor)}
      <span class="user-name">${profile.displayName}</span>
    `;
    widget.onclick = () => {
      if (confirm('Do you want to edit your profile / logout?')) {
        clearUserProfile();
        window.location.href = '/';
      }
    };
  } else {
    widget.innerHTML = `<span class="user-name">Login</span>`;
    widget.onclick = () => {
      window.location.href = '/';
    };
  }
}

// Handle onboarding check
function checkAuthAndRedirect() {
  const profile = getUserProfile();
  const currentPath = window.location.pathname;
  
  if (!profile && !currentPath.endsWith('index.html') && currentPath !== '/') {
    window.location.href = '/index.html';
  }
}
