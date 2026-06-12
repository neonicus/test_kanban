### addon_description.md

```markdown
# Full-Stack Kanban Web Application Specification

This specification document outlines the technical requirements, user interface views, database schema, and event structures required to build a responsive, production-ready Kanban application. 

---

## 🛠️ Tech Stack Architecture
* **Frontend**: Next.js (App Router) or React with Tailwind CSS
* **Database**: Neon DB (PostgreSQL) using Prisma or Drizzle ORM
* **Authentication**: Credentials-based (Email/Password) via standard JWT or Auth.js/NextAuth (**No OAuth**)
* **Drag-and-Drop Engine**: `@hello-pangea/dnd` or `dnd-kit`

---

## 📺 1. Page & UI Architecture (Views)

### Authentication Page
* **Sign Up / Login Forms**: Clean input elements for user email and password strings.
* **Security Constraints**: No social logins or third-party OAuth links.

### Workspace Dashboard
* **Board Grid**: Renders card blocks representing all projects created by the logged-in user.
* **Creation Modal**: Interactive popup containing a text form field for Title and a text area for Description.

### Kanban Board Main Page
* **Top Navigation Bar**: Renders active board titles, a text keyword search input, and button element dropdowns for filtering by priority level.
* **Board Canvas**: A horizontally scrollable container tracking distinct task list tracks.
* **Columns**: Vertical layout columns mapping workflow steps (e.g., "Backlog", "To Do", "In Progress", "Done"). Houses an "+ Add Task" button.
* **Task Cards**: Draggable blocks summarizing task item status. Renders the task title string, priority text label, and a due date string.

### Task Detail Modal
* **Overlay Layer**: Triggered by user clicks on individual cards.
* **Input Fields**: Houses an editable title string, a markdown-compatible description field, checkbox list rows for sub-tasks, and a data-table layout logs for historical user comments.

---

## 🗄️ 2. Neon DB (PostgreSQL) Database Schema

The database model map is structured below utilizing Prisma ORM notation:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL") // Connection string pointing directly to Neon DB
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
  boards       Board[]
}

model Board {
  id          String   @id @default(uuid())
  title       String
  description String?
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  columns     Column[]
  createdAt   DateTime @default(now())
}

model Column {
  id         String   @id @default(uuid())
  boardId    String
  board      Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title      String
  orderIndex Int
  tasks      Task[]
}

model Task {
  id          String    @id @default(uuid())
  columnId    String
  column      Column    @relation(fields: [columnId], references: [id], onDelete: Cascade)
  title       String
  description String?   @db.Text
  priority    String    @default("Medium") // Valid choices: Low, Medium, High
  dueDate     DateTime?
  orderIndex  Int
  subtasks    Json?     // Layout array structure: { id: uuid, title: string, isCompleted: boolean }
  comments    Comment[]
  createdAt   DateTime  @default(now())
}

model Comment {
  id        String   @id @default(uuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  text      String
  createdAt DateTime @default(now())
}
```

---

## 🔄 3. Application State & Interaction Events

### Drag-and-Drop Event Rules
* **onDragStart**: Extracts the specific dragging task item database ID string and its source column identifier.
* **onDrop**: 
  1. Computes the landing array layout position index and target destination column container.
  2. **Optimistic UI Update**: Triggers a fast UI layout refresh locally in the state engine before the backend promise resolves.
  3. **Database Sync Request**: Fires a background network payload dispatch (`PATCH /api/tasks/reorder`) to rewrite target rows inside the Neon PostgreSQL instance.

### System CRUD & Mutation Operations
* **onCardCreate**: Injects a fresh task record row matching the column container index context and increments the relative tracking index.
* **onFilterChange**: Evaluates state conditions locally in the client browser to selectively display matching text titles or priority filters without executing extra database query dispatches.

---

## 🔒 4. Technical Security Rules
* Always apply secure cryptographic hash algorithms like `bcrypt` or `argon2` on password string inputs before saving records down into the Neon DB user data tables.
* Ensure all api route controller logic evaluates permission records to confirm that the request sender matches the destination board context owner identifier row value before processing edits.
```
