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

---

### 4.3 Permission Control

#### Visitor

ผู้เข้าร่วมห้องที่ยังไม่ได้รับสิทธิ

สามารถ:

* ดู board ได้
* ดู task ได้

ไม่สามารถ:

* สร้าง task
* แก้ไข task
* ลบ task
* drag & drop
* assign task

---

#### Member

ผู้ที่เจ้าของห้อง assign สิทธิ

สามารถ:

* สร้าง task
* แก้ไข task ของตนเอง
* ลบ task ของตนเอง
* assign task ให้ตัวเอง
* drag & drop task

ไม่สามารถ:

* ลบ task ของคนอื่น
* จัดการสมาชิก
* ลบ room

---

#### Owner

เจ้าของห้อง

สามารถ:

* ทุกอย่างในระบบ
* assign member permission
* remove member permission
* ลบ task ของทุกคน
* จัดการสถานะงาน
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
* Current Username

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
* Manage Status

---

### Sidebar

#### Members List

แสดงสมาชิกทั้งหมด

Status:

* Owner
* Member
* Visitor

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

---

### Status Management

Owner สามารถ:

* เพิ่มสถานะ
* แก้ไขชื่อสถานะ
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
    createdBy: string
    assignedTo: string | null
    roomId: string
    statusId: string
    createdAt: timestamp
    updatedAt: timestamp
}
```

แสดง:

* Title
* Description Preview
* Assignee
* Created By
* Updated Time

---

### Create Task

Fields:

```ts
Title *
Description
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

---

## 6. Data Structure (NeonDB / PostgreSQL)

### Collection: users

```ts
users/
    token
```

Example:

```ts
{
    token: "uuid",
    displayName: "User"
}
```

---

### Collection: sessions

```ts
sessions/
    sessionId
```

Schema:

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
rooms/
    roomId
```

Schema:

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
roomMembers/
    memberId
```

Schema:

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
statuses/
    statusId
```

Schema:

```ts
{
    roomId: string,
    name: string,
    order: number
}
```

---

### Collection: tasks

```ts
tasks/
    taskId
```

Schema:

```ts
{
    roomId: string,
    title: string,
    description: string,
    createdBy: string,
    assignedTo: string | null,
    statusId: string,
    createdAt: timestamp,
    updatedAt: timestamp
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

---

### Example Notifications

```text
Task created successfully
Permission denied
Status updated
Member assigned
```

---

## 9. Validation Rules

### Room

* name required
* max 50 chars

### Task

* title required
* max 100 chars

### Username

* required
* max 30 chars

### Status

* unique within room

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
* Due Date
* Task Comment
* Activity Timeline
* File Attachment
* Notification
* Dark Mode
* Board Template
* Search / Filter
* Invite Link
* Audit Log

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
