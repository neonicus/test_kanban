DROP TABLE IF EXISTS comments, tasks, columns, sessions, boards, users, room_members, rooms, statuses CASCADE;

CREATE TABLE IF NOT EXISTS users (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_name_len CHECK (char_length(display_name) BETWEEN 1 AND 30)
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  description TEXT,
  owner_token UUID NOT NULL REFERENCES users(token) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rooms_name_len CHECK (char_length(name) BETWEEN 1 AND 50)
);

CREATE TABLE IF NOT EXISTS sessions (
  session_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token UUID NOT NULL REFERENCES users(token) ON DELETE CASCADE,
  current_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_token UUID NOT NULL REFERENCES users(token) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'member', 'visitor')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_token)
);

CREATE TABLE IF NOT EXISTS statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(30) NOT NULL,
  order_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT statuses_name_len CHECK (char_length(name) BETWEEN 1 AND 30),
  UNIQUE (room_id, order_index),
  UNIQUE (room_id, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  status_id UUID NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(token) ON DELETE CASCADE,
  assigned_to VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_len CHECK (char_length(title) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_token);
CREATE INDEX IF NOT EXISTS idx_sessions_room ON sessions(current_room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_token);
CREATE INDEX IF NOT EXISTS idx_statuses_room_order ON statuses(room_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tasks_room ON tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_id);
