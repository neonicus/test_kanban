import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
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

function mapUser(row) {
  return row
    ? {
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

function mapSession(row) {
  return row
    ? {
        sessionToken: row.session_token,
        userId: row.user_id,
        currentBoardId: row.current_board_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

function mapBoard(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    columnCount: Number(row.column_count ?? 0),
    taskCount: Number(row.task_count ?? 0),
  };
}

function mapColumn(row) {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTask(row) {
  return {
    id: row.id,
    columnId: row.column_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.due_date,
    orderIndex: row.order_index,
    subtasks: row.subtasks ?? [],
    createdBy: row.created_by_name,
    createdById: row.created_by,
    updatedById: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commentCount: Number(row.comment_count ?? 0),
  };
}

function mapComment(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    userName: row.user_name,
    text: row.text,
    createdAt: row.created_at,
  };
}

async function getSession(req) {
  const cookies = parseCookies(req.header("cookie") || "");
  const sessionToken = normalizeText(cookies.kanban_session);
  if (!sessionToken) {
    return null;
  }

  const result = await query(
    `
      select
        s.session_token,
        s.user_id,
        s.current_board_id,
        s.created_at,
        s.updated_at,
        u.email,
        u.name,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at
      from sessions s
      join users u on u.id = s.user_id
      where s.session_token = $1
      limit 1
    `,
    [sessionToken],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    session: mapSession(row),
    user: mapUser({
      id: row.user_id,
      email: row.email,
      name: row.name,
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    }),
  };
}

async function requireSession(req) {
  const session = await getSession(req);
  if (!session) {
    throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
  }
  return session;
}

async function getBoardOwner(boardId) {
  const result = await query("select owner_id from boards where id = $1 limit 1", [boardId]);
  return result.rows[0]?.owner_id ?? null;
}

async function requireBoardOwner(boardId, userId) {
  const ownerId = await getBoardOwner(boardId);
  if (!ownerId) {
    throw Object.assign(new Error("Board not found"), { statusCode: 404 });
  }
  if (ownerId !== userId) {
    throw Object.assign(new Error("Permission denied"), { statusCode: 403 });
  }
}

async function getBoardDetail(boardId) {
  const boardResult = await query(
    `
      select
        b.id,
        b.title,
        b.description,
        b.owner_id,
        b.created_at,
        b.updated_at,
        count(distinct c.id)::int as column_count,
        count(distinct t.id)::int as task_count
      from boards b
      left join columns c on c.board_id = b.id
      left join tasks t on t.column_id = c.id
      where b.id = $1
      group by b.id
    `,
    [boardId],
  );

  const boardRow = boardResult.rows[0];
  if (!boardRow) {
    return null;
  }

  const [columnResult, taskResult] = await Promise.all([
    query(
      `
        select id, board_id, title, order_index, created_at, updated_at
        from columns
        where board_id = $1
        order by order_index asc, created_at asc
      `,
      [boardId],
    ),
    query(
      `
        select
          t.id,
          t.column_id,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.order_index,
          t.subtasks,
          t.created_by,
          creator.name as created_by_name,
          t.updated_by,
          t.created_at,
          t.updated_at,
          (
            select count(*)::int
            from comments c
            where c.task_id = t.id
          ) as comment_count
        from tasks t
        join users creator on creator.id = t.created_by
        where t.column_id in (select id from columns where board_id = $1)
        order by t.order_index asc, t.created_at asc
      `,
      [boardId],
    ),
  ]);

  const tasksByColumn = new Map();
  for (const taskRow of taskResult.rows) {
    const task = mapTask(taskRow);
    if (!tasksByColumn.has(task.columnId)) {
      tasksByColumn.set(task.columnId, []);
    }
    tasksByColumn.get(task.columnId).push(task);
  }

  return {
    ...mapBoard(boardRow),
    columns: columnResult.rows.map((row) => ({
      ...mapColumn(row),
      tasks: tasksByColumn.get(row.id) ?? [],
    })),
  };
}

async function requireBoardDetail(boardId) {
  const board = await getBoardDetail(boardId);
  if (!board) {
    throw Object.assign(new Error("Board not found"), { statusCode: 404 });
  }
  return board;
}

async function updateSessionBoard(sessionToken, currentBoardId) {
  await query(
    `
      update sessions
      set current_board_id = $2,
          updated_at = now()
      where session_token = $1
    `,
    [sessionToken, currentBoardId],
  );
}

async function createDefaultColumns(client, boardId) {
  const defaultColumns = ["Backlog", "To Do", "In Progress", "Done"];
  for (let index = 0; index < defaultColumns.length; index += 1) {
    await client.query(
      `
        insert into columns (board_id, title, order_index)
        values ($1, $2, $3)
      `,
      [boardId, defaultColumns[index], index],
    );
  }
}

function normalizeSubtasks(subtasks) {
  if (!Array.isArray(subtasks)) {
    return [];
  }

  return subtasks
    .map((item) => ({
      id: normalizeText(item.id) || randomUUID(),
      title: normalizeText(item.title),
      isCompleted: Boolean(item.isCompleted),
    }))
    .filter((item) => item.title);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    const email = normalizeText(req.body?.email).toLowerCase();
    const password = normalizeText(req.body?.password);
    const name = normalizeText(req.body?.name);

    if (!email || !password || !name) {
      return sendError(res, 400, "Email, password, and name are required");
    }

    if (name.length > 60) {
      return sendError(res, 400, "Name must be 60 characters or less");
    }

    const existing = await query("select id from users where lower(email) = lower($1) limit 1", [email]);
    if (existing.rows[0]) {
      return sendError(res, 409, "Email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await query(
      `
        insert into users (email, password_hash, name)
        values ($1, $2, $3)
        returning id, email, name, created_at, updated_at
      `,
      [email, passwordHash, name],
    );
    const user = mapUser(userResult.rows[0]);
    const sessionResult = await query(
      `
        insert into sessions (user_id)
        values ($1)
        returning session_token
      `,
      [user.id],
    );
    setSessionCookie(res, sessionResult.rows[0].session_token);
    return res.status(201).json(user);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = normalizeText(req.body?.email).toLowerCase();
    const password = normalizeText(req.body?.password);

    if (!email || !password) {
      return sendError(res, 400, "Email and password are required");
    }

    const result = await query(
      `
        select id, email, password_hash, name, created_at, updated_at
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [email],
    );

    const userRow = result.rows[0];
    if (!userRow) {
      return sendError(res, 401, "Invalid email or password");
    }

    const ok = await bcrypt.compare(password, userRow.password_hash);
    if (!ok) {
      return sendError(res, 401, "Invalid email or password");
    }

    const cookies = parseCookies(req.header("cookie") || "");
    const existingSessionToken = normalizeText(cookies.kanban_session);

    if (existingSessionToken) {
      const sessionResult = await query(
        `
          update sessions
          set user_id = $2,
              updated_at = now()
          where session_token = $1
          returning session_token
        `,
        [existingSessionToken, userRow.id],
      );
      if (sessionResult.rows[0]) {
        setSessionCookie(res, sessionResult.rows[0].session_token);
      } else {
        const createSession = await query(
          `insert into sessions (user_id) values ($1) returning session_token`,
          [userRow.id],
        );
        setSessionCookie(res, createSession.rows[0].session_token);
      }
    } else {
      const sessionResult = await query(
        `insert into sessions (user_id) values ($1) returning session_token`,
        [userRow.id],
      );
      setSessionCookie(res, sessionResult.rows[0].session_token);
    }

    return res.json(
      mapUser({
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        created_at: userRow.created_at,
        updated_at: userRow.updated_at,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const session = await getSession(req);
    if (session) {
      await query("delete from sessions where session_token = $1", [session.session.sessionToken]);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    const session = await getSession(req);
    return res.json(session);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    return res.json(session.user);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/me", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const name = normalizeText(req.body?.name);

    if (!name) {
      return sendError(res, 400, "Name is required");
    }
    if (name.length > 60) {
      return sendError(res, 400, "Name must be 60 characters or less");
    }

    const result = await query(
      `
        update users
        set name = $2,
            updated_at = now()
        where id = $1
        returning id, email, name, created_at, updated_at
      `,
      [session.user.id, name],
    );

    return res.json(
      mapUser({
        id: result.rows[0].id,
        email: result.rows[0].email,
        name: result.rows[0].name,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at,
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.patch("/api/session", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const boardId = normalizeText(req.body?.currentBoardId) || null;

    if (boardId) {
      const boardCheck = await query("select id from boards where id = $1 and owner_id = $2 limit 1", [
        boardId,
        session.user.id,
      ]);
      if (!boardCheck.rows[0]) {
        return sendError(res, 404, "Board not found");
      }
    }

    await updateSessionBoard(session.session.sessionToken, boardId);
    return res.json({ ok: true, currentBoardId: boardId });
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const result = await query(
      `
        select
          b.id,
          b.title,
          b.description,
          b.owner_id,
          b.created_at,
          b.updated_at,
          count(distinct c.id)::int as column_count,
          count(distinct t.id)::int as task_count
        from boards b
        left join columns c on c.board_id = b.id
        left join tasks t on t.column_id = c.id
        where b.owner_id = $1
        group by b.id
        order by b.updated_at desc
      `,
      [session.user.id],
    );
    return res.json(result.rows.map(mapBoard));
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);

    if (!title) {
      return sendError(res, 400, "Board title is required");
    }
    if (title.length > 120) {
      return sendError(res, 400, "Board title must be 120 characters or less");
    }

    const boardId = await withTransaction(async (client) => {
      const boardResult = await client.query(
        `
          insert into boards (title, description, owner_id)
          values ($1, $2, $3)
          returning id
        `,
        [title, description || null, session.user.id],
      );
      const id = boardResult.rows[0].id;
      await createDefaultColumns(client, id);
      return id;
    });

    const board = await requireBoardDetail(boardId);
    await updateSessionBoard(session.session.sessionToken, boardId);
    return res.status(201).json(board);
  } catch (error) {
    next(error);
  }
});

app.get("/api/boards/:boardId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    await requireBoardOwner(req.params.boardId, session.user.id);
    const board = await requireBoardDetail(req.params.boardId);
    if (!board) {
      return sendError(res, 404, "Board not found");
    }
    return res.json(board);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/boards/:boardId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    await requireBoardOwner(req.params.boardId, session.user.id);
    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    if (!title) {
      return sendError(res, 400, "Board title is required");
    }

    const result = await query(
      `
        update boards
        set title = $2,
            description = $3,
            updated_at = now()
        where id = $1
        returning id, title, description, owner_id, created_at, updated_at
      `,
      [req.params.boardId, title, description || null],
    );
    const counts = await query(
      `
        select
          count(distinct c.id)::int as column_count,
          count(distinct t.id)::int as task_count
        from boards b
        left join columns c on c.board_id = b.id
        left join tasks t on t.column_id = c.id
        where b.id = $1
        group by b.id
      `,
      [req.params.boardId],
    );
    return res.json(mapBoard({ ...result.rows[0], ...counts.rows[0] }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/boards/:boardId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    await requireBoardOwner(req.params.boardId, session.user.id);
    await query("delete from boards where id = $1", [req.params.boardId]);
    await query("update sessions set current_board_id = null, updated_at = now() where session_token = $1", [
      session.session.sessionToken,
    ]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/boards/:boardId/columns", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    await requireBoardOwner(req.params.boardId, session.user.id);
    const title = normalizeText(req.body?.title);
    if (!title) {
      return sendError(res, 400, "Column title is required");
    }

    const board = await requireBoardDetail(req.params.boardId);
    const result = await query(
      `
        insert into columns (board_id, title, order_index)
        values ($1, $2, $3)
        returning id, board_id, title, order_index, created_at, updated_at
      `,
      [req.params.boardId, title, board.columns.length],
    );
    return res.status(201).json(mapColumn(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/columns/:columnId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const column = await query("select id, board_id from columns where id = $1 limit 1", [req.params.columnId]);
    const row = column.rows[0];
    if (!row) {
      return sendError(res, 404, "Column not found");
    }
    await requireBoardOwner(row.board_id, session.user.id);
    const title = normalizeText(req.body?.title);
    if (!title) {
      return sendError(res, 400, "Column title is required");
    }
    const result = await query(
      `
        update columns
        set title = $2,
            updated_at = now()
        where id = $1
        returning id, board_id, title, order_index, created_at, updated_at
      `,
      [row.id, title],
    );
    return res.json(mapColumn(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/columns/:columnId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const column = await query("select id, board_id from columns where id = $1 limit 1", [req.params.columnId]);
    const row = column.rows[0];
    if (!row) {
      return sendError(res, 404, "Column not found");
    }
    await requireBoardOwner(row.board_id, session.user.id);

    const countResult = await query("select count(*)::int as count from columns where board_id = $1", [row.board_id]);
    if (countResult.rows[0].count <= 1) {
      return sendError(res, 400, "A board must have at least one column");
    }

    const taskCount = await query("select 1 from tasks where column_id = $1 limit 1", [row.id]);
    if (taskCount.rows.length > 0) {
      return sendError(res, 409, "Cannot delete a column that still has tasks");
    }

    await query("delete from columns where id = $1", [row.id]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/columns/:columnId/tasks", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const column = await query("select id, board_id, order_index from columns where id = $1 limit 1", [req.params.columnId]);
    const columnRow = column.rows[0];
    if (!columnRow) {
      return sendError(res, 404, "Column not found");
    }
    await requireBoardOwner(columnRow.board_id, session.user.id);

    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const priority = normalizeText(req.body?.priority) || "Medium";
    const dueDate = normalizeText(req.body?.dueDate) || null;
    const subtasks = normalizeSubtasks(req.body?.subtasks);

    if (!title) {
      return sendError(res, 400, "Task title is required");
    }
    if (title.length > 120) {
      return sendError(res, 400, "Task title must be 120 characters or less");
    }

    const result = await query(
      `
        insert into tasks (column_id, title, description, priority, due_date, order_index, subtasks, created_by, updated_by)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $8)
        returning id
      `,
      [columnRow.id, title, description || null, priority, dueDate || null, 0, JSON.stringify(subtasks), session.user.id],
    );

    const task = await query(
      `
        select
          t.id,
          t.column_id,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.order_index,
          t.subtasks,
          t.created_by,
          creator.name as created_by_name,
          t.updated_by,
          t.created_at,
          t.updated_at,
          0 as comment_count
        from tasks t
        join users creator on creator.id = t.created_by
        where t.id = $1
      `,
      [result.rows[0].id],
    );

    return res.status(201).json(mapTask(task.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const taskResult = await query(
      `
        select
          t.id,
          t.column_id,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.order_index,
          t.subtasks,
          t.created_by,
          creator.name as created_by_name,
          t.updated_by,
          t.created_at,
          t.updated_at,
          (
            select count(*)::int from comments c where c.task_id = t.id
          ) as comment_count,
          c.board_id
        from tasks t
        join users creator on creator.id = t.created_by
        join columns c on c.id = t.column_id
        where t.id = $1
        limit 1
      `,
      [req.params.taskId],
    );

    const row = taskResult.rows[0];
    if (!row) {
      return sendError(res, 404, "Task not found");
    }

    await requireBoardOwner(row.board_id, session.user.id);

    const comments = await query(
      `
        select
          c.id,
          c.task_id,
          c.user_id,
          u.name as user_name,
          c.text,
          c.created_at
        from comments c
        join users u on u.id = c.user_id
        where c.task_id = $1
        order by c.created_at asc
      `,
      [req.params.taskId],
    );

    return res.json({
      ...mapTask(row),
      comments: comments.rows.map(mapComment),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const taskLookup = await query(
      `
        select t.id, c.board_id
        from tasks t
        join columns c on c.id = t.column_id
        where t.id = $1
        limit 1
      `,
      [req.params.taskId],
    );
    const taskRow = taskLookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }
    await requireBoardOwner(taskRow.board_id, session.user.id);

    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const priority = normalizeText(req.body?.priority);
    const dueDate = normalizeText(req.body?.dueDate) || null;
    const subtasks = req.body?.subtasks;

    if (title && title.length > 120) {
      return sendError(res, 400, "Task title must be 120 characters or less");
    }

    const result = await query(
      `
        update tasks
        set
          title = coalesce(nullif($2, ''), title),
          description = coalesce(nullif($3, ''), description),
          priority = coalesce(nullif($4, ''), priority),
          due_date = $5,
          subtasks = coalesce($6::jsonb, subtasks),
          updated_by = $7,
          updated_at = now()
        where id = $1
        returning id
      `,
      [
        req.params.taskId,
        title,
        description,
        priority,
        dueDate,
        subtasks ? JSON.stringify(normalizeSubtasks(subtasks)) : null,
        session.user.id,
      ],
    );

    const task = await query(
      `
        select
          t.id,
          t.column_id,
          t.title,
          t.description,
          t.priority,
          t.due_date,
          t.order_index,
          t.subtasks,
          t.created_by,
          creator.name as created_by_name,
          t.updated_by,
          t.created_at,
          t.updated_at,
          0 as comment_count
        from tasks t
        join users creator on creator.id = t.created_by
        where t.id = $1
      `,
      [result.rows[0].id],
    );

    return res.json(mapTask(task.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:taskId", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const taskLookup = await query(
      `
        select t.id, c.board_id
        from tasks t
        join columns c on c.id = t.column_id
        where t.id = $1
        limit 1
      `,
      [req.params.taskId],
    );
    const taskRow = taskLookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }
    await requireBoardOwner(taskRow.board_id, session.user.id);

    await query("delete from tasks where id = $1", [req.params.taskId]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks/:taskId/comments", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const taskLookup = await query(
      `
        select t.id, c.board_id
        from tasks t
        join columns c on c.id = t.column_id
        where t.id = $1
        limit 1
      `,
      [req.params.taskId],
    );
    const taskRow = taskLookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }
    await requireBoardOwner(taskRow.board_id, session.user.id);

    const text = normalizeText(req.body?.text);
    if (!text) {
      return sendError(res, 400, "Comment text is required");
    }

    const result = await query(
      `
        insert into comments (task_id, user_id, text)
        values ($1, $2, $3)
        returning id, task_id, user_id, text, created_at
      `,
      [req.params.taskId, session.user.id, text],
    );

    return res.status(201).json({
      ...mapComment({ ...result.rows[0], user_name: session.user.name }),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/reorder", async (req, res, next) => {
  try {
    const session = await requireSession(req);
    const taskId = normalizeText(req.body?.taskId);
    const columnId = normalizeText(req.body?.columnId);
    const orderIndex = Number(req.body?.orderIndex);

    if (!taskId || !columnId || Number.isNaN(orderIndex)) {
      return sendError(res, 400, "taskId, columnId, and orderIndex are required");
    }

    const lookup = await query(
      `
        select t.id, t.column_id, c.board_id
        from tasks t
        join columns c on c.id = t.column_id
        where t.id = $1
        limit 1
      `,
      [taskId],
    );
    const taskRow = lookup.rows[0];
    if (!taskRow) {
      return sendError(res, 404, "Task not found");
    }
    await requireBoardOwner(taskRow.board_id, session.user.id);

    const targetColumn = await query("select id, board_id from columns where id = $1 limit 1", [columnId]);
    if (!targetColumn.rows[0] || targetColumn.rows[0].board_id !== taskRow.board_id) {
      return sendError(res, 404, "Column not found");
    }

    const updatedTask = await withTransaction(async (client) => {
      await client.query(
        `
          update tasks
          set column_id = $2,
              order_index = $3,
              updated_by = $4,
              updated_at = now()
          where id = $1
        `,
        [taskId, columnId, orderIndex, session.user.id],
      );

      const normalizeOrder = async (targetId) => {
        const rows = await client.query(
          `
            select id
            from tasks
            where column_id = $1
            order by order_index asc, created_at asc
          `,
          [targetId],
        );

        for (let index = 0; index < rows.rows.length; index += 1) {
          await client.query(
            `update tasks set order_index = $2 where id = $1`,
            [rows.rows[index].id, index],
          );
        }
      };

      await normalizeOrder(taskRow.column_id);
      if (taskRow.column_id !== columnId) {
        await normalizeOrder(columnId);
      }

      const result = await client.query(
        `
          select
            t.id,
            t.column_id,
            t.title,
            t.description,
            t.priority,
            t.due_date,
            t.order_index,
            t.subtasks,
            t.created_by,
            creator.name as created_by_name,
            t.updated_by,
            t.created_at,
            t.updated_at,
            0 as comment_count
          from tasks t
          join users creator on creator.id = t.created_by
          where t.id = $1
        `,
        [taskId],
      );

      return result.rows[0];
    });

    return res.json(mapTask(updatedTask));
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
