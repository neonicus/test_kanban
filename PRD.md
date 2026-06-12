# spec.md

# Collaborative Kanban Board (Mockup Project Spec)

## 1. Project Overview

### Goal

สร้างระบบ **Collaborative Kanban Board** สำหรับทำงานร่วมกันแบบ Real-time โดยผู้ใช้สามารถสร้างห้อง (Room) เพื่อบริหารงานผ่าน Kanban Board, สร้าง Task, จัดสถานะงาน และ Assign งานให้สมาชิกในห้องได้

ระบบนี้เป็น **Mockup Project / MVP Prototype** เพื่อทดลองแนวคิดการทำงานร่วมกัน (Collaboration) โดยไม่ใช้ระบบ Authentication แบบเต็มรูปแบบ

---

## 2. Tech Stack

### Frontend

* HTML
* CSS
* Vanilla JavaScript

### Database / Backend

* NeonDB / PostgreSQL
* Backend API (Node.js)

### Session Storage

ใช้ NeonDB เก็บ session ของผู้ใช้และ room ที่กำลัง active อยู่ผ่าน backend

---

## 3. Authentication Strategy (Lightweight Identity)

### Objective

ไม่ใช้ระบบ Login / Register

### Flow

ผู้ใช้จะต้องกรอกชื่อก่อนเข้าใช้งานระบบ

เมื่อ submit:

1. ระบบสร้าง `userToken`
2. เก็บลง `NeonDB`
3. ใช้ token นี้เป็น identity ในการทำงาน

### Example

```ts
session = {
  sessionToken: "uuid",
  userToken: "uuid",
  currentRoomId: "uuid | null"
}
```

### User Model

```ts
User {
    token: string
    displayName: string
    avatarColor: string   // NEW: random color for avatar initials
}
```

### Rules

* หากไม่มี token → redirect ไปหน้า Landing เพื่อกรอกชื่อ
* Token มีอายุจนกว่าจะ logout หรือ session ถูกลบ
* รองรับ sync ข้อมูลผ่าน backend ได้จากหลายอุปกรณ์ถ้าใช้ account เดียวกัน

---

## 4. Main Features

### 4.1 Room Management

ผู้ใช้สามารถ:

* สร้างห้อง Kanban
* เข้าร่วมห้อง Kanban
* ดูรายการห้องทั้งหมด
* แชร์ Room ID เพื่อให้คนอื่นเข้าร่วม

---

### 4.2 Kanban Collaboration

ภายในห้องสามารถ:

* สร้าง Task
* แก้ไข Task
* ลบ Task
* Assign งาน
* สร้างสถานะงาน
* Drag & Drop task ระหว่างสถานะ
* **[NEW]** กำหนด Priority ของ Task (Low / Medium / High / Urgent)
* **[NEW]** กำหนด Due Date ของ Task
* **[NEW]** กำหนด Label / Tag บน Task
* **[NEW]** สร้าง Subtask ภายใน Task
* **[NEW]** Comment บน Task
* **[NEW]** Mark task ว่า Blocked พร้อม reason
* **[NEW]** Filter tasks ตาม assignee, priority, label, due date
* **[NEW]** Sort tasks ภายใน column ตาม priority, due date, created date

---

### 4.3 WIP Limits (NEW)

Owner สามารถกำหนด Work-in-Progress (WIP) limit ต่อ column ได้

Behavior:

* แสดงจำนวน task / limit ที่มุมบน-ขวาของแต่ละ column  
  Example: `3 / 5`
* เมื่อ task เกิน limit → column header เปลี่ยนสี (warning state)
* ไม่ block การเพิ่ม task (visual warning only สำหรับ MVP)

Schema เพิ่มในตาราง `statuses`:

```ts
wipLimit: number | null   // null = no limit
```

---

### 4.4 Permission Control

#### Visitor

ผู้เข้าร่วมห้องที่ยังไม่ได้รับสิทธิ

สามารถ:

* ดู board ได้
* ดู task ได้
* ดู comment ได้

ไม่สามารถ:

* สร้าง task
* แก้ไข task
* ลบ task
* drag & drop
* assign task
* comment

---

#### Member

ผู้ที่เจ้าของห้อง assign สิทธิ

สามารถ:

* สร้าง task
* แก้ไข task ของตนเอง
* ลบ task ของตนเอง
* assign task ให้ตัวเอง
* drag & drop task
* **[NEW]** comment บน task ใดก็ได้
* **[NEW]** สร้าง subtask ใน task ของตนเอง
* **[NEW]** mark task ของตนเองว่า Blocked

ไม่สามารถ:

* ลบ task ของคนอื่น
* จัดการสมาชิก
* ลบ room
* กำหนด WIP limit

---

#### Owner

เจ้าของห้อง

สามารถ:

* ทุกอย่างในระบบ
* assign member permission
* remove member permission
* ลบ task ของทุกคน
* จัดการสถานะงาน
* **[NEW]** กำหนด WIP limit ต่อ column
* **[NEW]** ลบ comment ของใครก็ได้
* แก้ไข room
* ลบ room

---

## 5. Pages

---

## 5.1 Landing Page

### Purpose

หน้าต้อนรับและจัดการห้อง Kanban

### Components

#### Header

* Logo / App Name
* Current Username (with avatar initials + color)

#### User Identity Modal

หากยังไม่มี token

แสดง popup:

* Input name
* Button: Enter

Validation:

* Required
* Max length 30

---

### Room List Section

แสดงรายการห้องทั้งหมด

Card Information:

* Room Name
* Description
* Owner Name
* Member Count
* **[NEW]** Task Count (total active tasks)
* Created Date
* Join Button

---

### Create Room Modal

Fields:

```ts
Room Name *
Description
```

Buttons:

* Create
* Cancel

---

### Join Room

สามารถ:

* กด Join จากรายการ
  หรือ
* ใส่ Room ID เพื่อ join

---

### Landing Page Actions

User สามารถ:

* Create Room
* Join Room
* Enter Room

---

## 5.2 Kanban Page

### Purpose

ใช้จัดการงานภายในห้อง

---

### Layout

```text
----------------------------------------------------
Room Header
----------------------------------------------------
Toolbar (Filter / Sort / Search)       [NEW]
----------------------------------------------------
Sidebar | Kanban Board
----------------------------------------------------
```

---

### Header

ข้อมูล:

* Room Name
* Owner Name
* Share Room ID
* Leave Room button

Owner Only:

* Manage Members
* Manage Status (incl. WIP Limits)

---

### Toolbar (NEW)

แสดง controls สำหรับ filter และ sort board

Elements:

```text
[ Search tasks... ]  [ Assignee ▾ ]  [ Priority ▾ ]  [ Label ▾ ]  [ Due Date ▾ ]  [ Sort: Default ▾ ]  [ Clear Filters ]
```

Behavior:

* Filter แบบ real-time บน client
* ถ้า filter active → highlight ปุ่ม filter นั้น
* Sort options: Default, Priority (High→Low), Due Date (Earliest), Created (Newest)

---

### Sidebar

#### Members List

แสดงสมาชิกทั้งหมด

Status:

* Owner
* Member
* Visitor

**[NEW]** แสดง avatar initials + color ของแต่ละคน

**[NEW]** แสดง online indicator (polling-based)

Owner Action:

* Grant Permission
* Remove Permission

---

### Kanban Board

Board จะแบ่งตาม Status Column

Example:

```text
Todo | In Progress | Review | Done
```

**[NEW]** แต่ละ column แสดง:

```text
[ Column Name ]   3 / 5   [+]
```

* จำนวน task / WIP limit
* ปุ่ม [+] เพิ่ม task ใน column นั้นได้เลย (quick add)

**[NEW]** Column ที่เกิน WIP limit → header highlight สีแดง/ส้ม

---

### Status Management

Owner สามารถ:

* เพิ่มสถานะ
* แก้ไขชื่อสถานะ
* **[NEW]** กำหนด WIP limit ต่อสถานะ
* **[NEW]** เรียงลำดับสถานะ (drag column header)
* ลบสถานะ

Constraint:

* ต้องมีอย่างน้อย 1 status
* ลบไม่ได้หากมี task อยู่

---

### Task Card

ข้อมูล:

```ts
Task {
    id: string
    title: string
    description: string
    priority: "low" | "medium" | "high" | "urgent"   // NEW
    labels: string[]                                   // NEW
    dueDate: date | null                               // NEW
    isBlocked: boolean                                 // NEW
    blockedReason: string | null                       // NEW
    createdBy: string
    assignedTo: string | null
    roomId: string
    statusId: string
    createdAt: timestamp
    updatedAt: timestamp
}
```

แสดงบน card:

* Title
* Priority badge (color-coded)  **[NEW]**
* Labels (colored tags)          **[NEW]**
* Due Date (แสดงสีแดงหาก overdue)  **[NEW]**
* Blocked indicator              **[NEW]**
* Assignee avatar
* Created By
* Updated Time
* Subtask progress: `2 / 5 ✓`   **[NEW]**
* Comment count                  **[NEW]**

---

### Task Detail Modal (NEW)

เปิด modal เต็มเมื่อคลิกที่ card

Sections:

```text
[ Title ]                    [ Priority ▾ ] [ Labels ▾ ]
[ Description (markdown) ]
[ Due Date ]  [ Assigned To ]
[ Blocked ]  [ Blocked Reason ]

--- Subtasks ---
☐ Subtask 1
☐ Subtask 2
[ + Add subtask ]

--- Comments ---
Avatar  Username  timestamp
        Comment text
[ Write a comment... ] [Post]
```

---

### Subtasks (NEW)

```ts
Subtask {
    id: string
    taskId: string
    title: string
    completed: boolean
    createdBy: string
    createdAt: timestamp
}
```

Permission:

* Member → สร้าง/จัดการ subtask ใน task ของตนเอง
* Owner → จัดการ subtask ทุก task

---

### Labels (NEW)

```ts
Label {
    id: string
    roomId: string
    name: string
    color: string   // hex color
}
```

* Owner สร้าง Label ระดับ room
* Member เลือก label บน task ได้
* แสดงบน card เป็น colored badge

---

### Comments (NEW)

```ts
Comment {
    id: string
    taskId: string
    userToken: string
    displayName: string
    content: string
    createdAt: timestamp
}
```

Permission:

* Visitor → read only
* Member → สร้าง comment
* Owner → ลบ comment ได้ทุก comment

---

### Create Task

Fields:

```ts
Title *
Description
Priority (default: medium)    // NEW
Labels                        // NEW
Due Date                      // NEW
Assign To
Status
```

Validation:

* Title required
* Max 100 chars

---

### Edit Task

Permission:

Owner:

* edit all task

Member:

* edit own task only

Visitor:

* no permission

---

### Delete Task

Permission:

Owner:

* delete all task

Member:

* delete own task only

Visitor:

* denied

---

### Assign Task

Rules:

Member:

* assign task ให้ตัวเองได้

Owner:

* assign ให้ใครก็ได้

Visitor:

* denied

---

### Drag & Drop

Feature:

* drag task ข้าม status

Permission:

* Owner → allowed
* Member → allowed
* Visitor → denied

Behavior:

* update `statusId`
* sync realtime ผ่าน backend polling หรือ realtime channel
* **[NEW]** ถ้า target column เกิน WIP limit → แสดง warning toast แต่ยังย้ายได้

---

## 6. Data Structure (NeonDB / PostgreSQL)

### Collection: users

```ts
{
    token: string,
    displayName: string,
    avatarColor: string    // NEW
}
```

---

### Collection: sessions

```ts
{
    sessionToken: string,
    userToken: string,
    currentRoomId: string | null,
    createdAt: timestamp,
    updatedAt: timestamp
}
```

---

### Collection: rooms

```ts
{
    id: string,
    name: string,
    description: string,
    ownerToken: string,
    createdAt: timestamp
}
```

---

### Collection: roomMembers

```ts
{
    roomId: string,
    userToken: string,
    role: "owner" | "member" | "visitor",
    joinedAt: timestamp
}
```

---

### Collection: statuses

```ts
{
    id: string,
    roomId: string,
    name: string,
    order: number,
    wipLimit: number | null    // NEW
}
```

---

### Collection: labels (NEW)

```ts
{
    id: string,
    roomId: string,
    name: string,
    color: string
}
```

---

### Collection: tasks

```ts
{
    id: string,
    roomId: string,
    title: string,
    description: string,
    priority: "low" | "medium" | "high" | "urgent",    // NEW
    dueDate: date | null,                               // NEW
    isBlocked: boolean,                                 // NEW
    blockedReason: string | null,                       // NEW
    createdBy: string,
    assignedTo: string | null,
    statusId: string,
    createdAt: timestamp,
    updatedAt: timestamp
}
```

---

### Collection: taskLabels (NEW)

```ts
{
    taskId: string,
    labelId: string
}
```

---

### Collection: subtasks (NEW)

```ts
{
    id: string,
    taskId: string,
    title: string,
    completed: boolean,
    createdBy: string,
    createdAt: timestamp
}
```

---

### Collection: comments (NEW)

```ts
{
    id: string,
    taskId: string,
    userToken: string,
    displayName: string,
    content: string,
    createdAt: timestamp
}
```

---

## 7. Realtime Behavior

ใช้ polling จาก backend เป็น MVP และสามารถอัปเกรดเป็น WebSocket / SSE ภายหลัง

### Required Realtime

* Room list update realtime
* Member permission update realtime
* Task update realtime
* Status update realtime
* Drag and drop sync realtime
* **[NEW]** Comment update realtime (polling)
* **[NEW]** Subtask update realtime (polling)
* **[NEW]** WIP count update realtime (polling)

---

## 8. UI/UX Requirements

### Responsive

รองรับ:

* Desktop
* Tablet

(Mobile support optional)

---

### Interaction

ใช้:

* Modal
* Toast Notification
* Confirm Delete Dialog
* Loading State
* **[NEW]** Priority color badge (Low=blue, Medium=yellow, High=orange, Urgent=red)
* **[NEW]** Due date overdue highlight (red text + icon)
* **[NEW]** Blocked task visual indicator (striped overlay หรือ warning icon บน card)
* **[NEW]** WIP exceeded column highlight (column header = red/orange)
* **[NEW]** Empty state message ต่อ column เมื่อไม่มี task

---

### Example Notifications

```text
Task created successfully
Permission denied
Status updated
Member assigned
Task blocked: [reason]          // NEW
WIP limit exceeded for [column] // NEW
Due date is overdue             // NEW
Comment added                   // NEW
```

---

## 9. Validation Rules

### Room

* name required
* max 50 chars

### Task

* title required
* max 100 chars
* **[NEW]** dueDate ต้องไม่เป็นอดีต (warn only, ไม่ block)
* **[NEW]** priority required (default: medium)

### Username

* required
* max 30 chars

### Status

* unique within room

### WIP Limit (NEW)

* integer > 0
* null = unlimited

### Label (NEW)

* name required
* max 20 chars
* unique within room

### Comment (NEW)

* content required
* max 500 chars

### Subtask (NEW)

* title required
* max 100 chars

---

## 10. Edge Cases

### Case: Owner Leave Room

Owner cannot leave room

ต้อง:

* transfer ownership ก่อน

---

### Case: Delete Status

ห้ามลบหากมี task ค้างอยู่

---

### Case: Deleted Assigned User

assignedTo = null

---

### Case: Unauthorized Edit

show:

```text
Permission denied
```

---

### Case: Task overdue (NEW)

* แสดง due date สีแดงบน card
* ไม่ block การใช้งาน

---

### Case: WIP limit exceeded (NEW)

* แสดง warning toast เมื่อ drag task เข้า column ที่เต็ม
* ยังสามารถย้ายได้ (soft limit)
* column header เปลี่ยนสี

---

### Case: Delete label that is in use (NEW)

* ลบ label ออกจากทุก task ที่ใช้อยู่อัตโนมัติ

---

### Case: Blocked task drag (NEW)

* ยังสามารถ drag ได้
* แสดง warning ว่า task นี้ถูก blocked

---

## 11. Backend Security Concept (Mockup)

**Note:** MVP Version

Security concept แบบง่าย:

* allow read ผ่าน API
* validate write permission ด้วย backend logic

Production version:

* ต้องย้าย logic ไป backend authorization / database rules

---

## 12. Future Enhancements

* Authentication (Google Login)
* Activity Timeline / Audit Log
* File Attachment
* Notification / Email alert
* Dark Mode
* Board Template
* Invite Link
* Cycle Time / Lead Time Analytics
* Cumulative Flow Diagram
* Probabilistic deadline forecasting
* Recurring Tasks
* Task dependency (blocks / blocked by)

---

## 13. Success Criteria

ระบบต้องสามารถ:

✅ สร้างห้องได้

✅ เข้าร่วมห้องได้

✅ ดู board แบบ realtime ได้

✅ assign member ได้

✅ สร้าง/แก้ไข/ลบ task ตาม permission

✅ drag & drop task ได้

✅ สร้างสถานะได้

✅ sync ข้อมูล realtime ผ่าน backend ได้

✅ กำหนด Priority, Due Date, Labels บน task ได้   **[NEW]**

✅ สร้าง subtask ได้                               **[NEW]**

✅ comment บน task ได้                             **[NEW]**

✅ กำหนด WIP limit ต่อ column ได้                  **[NEW]**

✅ filter / sort tasks บน board ได้                **[NEW]**

✅ mark task ว่า Blocked ได้                       **[NEW]**
