import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

app.use(express.json());

// Persistent store setup
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'vote_store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store = {
  profiles: {},
  votes: [],
  counts: {}
};

try {
  if (fs.existsSync(STORE_FILE)) {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    store = JSON.parse(raw);
  }
} catch (e) {
  console.error('Error loading store:', e);
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Error saving store:', e);
  }
}

// API Routes
app.post('/api/profile', (req, res) => {
  const { uid, name, email, gender, age, provider, photoURL } = req.body || {};
  if (!uid) {
    return res.status(400).json({ error: 'UID is required' });
  }

  store.profiles[uid] = {
    uid,
    name: (name || 'Anonymous').trim(),
    email: (email || '').trim(),
    gender: gender || 'Unspecified',
    age: age ? Number(age) : null,
    provider: provider || 'unknown',
    photoURL: photoURL || '',
    updatedAt: Date.now()
  };

  saveStore();
  res.json({ success: true, profile: store.profiles[uid] });
});

app.get('/api/profile/:uid', (req, res) => {
  const profile = store.profiles[req.params.uid];
  if (profile) {
    res.json({ success: true, profile });
  } else {
    res.status(404).json({ error: 'Profile not found' });
  }
});

app.post('/api/vote', (req, res) => {
  const {
    uid,
    userName,
    userEmail,
    gender,
    age,
    topicId,
    topicTitle,
    optionIndex,
    optionLabel
  } = req.body || {};

  if (!topicId || optionIndex === undefined) {
    return res.status(400).json({ error: 'topicId and optionIndex are required' });
  }

  const voteEntry = {
    id: 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    uid: uid || 'anonymous',
    userName: userName || store.profiles[uid]?.name || 'Anonymous Voter',
    userEmail: userEmail || store.profiles[uid]?.email || '',
    gender: gender || store.profiles[uid]?.gender || 'Unspecified',
    age: age || store.profiles[uid]?.age || null,
    topicId,
    topicTitle: topicTitle || topicId,
    optionIndex: Number(optionIndex),
    optionLabel: optionLabel || `Option ${optionIndex}`,
    timestamp: Date.now(),
    dateFormatted: new Date().toLocaleString()
  };

  // Record log
  store.votes.push(voteEntry);

  // Update counts
  if (!store.counts[topicId]) {
    store.counts[topicId] = {};
  }
  store.counts[topicId][optionIndex] = (store.counts[topicId][optionIndex] || 0) + 1;

  saveStore();
  res.json({ success: true, vote: voteEntry, counts: store.counts[topicId] });
});

app.get('/api/voter-data', (req, res) => {
  const totalVotes = store.votes.length;
  const uniqueVoterUids = new Set(store.votes.map(v => v.uid).filter(u => u && u !== 'anonymous'));
  const registeredProfilesCount = Object.keys(store.profiles).length;

  // Gender breakdown
  const genderBreakdown = {};
  store.votes.forEach(v => {
    const g = v.gender || 'Unspecified';
    genderBreakdown[g] = (genderBreakdown[g] || 0) + 1;
  });

  res.json({
    totalVotes,
    uniqueVotersCount: uniqueVoterUids.size || registeredProfilesCount,
    registeredProfilesCount,
    genderBreakdown,
    counts: store.counts,
    recentVotes: store.votes.slice(-100).reverse(), // Last 100 votes
    profiles: Object.values(store.profiles)
  });
});

app.get('/api/export-csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="global_vote_data.csv"');

  const headers = ['Vote ID', 'Date & Time', 'Voter Name', 'Email', 'Gender', 'Age', 'Topic Title', 'Chosen Option', 'Topic ID', 'Option Index', 'User UID'];
  const rows = store.votes.map(v => [
    `"${v.id}"`,
    `"${new Date(v.timestamp).toISOString()}"`,
    `"${(v.userName || '').replace(/"/g, '""')}"`,
    `"${(v.userEmail || '').replace(/"/g, '""')}"`,
    `"${v.gender || ''}"`,
    `"${v.age || ''}"`,
    `"${(v.topicTitle || '').replace(/"/g, '""')}"`,
    `"${(v.optionLabel || '').replace(/"/g, '""')}"`,
    `"${v.topicId}"`,
    `"${v.optionIndex}"`,
    `"${v.uid}"`
  ]);

  const csvLines = [headers.join(','), ...rows.map(r => r.join(','))];
  const csvContent = csvLines.join('\n') + '\n';
  res.send(csvContent);
});

// Handle explicit routes for vote and auth pages
app.get(['/vote.html', '/vote', '/vote_realtime.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'vote_realtime.html'));
});

app.get(['/auth.html', '/auth', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static assets
app.use(express.static(__dirname));

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
