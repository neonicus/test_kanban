import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { pool, query, withTransaction } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json());
app.use(express.static(rootDir));

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `kanban_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${isProduction ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "kanban_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

async function getSession(req) {
  const cookies = parseCookies(req.header("cookie") || "");
  const sessionToken = cookies.kanban_session ? String(cookies.kanban_session).trim() : "";
  if (!sessionToken) {
    return null;
  }

  const result = await query(
    `
      SELECT
        s.session_token AS "sessionToken",
        s.user_token AS "userToken",
        s.current_room_id AS "currentRoomId",
        u.display_name AS "displayName"
      FROM sessions s
      JOIN users u ON u.token = s.user_token
      WHERE s.session_token = $1
      LIMIT 1
    `,
    [sessionToken],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    session: {
      sessionToken: row.sessionToken,
      userToken: row.userToken,
      currentRoomId: row.currentRoomId,
    },
    user: {
      token: row.userToken,
      displayName: row.displayName,
    },
  };
}

async function requireSession(req) {
  const session = await getSession(req);
  if (!session) {
    const error = new Error("Not authenticated");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

async function getUserRoomRole(roomId, userToken) {
  const result = await query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_token = $2 LIMIT 1`,
    [roomId, userToken]
  );
  return result.rows[0]?.role ?? null;
}

async function getRoomDetail(roomId) {
  const roomResult = await query(
    `
      SELECT r.id, r.name, r.description, r.owner_token AS "ownerToken", r.created_at AS "createdAt",
             u.display_name AS "ownerName"
      FROM rooms r
      JOIN users u ON u.token = r.owner_token
      WHERE r.id = $1
      LIMIT 1
    `,
    [roomId]
  );

  const roomRow = roomResult.rows[0];
  if (!roomRow) {
    return null;
  }

  const [membersResult, statusesResult, tasksResult] = await Promise.all([
    query(
      `
        SELECT rm.user_token AS "token", u.display_name AS "displayName", rm.role
        FROM room_members rm
        JOIN users u ON u.token = rm.user_token
        WHERE rm.room_id = $1
        ORDER BY rm.joined_at ASC
      `,
      [roomId]
    ),
    query(
      `
        SELECT id, room_id AS "roomId", name, order_index AS "order"
        FROM statuses
        WHERE room_id = $1
        ORDER BY order_index ASC
      `,
      [roomId]
    ),
    query(
      `
        SELECT t.id, t.room_id AS "roomId", t.title, t.description,
               t.created_by AS "createdByToken", creator.display_name AS "createdBy",
               t.assigned_to AS "assignedTo", t.status_id AS "statusId",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM tasks t
        JOIN users creator ON creator.token = t.created_by
        WHERE t.room_id = $1
        ORDER BY t.created_at ASC
      `,
      [roomId]
    )
  ]);

  return {
    id: roomRow.id,
    name: roomRow.name,
    description: roomRow.description,
    ownerToken: roomRow.ownerToken,
    ownerName: roomRow.ownerName,
    createdAt: roomRow.createdAt,
    memberCount: membersResult.rows.length,
    members: membersResult.rows,
    statuses: statusesResult.rows,
    tasks: tasksResult.rows
  };
}

// Routes

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Auth & user routes

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const displayName = normalizeText(req.body?.displayName);
    if (!displayName) {
      return sendError(res, 400, "Display name is required");
    }
    if (displayName.length > 30) {
      return sendError(res, 400, "Display name must be 30 characters or less");
    }

    const result = await withTransaction(async (client) => {
      const userResult = await client.query(
        `
          INSERT INTO users (display_name)
          VALUES ($1)
          RETURNING token, display_name AS "displayName"
        `,
        [displayName]
      );
      const user = userResult.rows[0];

      const sessionResult = await client.query(
        `
          INSERT INTO sessions (user_token)
          VALUES ($1)
          RETURNING session_token
        `,
        [user.token]
      );

      return {
        user,
        sessionToken: sessionResult.rows[0].session_token
      };
    });

    setSessionCookie(res, result.sessionToken);
    return res.status(201).json(result.user);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const sessionInfo = await getSession(req);
    if (sessionInfo) {
      await query("DELETE FROM sessions WHERE session_token = $1", [sessionInfo.session.sessionToken]);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    const sessionInfo = await getSession(req);
    if (!sessionInfo) {
      return res.json({ session: null, user: null });
    }
    return res.json(sessionInfo);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    return res.json(sessionInfo.user);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/me", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const displayName = normalizeText(req.body?.displayName);
    if (!displayName) {
      return sendError(res, 400, "Display name is required");
    }
    if (displayName.length > 30) {
      return sendError(res, 400, "Display name must be 30 characters or less");
    }

    const result = await query(
      `
        UPDATE users
        SET display_name = $2,
            updated_at = now()
        WHERE token = $1
        RETURNING token, display_name AS "displayName"
      `,
      [sessionInfo.user.token, displayName]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/session", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const currentRoomId = req.body?.currentRoomId || req.body?.currentBoardId || null;

    if (currentRoomId) {
      const roomCheck = await query("SELECT id FROM rooms WHERE id = $1 LIMIT 1", [currentRoomId]);
      if (!roomCheck.rows[0]) {
        return sendError(res, 404, "Room not found");
      }
    }

    await query(
      `
        UPDATE sessions
        SET current_room_id = $2,
            updated_at = now()
        WHERE session_token = $1
      `,
      [sessionInfo.session.sessionToken, currentRoomId]
    );

    return res.json({ ok: true, currentRoomId });
  } catch (error) {
    next(error);
  }
});

// Rooms

app.get("/api/rooms", async (req, res, next) => {
  try {
    await requireSession(req);
    const result = await query(
      `
        SELECT r.id, r.name, r.description, r.owner_token AS "ownerToken", r.created_at AS "createdAt",
               u.display_name AS "ownerName",
               COUNT(rm.user_token)::int AS "memberCount"
        FROM rooms r
        JOIN users u ON u.token = r.owner_token
        LEFT JOIN room_members rm ON rm.room_id = r.id
        GROUP BY r.id, u.display_name
        ORDER BY r.created_at DESC
      `
    );
    return res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const name = normalizeText(req.body?.name);
    const description = normalizeText(req.body?.description);

    if (!name) {
      return sendError(res, 400, "Room name is required");
    }
    if (name.length > 50) {
      return sendError(res, 400, "Room name must be 50 characters or less");
    }

    const roomId = await withTransaction(async (client) => {
      const roomResult = await client.query(
        `
          INSERT INTO rooms (name, description, owner_token)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [name, description || null, sessionInfo.user.token]
      );
      const id = roomResult.rows[0].id;

      await client.query(
        `
          INSERT INTO room_members (room_id, user_token, role)
          VALUES ($1, $2, 'owner')
        `,
        [id, sessionInfo.user.token]
      );

      await client.query(
        `
          INSERT INTO statuses (room_id, name, order_index)
          VALUES
            ($1, 'To Do', 0),
            ($1, 'In Progress', 1),
            ($1, 'Done', 2)
        `,
        [id]
      );

      return id;
    });

    const roomDetail = await getRoomDetail(roomId);
    return res.status(201).json(roomDetail);
  } catch (error) {
    next(error);
  }
});

app.get("/api/rooms/:roomId", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const roomId = req.params.roomId;

    const roomCheck = await query("SELECT id FROM rooms WHERE id = $1 LIMIT 1", [roomId]);
    if (!roomCheck.rows[0]) {
      return sendError(res, 404, "Room not found");
    }

    const role = await getUserRoomRole(roomId, sessionInfo.user.token);
    if (!role) {
      await query(
        `
          INSERT INTO room_members (room_id, user_token, role)
          VALUES ($1, $2, 'visitor')
          ON CONFLICT (room_id, user_token) DO NOTHING
        `,
        [roomId, sessionInfo.user.token]
      );
    }

    const roomDetail = await getRoomDetail(roomId);
    return res.json(roomDetail);
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/join", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const roomId = req.params.roomId;

    const roomCheck = await query("SELECT id FROM rooms WHERE id = $1 LIMIT 1", [roomId]);
    if (!roomCheck.rows[0]) {
      return sendError(res, 404, "Room not found");
    }

    const role = await getUserRoomRole(roomId, sessionInfo.user.token);
    if (!role) {
      await query(
        `
          INSERT INTO room_members (room_id, user_token, role)
          VALUES ($1, $2, 'visitor')
          ON CONFLICT (room_id, user_token) DO NOTHING
        `,
        [roomId, sessionInfo.user.token]
      );
    }

    const roomDetail = await getRoomDetail(roomId);
    return res.json(roomDetail);
  } catch (error) {
    next(error);
  }
});

// Statuses

app.post("/api/rooms/:roomId/statuses", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const roomId = req.params.roomId;
    const name = normalizeText(req.body?.name);

    if (!name) {
      return sendError(res, 400, "Status name is required");
    }
    if (name.length > 30) {
      return sendError(res, 400, "Status name must be 30 characters or less");
    }

    const role = await getUserRoomRole(roomId, sessionInfo.user.token);
    if (role !== "owner") {
      return sendError(res, 403, "Permission denied");
    }

    const existing = await query("SELECT 1 FROM statuses WHERE room_id = $1 AND name = $2 LIMIT 1", [roomId, name]);
    if (existing.rows[0]) {
      return sendError(res, 400, "Status name must be unique within room");
    }

    const maxOrder = await query("SELECT MAX(order_index) AS max_val FROM statuses WHERE room_id = $1", [roomId]);
    const nextOrder = (maxOrder.rows[0]?.max_val !== null && maxOrder.rows[0]?.max_val !== undefined)
      ? Number(maxOrder.rows[0].max_val) + 1
      : 0;

    const result = await query(
      `
        INSERT INTO statuses (room_id, name, order_index)
        VALUES ($1, $2, $3)
        RETURNING id, room_id AS "roomId", name, order_index AS "order"
      `,
      [roomId, name, nextOrder]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/statuses/:statusId", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const statusId = req.params.statusId;
    const name = normalizeText(req.body?.name);

    if (!name) {
      return sendError(res, 400, "Status name is required");
    }
    if (name.length > 30) {
      return sendError(res, 400, "Status name must be 30 characters or less");
    }

    const statusLookup = await query("SELECT room_id FROM statuses WHERE id = $1 LIMIT 1", [statusId]);
    const statusRow = statusLookup.rows[0];
    if (!statusRow) {
      return sendError(res, 404, "Status not found");
    }

    const role = await getUserRoomRole(statusRow.room_id, sessionInfo.user.token);
    if (role !== "owner") {
      return sendError(res, 403, "Permission denied");
    }

    const nameCheck = await query("SELECT 1 FROM statuses WHERE room_id = $1 AND name = $2 AND id != $3 LIMIT 1", [statusRow.room_id, name, statusId]);
    if (nameCheck.rows[0]) {
      return sendError(res, 400, "Status name must be unique within room");
    }

    const result = await query(
      `
        UPDATE statuses
        SET name = $2,
            updated_at = now()
        WHERE id = $1
        RETURNING id, room_id AS "roomId", name, order_index AS "order"
      `,
      [statusId, name]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/statuses/:statusId", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const statusId = req.params.statusId;

    const statusLookup = await query("SELECT room_id FROM statuses WHERE id = $1 LIMIT 1", [statusId]);
    const statusRow = statusLookup.rows[0];
    if (!statusRow) {
      return sendError(res, 404, "Status not found");
    }

    const role = await getUserRoomRole(statusRow.room_id, sessionInfo.user.token);
    if (role !== "owner") {
      return sendError(res, 403, "Permission denied");
    }

    const countResult = await query("SELECT COUNT(*)::int AS count FROM statuses WHERE room_id = $1", [statusRow.room_id]);
    if (countResult.rows[0].count <= 1) {
      return sendError(res, 400, "A board must have at least one status");
    }

    const taskCount = await query("SELECT 1 FROM tasks WHERE status_id = $1 LIMIT 1", [statusId]);
    if (taskCount.rows.length > 0) {
      return sendError(res, 409, "Cannot delete a status that still has tasks");
    }

    await query("DELETE FROM statuses WHERE id = $1", [statusId]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Tasks

app.post("/api/rooms/:roomId/tasks", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const roomId = req.params.roomId;

    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const assignedTo = normalizeText(req.body?.assignedTo) || null;
    const statusId = req.body?.statusId;

    if (!title) {
      return sendError(res, 400, "Task title is required");
    }
    if (title.length > 100) {
      return sendError(res, 400, "Task title must be 100 characters or less");
    }
    if (!statusId) {
      return sendError(res, 400, "Status ID is required");
    }

    const role = await getUserRoomRole(roomId, sessionInfo.user.token);
    if (role !== "owner" && role !== "member") {
      return sendError(res, 403, "Permission denied");
    }

    const statusCheck = await query("SELECT 1 FROM statuses WHERE id = $1 AND room_id = $2 LIMIT 1", [statusId, roomId]);
    if (!statusCheck.rows[0]) {
      return sendError(res, 400, "Status ID does not belong to this room");
    }

    const insertResult = await query(
      `
        INSERT INTO tasks (room_id, status_id, title, description, created_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [roomId, statusId, title, description || null, sessionInfo.user.token, assignedTo]
    );

    const taskDetail = await query(
      `
        SELECT t.id, t.room_id AS "roomId", t.title, t.description,
               t.created_by AS "createdByToken", creator.display_name AS "createdBy",
               t.assigned_to AS "assignedTo", t.status_id AS "statusId",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM tasks t
        JOIN users creator ON creator.token = t.created_by
        WHERE t.id = $1
        LIMIT 1
      `,
      [insertResult.rows[0].id]
    );

    return res.status(201).json(taskDetail.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const taskId = req.params.taskId;

    const taskLookup = await query("SELECT room_id, created_by, status_id FROM tasks WHERE id = $1 LIMIT 1", [taskId]);
    const taskRow = taskLookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }

    const role = await getUserRoomRole(taskRow.room_id, sessionInfo.user.token);
    const isCreator = taskRow.created_by === sessionInfo.user.token;

    if (role === "owner" || (role === "member" && isCreator)) {
      // Allowed to update
    } else {
      return sendError(res, 403, "Permission denied");
    }

    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const assignedTo = req.body?.assignedTo !== undefined ? normalizeText(req.body.assignedTo) : undefined;
    const statusId = req.body?.statusId;

    if (title !== undefined && !title) {
      return sendError(res, 400, "Task title cannot be empty");
    }
    if (title !== undefined && title.length > 100) {
      return sendError(res, 400, "Task title must be 100 characters or less");
    }

    if (statusId !== undefined) {
      const statusCheck = await query("SELECT 1 FROM statuses WHERE id = $1 AND room_id = $2 LIMIT 1", [statusId, taskRow.room_id]);
      if (!statusCheck.rows[0]) {
        return sendError(res, 400, "Status ID does not belong to the same room");
      }
    }

    await query(
      `
        UPDATE tasks
        SET
          title = COALESCE(NULLIF($2, ''), title),
          description = COALESCE($3, description),
          assigned_to = COALESCE($4, assigned_to),
          status_id = COALESCE($5, status_id),
          updated_at = now()
        WHERE id = $1
      `,
      [
        taskId,
        title || null,
        description !== undefined ? (description || null) : null,
        assignedTo !== undefined ? (assignedTo || null) : null,
        statusId || null
      ]
    );

    const taskDetail = await query(
      `
        SELECT t.id, t.room_id AS "roomId", t.title, t.description,
               t.created_by AS "createdByToken", creator.display_name AS "createdBy",
               t.assigned_to AS "assignedTo", t.status_id AS "statusId",
               t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM tasks t
        JOIN users creator ON creator.token = t.created_by
        WHERE t.id = $1
        LIMIT 1
      `,
      [taskId]
    );

    return res.json(taskDetail.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const sessionInfo = await requireSession(req);
    const taskId = req.params.taskId;

    const taskLookup = await query("SELECT room_id, created_by FROM tasks WHERE id = $1 LIMIT 1", [taskId]);
    const taskRow = taskLookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }

    const role = await getUserRoomRole(taskRow.room_id, sessionInfo.user.token);
    const isCreator = taskRow.created_by === sessionInfo.user.token;

    if (role === "owner" || (role === "member" && isCreator)) {
      // Allowed to delete
    } else {
      return sendError(res, 403, "Permission denied");
    }

    await query("DELETE FROM tasks WHERE id = $1", [taskId]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Error handling

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.statusCode || 500;
  const message = error.message || "Internal server error";
  console.error("Error path:", req.path, "Status:", status, "Error details:", error);
  return res.status(status).json({ error: message });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
