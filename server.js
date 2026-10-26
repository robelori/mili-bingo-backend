const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Shared memory database
let users = {};
let notifications = [];
let gameHistory = [];
let settings = {
  maintenance: false,
  autoApprove: false,
  welcomeBonus: 50,
  minDeposit: 100,
  maxWithdrawal: 5000,
  commission: 15
};

// SIGNUP endpoint
app.post('/api/signup', (req, res) => {
  const { username, passcode } = req.body;
  if (!username || !passcode) return res.status(400).json({ error: 'Missing fields' });
  if (users[username]) return res.status(400).json({ error: 'Username already taken' });

  const bonus = Number(settings.welcomeBonus || 50);
  const user = {
    username,
    passcode,
    cashBalance: 0,
    bonusBalance: bonus,
    transactions: [{
      id: 'tx_' + Date.now(),
      username,
      desc: 'Welcome Bonus',
      amt: bonus,
      type: 'bonus',
      status: 'approved',
      reference: 'WELCOME-BONUS',
      date: new Date().toISOString()
    }]
  };

  users[username] = user;
  notifications.unshift({ id: Date.now(), text: `New player: ${username}`, type: 'register', time: new Date().toISOString() });
  res.json({ success: true, user });
});

// LOGIN endpoint
app.post('/api/login', (req, res) => {
  const { username, passcode } = req.body;
  if (settings.maintenance) return res.status(403).json({ error: 'System is under maintenance' });
  
  const user = users[username];
  if (!user || String(user.passcode) !== String(passcode)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ success: true, user });
});

// GET USER data
app.get('/api/users/:username', (req, res) => {
  const user = users[req.params.username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, user });
});

// DEPOSIT endpoint
app.post('/api/deposit', (req, res) => {
  const { username, amount, txId } = req.body;
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const record = {
    id: 'tx_' + Date.now(),
    username,
    desc: 'TeleBirr Deposit — Pending Review',
    amt: Number(amount),
    type: 'cr',
    status: 'pending',
    reference: txId,
    date: new Date().toISOString()
  };

  user.transactions.unshift(record);
  notifications.unshift({ id: Date.now(), text: `${username} submitted deposit: ${amount} ETB (TX: ${txId})`, type: 'deposit', time: new Date().toISOString() });
  
  res.json({ success: true, user });
});

// WITHDRAW endpoint
app.post('/api/withdraw', (req, res) => {
  const { username, amount, reference } = req.body;
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  const amt = Number(amount);
  if (user.cashBalance < amt) return res.status(400).json({ error: 'Insufficient funds' });

  user.cashBalance -= amt;
  const record = {
    id: 'tx_' + Date.now(),
    username,
    desc: 'Withdrawal — Pending Review',
    amt,
    type: 'dr',
    status: 'pending',
    reference,
    date: new Date().toISOString()
  };

  user.transactions.unshift(record);
  notifications.unshift({ id: Date.now(), text: `${username} requested withdrawal: ${amt} ETB`, type: 'withdrawal', time: new Date().toISOString() });

  res.json({ success: true, user });
});

// ADMIN get all data
app.get('/api/admin/data', (req, res) => {
  res.json({
    users: Object.values(users),
    notifications,
    gameHistory,
    settings
  });
});

// ADMIN approve deposit
app.post('/api/admin/approve-deposit', (req, res) => {
  const { username, txId } = req.body;
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const tx = user.transactions.find(t => t.id === txId || t.reference === txId);
  if (!tx || tx.status !== 'pending') return res.status(400).json({ error: 'Invalid transaction' });

  tx.status = 'approved';
  tx.desc = 'TeleBirr Deposit — Approved';
  user.cashBalance += tx.amt;

  notifications.unshift({ id: Date.now(), text: `Admin APPROVED deposit for ${username}: +${tx.amt} ETB`, type: 'approve', time: new Date().toISOString() });
  res.json({ success: true, user });
});

// ADMIN reject deposit
app.post('/api/admin/reject-deposit', (req, res) => {
  const { username, txId, reason } = req.body;
  const user = users[username];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const tx = user.transactions.find(t => t.id === txId || t.reference === txId);
  if (!tx || tx.status !== 'pending') return res.status(400).json({ error: 'Invalid transaction' });

  tx.status = 'rejected';
  tx.desc += ` [Rejected: ${reason || 'Verification failed'}]`;

  notifications.unshift({ id: Date.now(), text: `Admin REJECTED deposit for ${username}`, type: 'reject', time: new Date().toISOString() });
  res.json({ success: true, user });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MILI BINGO Server running on port ${PORT}`));