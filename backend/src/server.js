require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const conversationLoader = require('./engine/conversationLoader');

const chatRoutes = require('./routes/chat');
const moduleRoutes = require('./routes/modules');
const progressRoutes = require('./routes/progress');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/chat', chatRoutes);
app.use('/modules', moduleRoutes);
app.use('/progress', progressRoutes);
app.use('/quiz', quizRoutes);
app.use('/admin', adminRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

// Both the schema and the conversation content now need a database round-trip
// (Postgres, not the old synchronous SQLite/file setup) — the server only starts
// accepting requests once both are ready, so a request can never land while the
// cache is still empty/unseeded.
async function start() {
  await db.ensureSchema();
  await conversationLoader.loadAll();
  app.listen(PORT, () => {
    console.log(`Rule-based learning chatbot backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
