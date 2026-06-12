import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, withTransaction } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 3001);

app.use(express.json());
app.use(express.static(rootDir));

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function mapUser(row) {
  return row
    ? {
        token: row.token,
        displayName: row.display_name,
        createdAt: row.created_at,
      }
    : null;
}

function mapRoom(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerToken: row.owner_token,
    ownerName: row.owner_name,
    memberCount: Number(row.member_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStatus(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    order: row.sort_order,
    createdAt: row.created_at,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    title: row.title,
    description: row.description,
    createdBy: row.created_by_name,
    assignedTo: row.assigned_to_name,
    statusId: row.status_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getRoomRole(roomId, userToken) {
  if (!userToken) {
    return null;
  }

  const result = await query(
    "select role from room_members where room_id = $1 and user_token = $2 limit 1",
    [roomId, userToken],
  );

  return result.rows[0]?.role ?? null;
}

async function getRoomDetail(roomId) {
  const roomResult = await query(
    `
      select
        r.id,
        r.name,
        r.description,
        r.owner_token,
        owner.display_name as owner_name,
        r.created_at,
        r.updated_at,
        count(distinct rm.user_token)::int as member_count
      from rooms r
      join users owner on owner.token = r.owner_token
      left join room_members rm on rm.room_id = r.id
      where r.id = $1
      group by r.id, r.name, r.description, r.owner_token, owner.display_name, r.created_at, r.updated_at
    `,
    [roomId],
  );

  const roomRow = roomResult.rows[0];
  if (!roomRow) {
    return null;
  }

  const [statusResult, taskResult, memberResult] = await Promise.all([
    query(
      `
        select id, room_id, name, sort_order, created_at
        from statuses
        where room_id = $1
        order by sort_order asc, created_at asc
      `,
      [roomId],
    ),
    query(
      `
        select
          t.id,
          t.room_id,
          t.title,
          t.description,
          t.created_by,
          creator.display_name as created_by_name,
          t.assigned_to,
          assignee.display_name as assigned_to_name,
          t.status_id,
          t.created_at,
          t.updated_at
        from tasks t
        join users creator on creator.token = t.created_by
        left join users assignee on assignee.token = t.assigned_to
        where t.room_id = $1
        order by t.created_at desc
      `,
      [roomId],
    ),
    query(
      `
        select
          rm.user_token,
          u.display_name,
          rm.role,
          rm.joined_at
        from room_members rm
        join users u on u.token = rm.user_token
        where rm.room_id = $1
        order by case rm.role when 'owner' then 0 when 'member' then 1 else 2 end, u.display_name asc
      `,
      [roomId],
    ),
  ]);

  return {
    ...mapRoom(roomRow),
    statuses: statusResult.rows.map(mapStatus),
    tasks: taskResult.rows.map(mapTask),
    members: memberResult.rows.map((row) => ({
      token: row.user_token,
      displayName: row.display_name,
      role: row.role,
      joinedAt: row.joined_at,
    })),
  };
}

async function requireRoom(roomId) {
  const room = await getRoomDetail(roomId);
  if (!room) {
    throw Object.assign(new Error("Room not found"), { statusCode: 404 });
  }
  return room;
}

function requireUserToken(req) {
  return normalizeText(req.header("x-user-token"));
}

async function requireMemberRole(roomId, userToken) {
  const role = await getRoomRole(roomId, userToken);
  if (!role || role === "visitor") {
    throw Object.assign(new Error("Permission denied"), { statusCode: 403 });
  }
  return role;
}

async function requireOwnerRole(roomId, userToken) {
  const role = await getRoomRole(roomId, userToken);
  if (role !== "owner") {
    throw Object.assign(new Error("Permission denied"), { statusCode: 403 });
  }
  return role;
}

async function resolveAssigneeToken(roomId, assignedToName) {
  const name = normalizeText(assignedToName);
  if (!name) {
    return null;
  }

  const result = await query(
    `
      select u.token
      from room_members rm
      join users u on u.token = rm.user_token
      where rm.room_id = $1 and lower(u.display_name) = lower($2)
      limit 1
    `,
    [roomId, name],
  );

  return result.rows[0]?.token ?? null;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/users/:token", async (req, res, next) => {
  try {
    const result = await query(
      "select token, display_name, created_at from users where token = $1 limit 1",
      [req.params.token],
    );
    const user = mapUser(result.rows[0]);
    if (!user) {
      return sendError(res, 404, "User not found");
    }
    return res.json(user);
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", async (req, res, next) => {
  try {
    const displayName = normalizeText(req.body?.displayName);
    if (!displayName) {
      return sendError(res, 400, "Display name is required");
    }
    if (displayName.length > 30) {
      return sendError(res, 400, "Display name must be 30 characters or less");
    }

    const result = await query(
      `
        insert into users (display_name)
        values ($1)
        returning token, display_name, created_at
      `,
      [displayName],
    );

    return res.status(201).json(mapUser(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/rooms", async (req, res, next) => {
  try {
    const result = await query(
      `
        select
          r.id,
          r.name,
          r.description,
          r.owner_token,
          owner.display_name as owner_name,
          count(distinct rm.user_token)::int as member_count,
          r.created_at,
          r.updated_at
        from rooms r
        join users owner on owner.token = r.owner_token
        left join room_members rm on rm.room_id = r.id
        group by r.id, r.name, r.description, r.owner_token, owner.display_name, r.created_at, r.updated_at
        order by r.created_at desc
      `,
    );

    return res.json(result.rows.map(mapRoom));
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    if (!userToken) {
      return sendError(res, 400, "Missing X-User-Token header");
    }

    const name = normalizeText(req.body?.name);
    const description = normalizeText(req.body?.description);
    if (!name) {
      return sendError(res, 400, "Room name is required");
    }
    if (name.length > 50) {
      return sendError(res, 400, "Room name must be 50 characters or less");
    }

    const userResult = await query("select token from users where token = $1 limit 1", [userToken]);
    if (!userResult.rows[0]) {
      return sendError(res, 404, "Current user not found");
    }

    const createdRoom = await withTransaction(async (client) => {
      const roomResult = await client.query(
        `
          insert into rooms (name, description, owner_token)
          values ($1, $2, $3)
          returning id
        `,
        [name, description || null, userToken],
      );

      const roomId = roomResult.rows[0].id;

      await client.query(
        `
          insert into room_members (room_id, user_token, role)
          values ($1, $2, 'owner')
        `,
        [roomId, userToken],
      );

      const defaultStatuses = ["Todo", "In Progress", "Review", "Done"];
      for (let index = 0; index < defaultStatuses.length; index += 1) {
        await client.query(
          `
            insert into statuses (room_id, name, sort_order)
            values ($1, $2, $3)
          `,
          [roomId, defaultStatuses[index], index],
        );
      }

      return roomId;
    });

    const room = await requireRoom(createdRoom);
    return res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

app.get("/api/rooms/:roomId", async (req, res, next) => {
  try {
    const room = await getRoomDetail(req.params.roomId);
    if (!room) {
      return sendError(res, 404, "Room not found");
    }
    return res.json(room);
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/join", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    if (!userToken) {
      return sendError(res, 400, "Missing X-User-Token header");
    }

    const room = await requireRoom(req.params.roomId);
    const userResult = await query("select token from users where token = $1 limit 1", [userToken]);
    if (!userResult.rows[0]) {
      return sendError(res, 404, "Current user not found");
    }

    await query(
      `
        insert into room_members (room_id, user_token, role)
        values ($1, $2, 'member')
        on conflict (room_id, user_token) do nothing
      `,
      [room.id, userToken],
    );

    return res.json(await requireRoom(room.id));
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/statuses", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const roomId = req.params.roomId;
    await requireOwnerRole(roomId, userToken);

    const name = normalizeText(req.body?.name);
    if (!name) {
      return sendError(res, 400, "Status name is required");
    }
    if (name.length > 30) {
      return sendError(res, 400, "Status name must be 30 characters or less");
    }

    const room = await requireRoom(roomId);
    const result = await query(
      `
        insert into statuses (room_id, name, sort_order)
        values ($1, $2, $3)
        returning id, room_id, name, sort_order, created_at
      `,
      [roomId, name, room.statuses.length],
    );

    return res.status(201).json(mapStatus(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/statuses/:statusId", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const statusResult = await query("select id, room_id from statuses where id = $1 limit 1", [req.params.statusId]);
    const status = statusResult.rows[0];
    if (!status) {
      return sendError(res, 404, "Status not found");
    }

    await requireOwnerRole(status.room_id, userToken);

    const name = normalizeText(req.body?.name);
    if (!name) {
      return sendError(res, 400, "Status name is required");
    }
    if (name.length > 30) {
      return sendError(res, 400, "Status name must be 30 characters or less");
    }

    const updated = await query(
      `
        update statuses
        set name = $2
        where id = $1
        returning id, room_id, name, sort_order, created_at
      `,
      [status.id, name],
    );

    return res.json(mapStatus(updated.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/statuses/:statusId", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const statusResult = await query("select id, room_id from statuses where id = $1 limit 1", [req.params.statusId]);
    const status = statusResult.rows[0];
    if (!status) {
      return sendError(res, 404, "Status not found");
    }

    await requireOwnerRole(status.room_id, userToken);

    const countResult = await query("select count(*)::int as count from statuses where room_id = $1", [status.room_id]);
    if (countResult.rows[0].count <= 1) {
      return sendError(res, 400, "A room must have at least one status");
    }

    const taskResult = await query("select 1 from tasks where status_id = $1 limit 1", [status.id]);
    if (taskResult.rows.length > 0) {
      return sendError(res, 409, "Cannot delete a status that still has tasks");
    }

    await query("delete from statuses where id = $1", [status.id]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/rooms/:roomId/tasks", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const roomId = req.params.roomId;
    await requireMemberRole(roomId, userToken);

    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const statusId = normalizeText(req.body?.statusId);
    const assignedToName = normalizeText(req.body?.assignedTo);

    if (!title) {
      return sendError(res, 400, "Task title is required");
    }
    if (title.length > 100) {
      return sendError(res, 400, "Task title must be 100 characters or less");
    }

    const statusResult = await query(
      "select id from statuses where id = $1 and room_id = $2 limit 1",
      [statusId, roomId],
    );
    const status = statusResult.rows[0];
    if (!status) {
      return sendError(res, 400, "Status does not belong to this room");
    }

    const assignedToToken = await resolveAssigneeToken(roomId, assignedToName);

    const result = await query(
      `
        insert into tasks (room_id, title, description, created_by, assigned_to, status_id)
        values ($1, $2, $3, $4, $5, $6)
        returning id
      `,
      [roomId, title, description || null, userToken, assignedToToken, statusId],
    );

    const taskId = result.rows[0].id;
    const taskResult = await query(
      `
        select
          t.id,
          t.room_id,
          t.title,
          t.description,
          t.created_by,
          creator.display_name as created_by_name,
          t.assigned_to,
          assignee.display_name as assigned_to_name,
          t.status_id,
          t.created_at,
          t.updated_at
        from tasks t
        join users creator on creator.token = t.created_by
        left join users assignee on assignee.token = t.assigned_to
        where t.id = $1
        limit 1
      `,
      [taskId],
    );

    return res.status(201).json(mapTask(taskResult.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const taskResult = await query(
      `
        select t.*, rm.role
        from tasks t
        left join room_members rm on rm.room_id = t.room_id and rm.user_token = $2
        where t.id = $1
        limit 1
      `,
      [req.params.taskId, userToken],
    );

    const task = taskResult.rows[0];
    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const canEdit = task.role === "owner" || (task.role === "member" && task.created_by === userToken);
    if (!canEdit) {
      return sendError(res, 403, "Permission denied");
    }

    const patch = {
      title: normalizeText(req.body?.title),
      description: normalizeText(req.body?.description),
      statusId: normalizeText(req.body?.statusId),
      assignedTo: normalizeText(req.body?.assignedTo),
    };

    if (patch.title && patch.title.length > 100) {
      return sendError(res, 400, "Task title must be 100 characters or less");
    }

    let nextStatusId = task.status_id;
    if (patch.statusId) {
      const statusResult = await query(
        "select id from statuses where id = $1 and room_id = $2 limit 1",
        [patch.statusId, task.room_id],
      );
      if (!statusResult.rows[0]) {
        return sendError(res, 400, "Status does not belong to this room");
      }
      nextStatusId = patch.statusId;
    }

    const nextAssignedTo = patch.assignedTo ? await resolveAssigneeToken(task.room_id, patch.assignedTo) : null;

    const updated = await query(
      `
        update tasks
        set
          title = coalesce(nullif($2, ''), title),
          description = coalesce(nullif($3, ''), description),
          status_id = $4,
          assigned_to = $5,
          updated_at = now()
        where id = $1
        returning id
      `,
      [task.id, patch.title, patch.description, nextStatusId, nextAssignedTo],
    );

    const response = await query(
      `
        select
          t.id,
          t.room_id,
          t.title,
          t.description,
          t.created_by,
          creator.display_name as created_by_name,
          t.assigned_to,
          assignee.display_name as assigned_to_name,
          t.status_id,
          t.created_at,
          t.updated_at
        from tasks t
        join users creator on creator.token = t.created_by
        left join users assignee on assignee.token = t.assigned_to
        where t.id = $1
        limit 1
      `,
      [updated.rows[0].id],
    );

    return res.json(mapTask(response.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    const taskResult = await query(
      `
        select t.*, rm.role
        from tasks t
        left join room_members rm on rm.room_id = t.room_id and rm.user_token = $2
        where t.id = $1
        limit 1
      `,
      [req.params.taskId, userToken],
    );

    const task = taskResult.rows[0];
    if (!task) {
      return sendError(res, 404, "Task not found");
    }

    const canDelete = task.role === "owner" || (task.role === "member" && task.created_by === userToken);
    if (!canDelete) {
      return sendError(res, 403, "Permission denied");
    }

    await query("delete from tasks where id = $1", [task.id]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", async (req, res, next) => {
  try {
    const userToken = requireUserToken(req);
    if (!userToken) {
      return sendError(res, 400, "Missing X-User-Token header");
    }

    const result = await query(
      "select token, display_name, created_at from users where token = $1 limit 1",
      [userToken],
    );

    const user = mapUser(result.rows[0]);
    if (!user) {
      return sendError(res, 404, "User not found");
    }

    return res.json(user);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.statusCode || 500;
  const message = error.message || "Internal server error";
  return res.status(status).json({ error: message });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
