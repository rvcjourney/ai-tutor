require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

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
app.listen(PORT, () => {
  console.log(`Rule-based learning chatbot backend listening on port ${PORT}`);
});
