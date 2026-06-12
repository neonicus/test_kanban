# Collaborative Kanban Board

Minimal vanilla JS Kanban app backed by Neon Postgres.

## Structure

- `index.html` - app shell
- `css/styles.css` - global styling
- `js/` - frontend modules for auth, rooms, tasks, statuses, realtime, and UI helpers
- `server/` - Express API connected to Neon
- `schema.sql` - database schema for Neon

## Run Locally

1. Copy `.env.example` to `.env`.
2. Put your Neon `DATABASE_URL` in `.env`.
3. Install dependencies:

```powershell
npm install
```

4. Create the database tables in Neon:

```powershell
npm run migrate
```

5. Start the app:

```powershell
npm run dev
```

6. Open `http://localhost:3001`.

## Notes

- User identity is stored by Neon-backed session cookie.
- Rooms, statuses, and tasks are stored in Neon.
- Realtime sync is handled with polling for the MVP.
