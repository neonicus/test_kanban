const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
require('dotenv').config();

const app = express();

app.use(express.json());

// Initialize database tables on serverless function boot
db.initDb().then(() => {
  console.log('Database successfully verified/initialized.');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// Middleware: Authenticate User
async function checkAuth(req, res, next) {
  const token = req.headers['x-user-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Missing X-User-Token header' });
  }

  try {
    const userResult = await db.query(
      'SELECT token, display_name AS "displayName", avatar_color AS "avatarColor" FROM users WHERE token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized: Invalid user token' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (err) {
    console.error('checkAuth Error:', err);
    res.status(500).json({ error: 'Database authentication error' });
  }
}

// Middleware: Verify Room Access & Load Role
async function checkRoomAccess(req, res, next) {
  const roomId = req.params.roomId || req.body.roomId;
  const userToken = req.user.token;

  if (!roomId) {
    return res.status(400).json({ error: 'Missing Room ID' });
  }

  try {
    // Check if room exists
    const roomResult = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }
    req.room = roomResult.rows[0];

    // Get member role
    const memberResult = await db.query(
      'SELECT role FROM room_members WHERE room_id = $1 AND user_token = $2',
      [roomId, userToken]
    );

    if (memberResult.rows.length === 0) {
      // Automatically join as visitor if not in room yet
      await db.query(
        'INSERT INTO room_members (room_id, user_token, role) VALUES ($1, $2, $3)',
        [roomId, userToken, 'visitor']
      );
      req.roomRole = 'visitor';
    } else {
      req.roomRole = memberResult.rows[0].role;
    }

    // Update active session to track online status
    await db.query(
      `INSERT INTO sessions (session_token, user_token, current_room_id, updated_at)
       VALUES ($1, $1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (session_token)
       DO UPDATE SET current_room_id = $2, updated_at = CURRENT_TIMESTAMP`,
      [userToken, roomId]
    );

    req.roomId = roomId;
    next();
  } catch (err) {
    console.error('checkRoomAccess Error:', err);
    res.status(500).json({ error: 'Database room authorization error' });
  }
}

// Helper: Assert user is Owner
function requireOwner(req, res, next) {
  if (req.roomRole !== 'owner') {
    return res.status(403).json({ error: 'Permission denied: Requires Owner role' });
  }
  next();
}

// Helper: Assert user is Member or Owner
function requireMemberOrOwner(req, res, next) {
  if (req.roomRole !== 'member' && req.roomRole !== 'owner') {
    return res.status(403).json({ error: 'Permission denied: Requires Member or Owner role' });
  }
  next();
}

// ==========================================
// 1. User & Session Endpoints
// ==========================================

// Create user profile (Onboarding)
app.post('/api/users', async (req, res) => {
  const { displayName, avatarColor } = req.body;
  
  if (!displayName || typeof displayName !== 'string') {
    return res.status(400).json({ error: 'Display name is required' });
  }
  
  const trimmedName = displayName.trim();
  if (trimmedName.length === 0 || trimmedName.length > 30) {
    return res.status(400).json({ error: 'Display name must be between 1 and 30 characters' });
  }

  const color = avatarColor || '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
  const token = uuidv4();

  try {
    await db.query(
      'INSERT INTO users (token, display_name, avatar_color) VALUES ($1, $2, $3)',
      [token, trimmedName, color]
    );
    res.status(201).json({ token, displayName: trimmedName, avatarColor: color });
  } catch (err) {
    console.error('Post User Error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get current user profile
app.get('/api/users/me', checkAuth, (req, res) => {
  res.json(req.user);
});


// ==========================================
// 2. Room Endpoints
// ==========================================

// Create a Room
app.post('/api/rooms', checkAuth, async (req, res) => {
  const { name, description } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Room name is required' });
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 50) {
    return res.status(400).json({ error: 'Room name must be between 1 and 50 characters' });
  }

  const roomId = uuidv4();
  const ownerToken = req.user.token;

  try {
    // 1. Insert Room
    await db.query(
      'INSERT INTO rooms (id, name, description, owner_token) VALUES ($1, $2, $3, $4)',
      [roomId, trimmedName, description || '', ownerToken]
    );

    // 2. Join as Owner in members table
    await db.query(
      'INSERT INTO room_members (room_id, user_token, role) VALUES ($1, $2, $3)',
      [roomId, ownerToken, 'owner']
    );

    // 3. Create default columns (Todo, In Progress, Review, Done)
    const defaultStatuses = [
      { id: uuidv4(), name: 'Todo', order: 1 },
      { id: uuidv4(), name: 'In Progress', order: 2 },
      { id: uuidv4(), name: 'Review', order: 3 },
      { id: uuidv4(), name: 'Done', order: 4 }
    ];

    for (const status of defaultStatuses) {
      await db.query(
        'INSERT INTO statuses (id, room_id, name, sort_order, wip_limit) VALUES ($1, $2, $3, $4, $5)',
        [status.id, roomId, status.name, status.order, null]
      );
    }

    res.status(201).json({ id: roomId, name: trimmedName, description });
  } catch (err) {
    console.error('Create Room Error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// List all active Rooms
app.get('/api/rooms', checkAuth, async (req, res) => {
  try {
    const sql = `
      SELECT r.id, r.name, r.description, r.created_at AS "createdAt",
             u.display_name AS "ownerName",
             (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS "memberCount",
             (SELECT COUNT(*) FROM tasks t WHERE t.room_id = r.id) AS "taskCount"
      FROM rooms r
      JOIN users u ON r.owner_token = u.token
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(sql);
    res.json(result.rows);
  } catch (err) {
    console.error('List Rooms Error:', err);
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
});

// Get Kanban Board Page Data (Room details, columns, members, tasks, labels)
app.get('/api/rooms/:roomId', checkAuth, checkRoomAccess, async (req, res) => {
  const { roomId } = req;
  try {
    // 1. Get room details
    const roomDetails = {
      id: req.room.id,
      name: req.room.name,
      description: req.room.description,
      ownerToken: req.room.owner_token,
      created_at: req.room.created_at,
      userRole: req.roomRole
    };

    // 2. Get columns (statuses)
    const statusesRes = await db.query(
      'SELECT id, name, sort_order AS "order", wip_limit AS "wipLimit" FROM statuses WHERE room_id = $1 ORDER BY sort_order ASC',
      [roomId]
    );

    // 3. Get labels
    const labelsRes = await db.query(
      'SELECT id, name, color FROM labels WHERE room_id = $1 ORDER BY name ASC',
      [roomId]
    );

    // 4. Get active tasks (and details)
    const tasksSql = `
      SELECT t.id, t.room_id AS "roomId", t.title, t.description, t.priority, 
             t.due_date AS "dueDate", t.is_blocked AS "isBlocked", t.blocked_reason AS "blockedReason",
             t.created_by AS "createdBy", t.assigned_to AS "assignedTo", t.status_id AS "statusId",
             t.created_at AS "createdAt", t.updated_at AS "updatedAt",
             COALESCE(
               (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color)) 
                FROM task_labels tl 
                JOIN labels l ON tl.label_id = l.id 
                WHERE tl.task_id = t.id), 
               '[]'::json
             ) as labels,
             (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS "subtaskCount",
             (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.completed = true) AS "subtaskCompletedCount",
             (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS "commentCount",
             u_creator.display_name AS "creatorName",
             u_assignee.display_name AS "assigneeName",
             u_assignee.avatar_color AS "assigneeColor"
      FROM tasks t
      LEFT JOIN users u_creator ON t.created_by = u_creator.token
      LEFT JOIN users u_assignee ON t.assigned_to = u_assignee.token
      WHERE t.room_id = $1
    `;
    const tasksRes = await db.query(tasksSql, [roomId]);

    // 5. Get members (and their online status)
    const membersSql = `
      SELECT u.token, u.display_name AS "displayName", u.avatar_color AS "avatarColor", rm.role,
             CASE WHEN EXISTS (
               SELECT 1 FROM sessions s 
               WHERE s.user_token = u.token 
                 AND s.current_room_id = $1 
                 AND s.updated_at >= CURRENT_TIMESTAMP - INTERVAL '10 seconds'
             ) THEN true ELSE false END AS "isOnline"
      FROM room_members rm
      JOIN users u ON rm.user_token = u.token
      WHERE rm.room_id = $1
      ORDER BY rm.role = 'owner' DESC, rm.role = 'member' DESC, u.display_name ASC
    `;
    const membersRes = await db.query(membersSql, [roomId]);

    res.json({
      room: roomDetails,
      statuses: statusesRes.rows,
      labels: labelsRes.rows,
      tasks: tasksRes.rows,
      members: membersRes.rows
    });
  } catch (err) {
    console.error('Get Board Data Error:', err);
    res.status(500).json({ error: 'Failed to retrieve board data' });
  }
});

// Leave Room (if not owner)
app.post('/api/rooms/:roomId/leave', checkAuth, checkRoomAccess, async (req, res) => {
  if (req.roomRole === 'owner') {
    return res.status(400).json({ error: 'Owner cannot leave room. You must transfer ownership first.' });
  }

  try {
    await db.query(
      'DELETE FROM room_members WHERE room_id = $1 AND user_token = $2',
      [req.roomId, req.user.token]
    );
    // Clear user's session active room
    await db.query(
      'UPDATE sessions SET current_room_id = NULL WHERE user_token = $1',
      [req.user.token]
    );

    res.json({ success: true, message: 'Successfully left room' });
  } catch (err) {
    console.error('Leave Room Error:', err);
    res.status(500).json({ error: 'Failed to leave room' });
  }
});

// Delete Room (Owner only)
app.delete('/api/rooms/:roomId', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  try {
    await db.query('DELETE FROM rooms WHERE id = $1', [req.roomId]);
    res.json({ success: true, message: 'Room successfully deleted' });
  } catch (err) {
    console.error('Delete Room Error:', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Manage member permissions (Owner only)
app.post('/api/rooms/:roomId/members', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { userToken, role } = req.body;

  if (!userToken || !role) {
    return res.status(400).json({ error: 'userToken and role are required' });
  }

  if (!['owner', 'member', 'visitor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Prevent changing own owner role directly (must transfer ownership to someone else)
  if (userToken === req.user.token) {
    return res.status(400).json({ error: 'You cannot change your own role. Transfer ownership to another user instead.' });
  }

  try {
    if (role === 'owner') {
      // TRANSFER OWNERSHIP Flow
      // 1. Promote new owner
      await db.query(
        'UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_token = $3',
        ['owner', req.roomId, userToken]
      );
      // 2. Demote current owner to member
      await db.query(
        'UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_token = $3',
        ['member', req.roomId, req.user.token]
      );
      // 3. Update room table owner token
      await db.query(
        'UPDATE rooms SET owner_token = $1 WHERE id = $2',
        [userToken, req.roomId]
      );

      return res.json({ success: true, message: 'Ownership successfully transferred' });
    } else {
      // General demote/promote member/visitor
      const resUpdate = await db.query(
        'UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_token = $3',
        [role, req.roomId, userToken]
      );

      if (resUpdate.rowCount === 0) {
        return res.status(404).json({ error: 'User is not a member of this room' });
      }

      res.json({ success: true, message: `Member role updated to ${role}` });
    }
  } catch (err) {
    console.error('Update Member Role Error:', err);
    res.status(500).json({ error: 'Failed to update member permissions' });
  }
});


// ==========================================
// 3. Status/Column Management Endpoints
// ==========================================

// Create new Status column (Owner only)
app.post('/api/rooms/:roomId/statuses', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { name, wipLimit } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Status name is required' });
  }

  const trimmedName = name.trim();
  let parsedLimit = null;
  if (wipLimit !== undefined && wipLimit !== null && wipLimit !== '') {
    parsedLimit = parseInt(wipLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'WIP Limit must be a positive integer or empty' });
    }
  }

  try {
    // Enforce name uniqueness within room
    const checkUnique = await db.query(
      'SELECT id FROM statuses WHERE room_id = $1 AND LOWER(name) = LOWER($2)',
      [req.roomId, trimmedName]
    );
    if (checkUnique.rows.length > 0) {
      return res.status(400).json({ error: `Column status "${trimmedName}" already exists in this room` });
    }

    // Get max sort_order
    const maxOrderRes = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM statuses WHERE room_id = $1',
      [req.roomId]
    );
    const nextOrder = maxOrderRes.rows[0].max_order + 1;

    const statusId = uuidv4();
    await db.query(
      'INSERT INTO statuses (id, room_id, name, sort_order, wip_limit) VALUES ($1, $2, $3, $4, $5)',
      [statusId, req.roomId, trimmedName, nextOrder, parsedLimit]
    );

    res.status(201).json({ id: statusId, name: trimmedName, order: nextOrder, wipLimit: parsedLimit });
  } catch (err) {
    console.error('Create Status Error:', err);
    res.status(500).json({ error: 'Failed to create column status' });
  }
});

// Edit Column status (Owner only)
app.put('/api/rooms/:roomId/statuses/:statusId', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { statusId } = req.params;
  const { name, wipLimit } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Status name is required' });
  }

  const trimmedName = name.trim();
  let parsedLimit = null;
  if (wipLimit !== undefined && wipLimit !== null && wipLimit !== '') {
    parsedLimit = parseInt(wipLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'WIP Limit must be a positive integer or empty' });
    }
  }

  try {
    // Check uniqueness (if name changed)
    const checkUnique = await db.query(
      'SELECT id FROM statuses WHERE room_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3',
      [req.roomId, trimmedName, statusId]
    );
    if (checkUnique.rows.length > 0) {
      return res.status(400).json({ error: `Column status "${trimmedName}" already exists in this room` });
    }

    const resUpdate = await db.query(
      'UPDATE statuses SET name = $1, wip_limit = $2 WHERE id = $3 AND room_id = $4',
      [trimmedName, parsedLimit, statusId, req.roomId]
    );

    if (resUpdate.rowCount === 0) {
      return res.status(404).json({ error: 'Status column not found' });
    }

    res.json({ id: statusId, name: trimmedName, wipLimit: parsedLimit });
  } catch (err) {
    console.error('Update Status Error:', err);
    res.status(500).json({ error: 'Failed to update column status' });
  }
});

// Reorder Column statuses (Owner only)
app.put('/api/rooms/:roomId/statuses/reorder', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { statusIds } = req.body; // Array of IDs in the desired order

  if (!Array.isArray(statusIds)) {
    return res.status(400).json({ error: 'statusIds must be an array of column IDs' });
  }

  try {
    // Update each status column sort_order
    for (let i = 0; i < statusIds.length; i++) {
      await db.query(
        'UPDATE statuses SET sort_order = $1 WHERE id = $2 AND room_id = $3',
        [i + 1, statusIds[i], req.roomId]
      );
    }
    res.json({ success: true, message: 'Columns successfully reordered' });
  } catch (err) {
    console.error('Reorder Statuses Error:', err);
    res.status(500).json({ error: 'Failed to reorder columns' });
  }
});

// Delete Column status (Owner only)
app.delete('/api/rooms/:roomId/statuses/:statusId', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { statusId } = req.params;

  try {
    // Constraint: Must have at least 1 status
    const countRes = await db.query('SELECT COUNT(*) FROM statuses WHERE room_id = $1', [req.roomId]);
    if (parseInt(countRes.rows[0].count, 10) <= 1) {
      return res.status(400).json({ error: 'Board must have at least one column status' });
    }

    // Constraint: Cannot delete if it has tasks
    const tasksRes = await db.query('SELECT COUNT(*) FROM tasks WHERE status_id = $1', [statusId]);
    if (parseInt(tasksRes.rows[0].count, 10) > 0) {
      return res.status(400).json({ error: 'Cannot delete column: It contains active tasks. Move or delete the tasks first.' });
    }

    const resDel = await db.query('DELETE FROM statuses WHERE id = $1 AND room_id = $2', [statusId, req.roomId]);
    if (resDel.rowCount === 0) {
      return res.status(404).json({ error: 'Status column not found' });
    }

    res.json({ success: true, message: 'Column status deleted successfully' });
  } catch (err) {
    console.error('Delete Status Error:', err);
    res.status(500).json({ error: 'Failed to delete column status' });
  }
});


// ==========================================
// 4. Task Management Endpoints
// ==========================================

// Create a Task (Member or Owner)
app.post('/api/rooms/:roomId/tasks', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { title, description, priority, dueDate, assignedTo, statusId, labelIds } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 100) {
    return res.status(400).json({ error: 'Task title must be 100 characters or less' });
  }

  const taskPriority = priority || 'medium';
  if (!['low', 'medium', 'high', 'urgent'].includes(taskPriority)) {
    return res.status(400).json({ error: 'Invalid priority value' });
  }

  const status_id = statusId;
  if (!status_id) {
    return res.status(400).json({ error: 'Status ID is required' });
  }

  try {
    // Validate that status exists and belongs to this room
    const statusCheck = await db.query('SELECT name, wip_limit FROM statuses WHERE id = $1 AND room_id = $2', [status_id, req.roomId]);
    if (statusCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Status column does not exist in this room' });
    }

    const taskId = uuidv4();
    const createdBy = req.user.token;
    const assigned_to = assignedTo || null;
    const finalDueDate = dueDate || null;

    // Check target status WIP limit for visual warning response
    const wipLimit = statusCheck.rows[0].wip_limit;
    const statusName = statusCheck.rows[0].name;
    let warning = null;

    if (wipLimit !== null) {
      const taskCountRes = await db.query('SELECT COUNT(*) FROM tasks WHERE status_id = $1', [status_id]);
      const currentCount = parseInt(taskCountRes.rows[0].count, 10);
      if (currentCount >= wipLimit) {
        warning = `WIP limit exceeded for column "${statusName}"`;
      }
    }

    // Insert Task
    await db.query(
      `INSERT INTO tasks (id, room_id, title, description, priority, due_date, created_by, assigned_to, status_id, is_blocked, blocked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, FALSE, NULL)`,
      [taskId, req.roomId, trimmedTitle, description || '', taskPriority, finalDueDate, createdBy, assigned_to, status_id]
    );

    // Insert Task Labels if provided
    if (Array.isArray(labelIds) && labelIds.length > 0) {
      for (const labelId of labelIds) {
        // Double check label belongs to room
        const labelCheck = await db.query('SELECT id FROM labels WHERE id = $1 AND room_id = $2', [labelId, req.roomId]);
        if (labelCheck.rows.length > 0) {
          await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)', [taskId, labelId]);
        }
      }
    }

    res.status(201).json({ taskId, title: trimmedTitle, warning });
  } catch (err) {
    console.error('Create Task Error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Edit Task
app.put('/api/rooms/:roomId/tasks/:taskId', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId } = req.params;
  const { title, description, priority, dueDate, assignedTo, statusId, isBlocked, blockedReason, labelIds } = req.body;
  const userToken = req.user.token;

  try {
    // Get existing task to check permissions
    const taskRes = await db.query('SELECT created_by, assigned_to FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRes.rows[0];

    // Permission check:
    // Owners can edit any task.
    // Members can:
    //  1. Assign task to themselves (change only assigned_to field).
    //  2. Full edit IF they are the creator of the task.
    const isCreator = (task.created_by === userToken);
    const isOwner = (req.roomRole === 'owner');

    // Detect if they are doing a full edit or just a self-assign
    const isSelfAssignOnly = (
      title === undefined &&
      description === undefined &&
      priority === undefined &&
      dueDate === undefined &&
      statusId === undefined &&
      isBlocked === undefined &&
      blockedReason === undefined &&
      labelIds === undefined &&
      assignedTo !== undefined
    );

    if (!isOwner && !isCreator) {
      // If member, check if they are self-assigning
      if (isSelfAssignOnly) {
        // Can only assign to themselves (or null if they were assigned)
        if (assignedTo !== userToken && assignedTo !== null) {
          return res.status(403).json({ error: 'Permission denied: Members can only assign tasks to themselves.' });
        }
      } else {
        return res.status(403).json({ error: 'Permission denied: Members can only edit tasks they created.' });
      }
    }

    // Prepare Update statements
    const updates = [];
    const params = [];
    let index = 1;

    if (title !== undefined) {
      if (title.trim().length === 0) return res.status(400).json({ error: 'Title cannot be empty' });
      updates.push(`title = $${index++}`);
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${index++}`);
      params.push(description);
    }
    if (priority !== undefined) {
      if (!['low', 'medium', 'high', 'urgent'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });
      updates.push(`priority = $${index++}`);
      params.push(priority);
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${index++}`);
      params.push(dueDate || null);
    }
    if (assignedTo !== undefined) {
      updates.push(`assigned_to = $${index++}`);
      params.push(assignedTo || null);
    }
    if (statusId !== undefined) {
      // Verify status exists in this room
      const statusCheck = await db.query('SELECT name FROM statuses WHERE id = $1 AND room_id = $2', [statusId, req.roomId]);
      if (statusCheck.rows.length === 0) return res.status(400).json({ error: 'Status column not found in this room' });
      updates.push(`status_id = $${index++}`);
      params.push(statusId);
    }
    if (isBlocked !== undefined) {
      updates.push(`is_blocked = $${index++}`);
      params.push(!!isBlocked);
    }
    if (blockedReason !== undefined) {
      updates.push(`blocked_reason = $${index++}`);
      params.push(blockedReason || null);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(taskId);
      params.push(req.roomId);
      await db.query(
        `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${index} AND room_id = $${index+1}`,
        params
      );
    }

    // Labels synchronization if full edit is allowed
    if (labelIds !== undefined && (isOwner || isCreator)) {
      // Clear old labels
      await db.query('DELETE FROM task_labels WHERE task_id = $1', [taskId]);
      // Insert new labels
      if (Array.isArray(labelIds) && labelIds.length > 0) {
        for (const labelId of labelIds) {
          const labelCheck = await db.query('SELECT id FROM labels WHERE id = $1 AND room_id = $2', [labelId, req.roomId]);
          if (labelCheck.rows.length > 0) {
            await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ($1, $2)', [taskId, labelId]);
          }
        }
      }
    }

    res.json({ success: true, message: 'Task updated successfully' });
  } catch (err) {
    console.error('Update Task Error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Drag Task status update (Member or Owner)
app.put('/api/rooms/:roomId/tasks/:taskId/drag', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId } = req.params;
  const { statusId } = req.body;

  if (!statusId) {
    return res.status(400).json({ error: 'statusId is required' });
  }

  try {
    // 1. Get task status details and name
    const taskRes = await db.query('SELECT is_blocked, blocked_reason FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const taskObj = taskRes.rows[0];

    // 2. Validate target status exists in this room
    const statusCheck = await db.query('SELECT name, wip_limit FROM statuses WHERE id = $1 AND room_id = $2', [statusId, req.roomId]);
    if (statusCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Status column not found in this room' });
    }
    const targetStatusName = statusCheck.rows[0].name;
    const targetWipLimit = statusCheck.rows[0].wip_limit;

    // 3. Check WIP Limit warn
    let warning = null;
    if (targetWipLimit !== null) {
      const taskCountRes = await db.query('SELECT COUNT(*) FROM tasks WHERE status_id = $1', [statusId]);
      const currentCount = parseInt(taskCountRes.rows[0].count, 10);
      if (currentCount >= targetWipLimit) {
        warning = `WIP limit exceeded for column "${targetStatusName}"`;
      }
    }

    // 4. Update task status
    await db.query(
      'UPDATE tasks SET status_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND room_id = $3',
      [statusId, taskId, req.roomId]
    );

    // If task is blocked, return a specific message too
    let dragMessage = 'Task moved successfully';
    if (taskObj.is_blocked) {
      dragMessage = `Task moved successfully but warning: This task is blocked (${taskObj.blocked_reason})`;
    }

    res.json({ success: true, message: dragMessage, warning });
  } catch (err) {
    console.error('Drag Task Error:', err);
    res.status(500).json({ error: 'Failed to update task status during drag' });
  }
});

// Delete Task
app.delete('/api/rooms/:roomId/tasks/:taskId', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId } = req.params;
  const userToken = req.user.token;

  try {
    const taskRes = await db.query('SELECT created_by FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskRes.rows[0];
    const isCreator = (task.created_by === userToken);
    const isOwner = (req.roomRole === 'owner');

    if (!isOwner && !isCreator) {
      return res.status(403).json({ error: 'Permission denied: Members can only delete tasks they created' });
    }

    await db.query('DELETE FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete Task Error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});


// ==========================================
// 5. Labels Management Endpoints
// ==========================================

// Create a Room Label (Owner only)
app.post('/api/rooms/:roomId/labels', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { name, color } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Label name is required' });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 20) {
    return res.status(400).json({ error: 'Label name must be 20 characters or less' });
  }

  const labelColor = color || '#718096';

  try {
    // Unique check
    const checkUnique = await db.query(
      'SELECT id FROM labels WHERE room_id = $1 AND LOWER(name) = LOWER($2)',
      [req.roomId, trimmedName]
    );
    if (checkUnique.rows.length > 0) {
      return res.status(400).json({ error: `Label "${trimmedName}" already exists in this room` });
    }

    const labelId = uuidv4();
    await db.query(
      'INSERT INTO labels (id, room_id, name, color) VALUES ($1, $2, $3, $4)',
      [labelId, req.roomId, trimmedName, labelColor]
    );

    res.status(201).json({ id: labelId, name: trimmedName, color: labelColor });
  } catch (err) {
    console.error('Create Label Error:', err);
    res.status(500).json({ error: 'Failed to create room label' });
  }
});

// Delete a Room Label (Owner only)
app.delete('/api/rooms/:roomId/labels/:labelId', checkAuth, checkRoomAccess, requireOwner, async (req, res) => {
  const { labelId } = req.params;

  try {
    const resDel = await db.query('DELETE FROM labels WHERE id = $1 AND room_id = $2', [labelId, req.roomId]);
    if (resDel.rowCount === 0) {
      return res.status(404).json({ error: 'Label not found' });
    }
    res.json({ success: true, message: 'Label deleted successfully' });
  } catch (err) {
    console.error('Delete Label Error:', err);
    res.status(500).json({ error: 'Failed to delete room label' });
  }
});


// ==========================================
// 6. Subtask Management Endpoints
// ==========================================

async function verifySubtaskAccess(req, res, taskId) {
  const taskRes = await db.query('SELECT created_by FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
  if (taskRes.rows.length === 0) {
    res.status(404).json({ error: 'Task not found' });
    return false;
  }
  const task = taskRes.rows[0];
  const isCreator = (task.created_by === req.user.token);
  const isOwner = (req.roomRole === 'owner');

  if (!isOwner && !isCreator) {
    res.status(403).json({ error: 'Permission denied: Only Owner or the task Creator can manage subtasks.' });
    return false;
  }
  return true;
}

// Get Subtasks for a Task
app.get('/api/rooms/:roomId/tasks/:taskId/subtasks', checkAuth, checkRoomAccess, async (req, res) => {
  const { taskId } = req.params;
  try {
    const taskCheck = await db.query('SELECT id FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const subtasks = await db.query(
      'SELECT id, title, completed, created_by AS "createdBy", created_at AS "createdAt" FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC',
      [taskId]
    );
    res.json(subtasks.rows);
  } catch (err) {
    console.error('Get Subtasks Error:', err);
    res.status(500).json({ error: 'Failed to get subtasks' });
  }
});

// Create a Subtask
app.post('/api/rooms/:roomId/tasks/:taskId/subtasks', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId } = req.params;
  const { title } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Subtask title is required' });
  }
  if (title.trim().length > 100) {
    return res.status(400).json({ error: 'Subtask title must be 100 characters or less' });
  }

  const access = await verifySubtaskAccess(req, res, taskId);
  if (!access) return;

  const subtaskId = uuidv4();

  try {
    await db.query(
      'INSERT INTO subtasks (id, task_id, title, completed, created_by) VALUES ($1, $2, $3, FALSE, $4)',
      [subtaskId, taskId, title.trim(), req.user.token]
    );
    res.status(201).json({ id: subtaskId, title: title.trim(), completed: false });
  } catch (err) {
    console.error('Create Subtask Error:', err);
    res.status(500).json({ error: 'Failed to create subtask' });
  }
});

// Toggle Subtask
app.put('/api/rooms/:roomId/tasks/:taskId/subtasks/:subtaskId', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId, subtaskId } = req.params;
  const { completed } = req.body;

  if (completed === undefined) {
    return res.status(400).json({ error: 'Completed status boolean is required' });
  }

  const access = await verifySubtaskAccess(req, res, taskId);
  if (!access) return;

  try {
    const resUpdate = await db.query(
      'UPDATE subtasks SET completed = $1 WHERE id = $2 AND task_id = $3',
      [!!completed, subtaskId, taskId]
    );

    if (resUpdate.rowCount === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    res.json({ success: true, message: 'Subtask toggled successfully' });
  } catch (err) {
    console.error('Toggle Subtask Error:', err);
    res.status(500).json({ error: 'Failed to update subtask' });
  }
});

// Delete Subtask
app.delete('/api/rooms/:roomId/tasks/:taskId/subtasks/:subtaskId', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId, subtaskId } = req.params;

  const access = await verifySubtaskAccess(req, res, taskId);
  if (!access) return;

  try {
    const resDel = await db.query('DELETE FROM subtasks WHERE id = $1 AND task_id = $2', [subtaskId, taskId]);
    if (resDel.rowCount === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }
    res.json({ success: true, message: 'Subtask deleted successfully' });
  } catch (err) {
    console.error('Delete Subtask Error:', err);
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
});


// ==========================================
// 7. Comments Management Endpoints
// ==========================================

// Get Comments for a Task
app.get('/api/rooms/:roomId/tasks/:taskId/comments', checkAuth, checkRoomAccess, async (req, res) => {
  const { taskId } = req.params;

  try {
    const comments = await db.query(
      `SELECT c.id, c.task_id AS "taskId", c.user_token AS "userToken", c.display_name AS "displayName", 
              c.content, c.created_at AS "createdAt", u.avatar_color AS "avatarColor"
       FROM comments c
       JOIN users u ON c.user_token = u.token
       WHERE c.task_id = $1
       ORDER BY c.created_at ASC`,
      [taskId]
    );
    res.json(comments.rows);
  } catch (err) {
    console.error('Get Comments Error:', err);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// Post a Comment (Member or Owner)
app.post('/api/rooms/:roomId/tasks/:taskId/comments', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId } = req.params;
  const { content } = req.body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  if (content.trim().length > 500) {
    return res.status(400).json({ error: 'Comment must be 500 characters or less' });
  }

  try {
    const taskCheck = await db.query('SELECT id FROM tasks WHERE id = $1 AND room_id = $2', [taskId, req.roomId]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const commentId = uuidv4();
    await db.query(
      'INSERT INTO comments (id, task_id, user_token, display_name, content) VALUES ($1, $2, $3, $4, $5)',
      [commentId, taskId, req.user.token, req.user.displayName, content.trim()]
    );

    res.status(201).json({ id: commentId, content: content.trim(), displayName: req.user.displayName, createdAt: new Date() });
  } catch (err) {
    console.error('Post Comment Error:', err);
    res.status(500).json({ error: 'Failed to post comment' });
  }
});

// Delete a Comment
app.delete('/api/rooms/:roomId/tasks/:taskId/comments/:commentId', checkAuth, checkRoomAccess, requireMemberOrOwner, async (req, res) => {
  const { taskId, commentId } = req.params;
  const userToken = req.user.token;

  try {
    const commentRes = await db.query('SELECT user_token FROM comments WHERE id = $1 AND task_id = $2', [commentId, taskId]);
    if (commentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const commentOwnerToken = commentRes.rows[0].user_token;
    const isOwner = (req.roomRole === 'owner');
    const isCommentWriter = (commentOwnerToken === userToken);

    if (!isOwner && !isCommentWriter) {
      return res.status(403).json({ error: 'Permission denied: Members can only delete their own comments' });
    }

    await db.query('DELETE FROM comments WHERE id = $1 AND task_id = $2', [commentId, taskId]);
    res.json({ success: true, message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Delete Comment Error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = app;
