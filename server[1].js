const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({limit: '10mb'}));
app.use(express.static('public'));

const DB_FILE = path.join(__dirname, '.data', 'db.json');

// Init DB
function loadDB() {
  try {
    if (!fs.existsSync(path.dirname(DB_FILE))) {
      fs.mkdirSync(path.dirname(DB_FILE), {recursive: true});
    }
    if (!fs.existsSync(DB_FILE)) return getDefaultDB();
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) { return getDefaultDB(); }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8');
}

function getDefaultDB() {
  return {
    users: {
      olya:    {pass: 'Sklad2024!', role: 'admin',  name: 'Оля',          branches: ['Склад','Пушкина 7','Омарова 12В','Бокейхана 25']},
      chef:    {pass: 'Boss2024!',  role: 'admin',  name: 'Шеф',          branches: ['Склад','Пушкина 7','Омарова 12В','Бокейхана 25']},
      pushkin: {pass: 'Push2024!',  role: 'senior', name: 'Пушкина 7',    branches: ['Пушкина 7']},
      omarova: {pass: 'Omar2024!',  role: 'senior', name: 'Омарова 12В',  branches: ['Омарова 12В']},
      bokey:   {pass: 'Bokey2024!', role: 'senior', name: 'Бокейхана 25', branches: ['Бокейхана 25']},
    },
    employees: {
      'Склад': ["Анна","Валерия","Марина","Алена М","Алена К","Евгений Ф","Евгений П","Сабила","Алексей","Александр","Анастасия","Анара","Арина","Роман","Айнура","Людмила","Артур","Наталья","Роман 2","Михаил"],
      'Пушкина 7': ["Ольга","Виолетта","Алексей","Бикен","Арина","Дарья","Анатолий","Ксения","София"],
      'Омарова 12В': ["Стефания","Лейла","Александра","Лидия","Сергей"],
      'Бокейхана 25': ["Валентина","Лидия","Ксения","Людмила","Кристина","Алексей","Аружан","Данияр","Камила","Карина","Лиана","Максим","Настя","Никита","Ольга","Ольга А","София"],
    },
    entries: {},   // {branch: [...entries]}
    profiles: {},  // {branch: {emp: {...}}}
  };
}

// Simple session store (in-memory)
const sessions = {};
function genToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// AUTH
app.post('/api/login', (req, res) => {
  const {login, pass} = req.body;
  const db = loadDB();
  const user = db.users[login];
  if (!user || user.pass !== pass) return res.json({ok: false, error: 'Неверный логин или пароль'});
  const token = genToken();
  sessions[token] = {login, role: user.role, branches: user.branches, name: user.name};
  res.json({ok: true, token, user: {login, role: user.role, branches: user.branches, name: user.name}});
});

function auth(req, res, next) {
  const token = req.headers['x-token'];
  if (!token || !sessions[token]) return res.status(401).json({error: 'Не авторизован'});
  req.session = sessions[token];
  next();
}

function adminOnly(req, res, next) {
  if (req.session.role !== 'admin') return res.status(403).json({error: 'Нет доступа'});
  next();
}

function canAccessBranch(req, res, next) {
  const branch = req.params.branch || req.body.branch;
  if (!req.session.branches.includes(branch)) return res.status(403).json({error: 'Нет доступа к этой точке'});
  next();
}

// ENTRIES
app.get('/api/entries/:branch', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  res.json(db.entries[req.params.branch] || []);
});

app.post('/api/entries/:branch', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  if (!db.entries[branch]) db.entries[branch] = [];
  const entry = {...req.body, id: Date.now(), branch};
  db.entries[branch].push(entry);
  saveDB(db);
  res.json({ok: true, entry});
});

app.put('/api/entries/:branch/:id', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  const id = parseInt(req.params.id);
  const arr = db.entries[branch] || [];
  const idx = arr.findIndex(e => e.id === id);
  if (idx === -1) return res.json({ok: false});
  arr[idx] = {...arr[idx], ...req.body};
  db.entries[branch] = arr;
  saveDB(db);
  res.json({ok: true});
});

app.delete('/api/entries/:branch/:id', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  const id = parseInt(req.params.id);
  db.entries[branch] = (db.entries[branch] || []).filter(e => e.id !== id);
  saveDB(db);
  res.json({ok: true});
});

// EMPLOYEES
app.get('/api/employees', auth, (req, res) => {
  const db = loadDB();
  const result = {};
  req.session.branches.forEach(b => result[b] = db.employees[b] || []);
  res.json(result);
});

app.post('/api/employees/:branch', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  const {name} = req.body;
  if (!db.employees[branch]) db.employees[branch] = [];
  if (!db.employees[branch].includes(name)) db.employees[branch].push(name);
  saveDB(db);
  res.json({ok: true, employees: db.employees[branch]});
});

app.delete('/api/employees/:branch/:name', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  db.employees[branch] = (db.employees[branch] || []).filter(e => e !== decodeURIComponent(req.params.name));
  saveDB(db);
  res.json({ok: true, employees: db.employees[branch]});
});

// PROFILES
app.get('/api/profiles/:branch', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  res.json(db.profiles[req.params.branch] || {});
});

app.post('/api/profiles/:branch/:emp', auth, canAccessBranch, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  if (!db.profiles[branch]) db.profiles[branch] = {};
  db.profiles[branch][decodeURIComponent(req.params.emp)] = req.body;
  saveDB(db);
  res.json({ok: true});
});

// PASSWORDS (admin only)
app.post('/api/passwords', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const {passwords} = req.body;
  Object.keys(passwords).forEach(login => {
    if (db.users[login] && passwords[login]) db.users[login].pass = passwords[login];
  });
  saveDB(db);
  res.json({ok: true});
});

// IMPORT historical data (admin only, one-time)
app.post('/api/import/:branch', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  if (!db.entries[branch] || db.entries[branch].length === 0) {
    db.entries[branch] = req.body.entries || [];
    saveDB(db);
    res.json({ok: true, count: db.entries[branch].length});
  } else {
    res.json({ok: true, skipped: true, count: db.entries[branch].length});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));

// Allow import without full auth using special key
app.post('/api/import_init/:branch', (req, res) => {
  const db = loadDB();
  const branch = req.params.branch;
  if (!db.entries[branch] || db.entries[branch].length === 0) {
    db.entries[branch] = req.body.entries || [];
    saveDB(db);
    res.json({ok: true, count: db.entries[branch].length});
  } else {
    res.json({ok: true, skipped: true, count: db.entries[branch].length});
  }
});
