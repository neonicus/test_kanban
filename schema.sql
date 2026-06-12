-- Collaborative Kanban Board DB Schema

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    token VARCHAR(255) PRIMARY KEY,
    display_name VARCHAR(30) NOT NULL,
    avatar_color VARCHAR(7) NOT NULL
);

-- 2. Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    owner_token VARCHAR(255) REFERENCES users(token) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sessions
CREATE TABLE IF NOT EXISTS sessions (
    session_token VARCHAR(255) PRIMARY KEY,
    user_token VARCHAR(255) REFERENCES users(token) ON DELETE CASCADE,
    current_room_id VARCHAR(255) REFERENCES rooms(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Room Members
CREATE TABLE IF NOT EXISTS room_members (
    room_id VARCHAR(255) REFERENCES rooms(id) ON DELETE CASCADE,
    user_token VARCHAR(255) REFERENCES users(token) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'member', 'visitor')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_token)
);

-- 5. Statuses
CREATE TABLE IF NOT EXISTS statuses (
    id VARCHAR(255) PRIMARY KEY,
    room_id VARCHAR(255) REFERENCES rooms(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    sort_order INTEGER NOT NULL,
    wip_limit INTEGER NULL CHECK (wip_limit > 0 OR wip_limit IS NULL),
    UNIQUE (room_id, name)
);

-- 6. Labels
CREATE TABLE IF NOT EXISTS labels (
    id VARCHAR(255) PRIMARY KEY,
    room_id VARCHAR(255) REFERENCES rooms(id) ON DELETE CASCADE,
    name VARCHAR(20) NOT NULL,
    color VARCHAR(7) NOT NULL,
    UNIQUE (room_id, name)
);

-- 7. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(255) PRIMARY KEY,
    room_id VARCHAR(255) REFERENCES rooms(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date TIMESTAMP NULL,
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_reason TEXT NULL,
    created_by VARCHAR(255) REFERENCES users(token) ON DELETE RESTRICT,
    assigned_to VARCHAR(255) REFERENCES users(token) ON DELETE SET NULL,
    status_id VARCHAR(255) REFERENCES statuses(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Task Labels
CREATE TABLE IF NOT EXISTS task_labels (
    task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
    label_id VARCHAR(255) REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

-- 9. Subtasks
CREATE TABLE IF NOT EXISTS subtasks (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255) REFERENCES users(token) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Comments
CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) REFERENCES tasks(id) ON DELETE CASCADE,
    user_token VARCHAR(255) REFERENCES users(token) ON DELETE CASCADE,
    display_name VARCHAR(100) NOT NULL,
    content VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
