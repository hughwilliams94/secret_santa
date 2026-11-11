'use strict';
const path = require('path');
const express = require('express');
const store = require('./lib/store');
const views = require('./lib/views');
const mail = require('./lib/mail');
const { draw } = require('./lib/draw');

const PORT = Number(process.env.PORT || 3000);
const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (Caddy/nginx) on the same host: trust its X-Forwarded-* headers.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

const db = store.load();
if (process.env.ADMIN_TOKEN) {
  db.adminToken = process.env.ADMIN_TOKEN;
} else if (!db.adminToken) {
  db.adminToken = store.token();
  store.save();
}

const baseUrl = (req) => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const field = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const back = (res, to, { msg, err } = {}) => {
  const q = new URLSearchParams();
  if (msg) q.set('msg', msg);
  if (err) q.set('err', err);
  res.redirect(303, to + (q.size ? `?${q}` : ''));
};

async function emailAssignment(req, giver) {
  const receiver = db.participants.find((p) => p.id === db.assignments[giver.id]);
  const sent = await mail.sendAssignment({
    event: db, giver, receiver, link: `${baseUrl(req)}/p/${giver.token}`,
  });
  if (sent) {
    giver.emailedAt = new Date().toISOString();
    store.save();
  }
  return sent;
}

app.get('/healthz', (req, res) => res.type('text').send('ok'));

// ---------- Home ----------
app.get('/', (req, res) => res.send(views.home()));

// ---------- Organiser ----------
const adminRouter = express.Router({ mergeParams: true });
app.use('/admin/:adminToken', (req, res, next) => {
  if (req.params.adminToken !== db.adminToken) return res.status(404).send(views.notFound());
  req.adminPath = `/admin/${db.adminToken}`;
  next();
}, adminRouter);

const findParticipant = (req, res) => {
  const p = db.participants.find((x) => x.id === req.params.id);
  if (!p) back(res, req.adminPath, { err: 'Person not found.' });
  return p;
};
const ensureNotDrawn = (req, res) => {
  if (db.assignments) {
    back(res, req.adminPath, { err: 'Names have already been drawn. Undo the draw first to make changes.' });
    return false;
  }
  return true;
};

adminRouter.get('/', (req, res) => {
  res.send(views.admin({
    event: db, adminPath: req.adminPath, baseUrl: baseUrl(req), mailEnabled: mail.enabled,
    msg: req.query.msg, err: req.query.err,
  }));
});

adminRouter.post('/settings', (req, res) => {
  db.eventName = field(req.body.eventName) || 'Family Secret Santa';
  db.budget = field(req.body.budget, 50);
  db.exchangeDate = field(req.body.exchangeDate, 100);
  store.save();
  back(res, req.adminPath, { msg: 'Details saved.' });
});

adminRouter.post('/participants', (req, res) => {
  if (!ensureNotDrawn(req, res)) return;
  const name = field(req.body.name, 80);
  if (!name) return back(res, req.adminPath, { err: 'Name is required.' });
  db.participants.push({
    id: store.token().slice(0, 8),
    token: store.token(),
    name,
    email: field(req.body.email),
    household: field(req.body.household, 80),
    exclusions: [],
    wishlist: '',
    revealedAt: null,
    emailedAt: null,
  });
  store.save();
  back(res, req.adminPath, { msg: `Added ${name}.` });
});

adminRouter.post('/participants/:id', (req, res) => {
  const p = findParticipant(req, res);
  if (!p) return;
  p.email = field(req.body.email);
  if (!db.assignments) {
    p.name = field(req.body.name, 80) || p.name;
    p.household = field(req.body.household, 80);
  }
  store.save();
  back(res, req.adminPath, { msg: `Saved ${p.name}.` });
});

adminRouter.post('/participants/:id/exclusions', (req, res) => {
  if (!ensureNotDrawn(req, res)) return;
  const p = findParticipant(req, res);
  if (!p) return;
  const ids = [].concat(req.body.exclusions || []);
  p.exclusions = ids.filter((id) => id !== p.id && db.participants.some((o) => o.id === id));
  store.save();
  back(res, req.adminPath, { msg: `Saved exclusions for ${p.name}.` });
});

adminRouter.post('/participants/:id/delete', (req, res) => {
  if (!ensureNotDrawn(req, res)) return;
  const p = findParticipant(req, res);
  if (!p) return;
  db.participants = db.participants.filter((x) => x.id !== p.id);
  for (const o of db.participants) o.exclusions = (o.exclusions || []).filter((id) => id !== p.id);
  store.save();
  back(res, req.adminPath, { msg: `Removed ${p.name}.` });
});

adminRouter.post('/draw', (req, res) => {
  if (!ensureNotDrawn(req, res)) return;
  try {
    db.assignments = draw(db.participants);
  } catch (e) {
    return back(res, req.adminPath, { err: e.message });
  }
  db.drawnAt = new Date().toISOString();
  for (const p of db.participants) { p.revealedAt = null; p.emailedAt = null; }
  store.save();
  back(res, req.adminPath, { msg: 'Names drawn! Now send everyone their personal link.' });
});

adminRouter.post('/reset', (req, res) => {
  db.assignments = null;
  db.drawnAt = null;
  for (const p of db.participants) { p.revealedAt = null; p.emailedAt = null; }
  store.save();
  back(res, req.adminPath, { msg: 'Draw undone. You can make changes and draw again.' });
});

adminRouter.post('/email-all', async (req, res) => {
  if (!db.assignments) return back(res, req.adminPath, { err: 'Draw names first.' });
  let sent = 0;
  const failed = [];
  for (const p of db.participants) {
    if (!p.email) continue;
    try {
      if (await emailAssignment(req, p)) sent++;
    } catch (e) {
      console.error(`Email to ${p.email} failed:`, e.message);
      failed.push(p.name);
    }
  }
  back(res, req.adminPath, failed.length
    ? { err: `Sent ${sent} email(s). Failed for: ${failed.join(', ')}.` }
    : { msg: `Sent ${sent} email(s).` });
});

// ---------- Participant pages ----------
const personRouter = express.Router({ mergeParams: true });
app.use('/p/:token', (req, res, next) => {
  const me = db.participants.find((p) => p.token === req.params.token);
  if (!me) return res.status(404).send(views.notFound());
  req.me = me;
  req.pagePath = `/p/${me.token}`;
  next();
}, personRouter);

personRouter.get('/', (req, res) => {
  const { me } = req;
  const receiver = db.assignments && db.participants.find((p) => p.id === db.assignments[me.id]);
  res.set('Cache-Control', 'no-store');
  res.send(views.person({
    event: db, me, receiver, pagePath: req.pagePath, mailEnabled: mail.enabled,
    msg: req.query.msg, err: req.query.err,
  }));
});

personRouter.post('/reveal', async (req, res) => {
  const { me } = req;
  if (!db.assignments) return back(res, req.pagePath);
  const first = !me.revealedAt;
  if (first) {
    me.revealedAt = new Date().toISOString();
    store.save();
  }
  let msg;
  if (first && me.email && mail.enabled && !me.emailedAt) {
    try {
      if (await emailAssignment(req, me)) msg = `We've emailed a copy to ${me.email}.`;
    } catch (e) {
      console.error(`Email to ${me.email} failed:`, e.message);
    }
  }
  back(res, req.pagePath, { msg });
});

personRouter.post('/email', async (req, res) => {
  const { me } = req;
  if (!db.assignments || !me.revealedAt) return back(res, req.pagePath);
  try {
    const sent = await emailAssignment(req, me);
    back(res, req.pagePath, sent ? { msg: `Sent to ${me.email}.` } : { err: 'Email is not available.' });
  } catch (e) {
    console.error(`Email to ${me.email} failed:`, e.message);
    back(res, req.pagePath, { err: 'Sorry, the email could not be sent. Try again later.' });
  }
});

personRouter.post('/wishlist', (req, res) => {
  req.me.wishlist = field(req.body.wishlist, 4000);
  store.save();
  back(res, req.pagePath, { msg: 'Wishlist saved.' });
});

app.use((req, res) => res.status(404).send(views.notFound()));

const server = app.listen(PORT, () => {
  const base = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
  console.log(`🎅 Secret Santa running on port ${PORT}`);
  console.log(`   Organiser page: ${base}/admin/${db.adminToken}`);
  console.log(`   Email: ${mail.enabled ? `enabled via ${process.env.SMTP_HOST}` : 'disabled (set SMTP_HOST to enable)'}`);
  mail.verify().then(
    (ok) => ok && console.log('   SMTP login OK'),
    (e) => console.error(`   SMTP check failed: ${e.message}`),
  );
});

// Podman/systemd stop the container with SIGTERM.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
