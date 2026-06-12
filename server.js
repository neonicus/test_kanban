const express = require('express');
const path = require('path');
const app = require('./api/index');

const PORT = process.env.PORT || 3000;

// Serve public static assets locally (Vercel does this automatically in production)
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Collaborative Kanban Board Server running on http://localhost:${PORT}`);
});
