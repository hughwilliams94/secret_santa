'use strict';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function flash(msg, kind = 'ok') {
  return msg ? `<p class="flash ${kind}">${esc(msg)}</p>` : '';
}

function home() {
  return layout('Secret Santa', `
<h1>🎅 Secret Santa</h1>
<div class="card"><p>Use the personal link your organiser sent you to see who you're buying for.</p></div>`);
}

function notFound() {
  return layout('Not found', `
<h1>🎅 Hmm…</h1>
<div class="card"><p>That link doesn't look right. Check with your organiser for your personal link.</p></div>`);
}

function admin({ event, adminPath, baseUrl, mailEnabled, msg, err }) {
  const ps = event.participants;
  const drawn = Boolean(event.assignments);
  const byId = Object.fromEntries(ps.map((p) => [p.id, p]));

  const rows = ps.map((p) => {
    const others = ps.filter((o) => o.id !== p.id);
    const excl = (p.exclusions || []).map((id) => byId[id]?.name).filter(Boolean);
    return `
<tr>
  <td>
    <form method="post" action="${adminPath}/participants/${p.id}" class="inline-edit">
      <input name="name" value="${esc(p.name)}" required ${drawn ? 'readonly' : ''} aria-label="Name">
      <input name="email" type="email" value="${esc(p.email)}" placeholder="email (optional)" aria-label="Email">
      <input name="household" value="${esc(p.household)}" placeholder="household" ${drawn ? 'readonly' : ''} aria-label="Household">
      <button class="small">Save</button>
    </form>
  </td>
  <td>
    ${drawn
      ? (excl.length ? esc(excl.join(', ')) : '<span class="muted">—</span>')
      : `<details><summary>${excl.length ? esc(excl.join(', ')) : 'none'}</summary>
         <form method="post" action="${adminPath}/participants/${p.id}/exclusions">
           ${others.map((o) => `<label class="check"><input type="checkbox" name="exclusions" value="${o.id}" ${(p.exclusions || []).includes(o.id) ? 'checked' : ''}> ${esc(o.name)}</label>`).join('')}
           <button class="small">Save exclusions</button>
         </form></details>`}
  </td>
  <td class="link-cell"><input readonly value="${esc(baseUrl + '/p/' + p.token)}" onclick="this.select()" aria-label="Personal link"></td>
  <td>${drawn ? (p.revealedAt ? '✅ seen' : '⏳ not yet') : ''}${p.emailedAt ? '<br><span class="muted">📧 emailed</span>' : ''}</td>
  <td>${drawn ? '' : `<form method="post" action="${adminPath}/participants/${p.id}/delete" onsubmit="return confirm('Remove this person?')"><button class="small danger">Remove</button></form>`}</td>
</tr>`;
  }).join('');

  return layout('Secret Santa – Organiser', `
<h1>🎄 ${esc(event.eventName)} <span class="muted">organiser</span></h1>
${flash(msg)}${flash(err, 'err')}
<p class="muted">Keep this page's address private – anyone with it can manage the draw.</p>

<section class="card">
  <h2>Event details</h2>
  <form method="post" action="${adminPath}/settings" class="grid">
    <label>Event name <input name="eventName" value="${esc(event.eventName)}" required></label>
    <label>Budget <input name="budget" value="${esc(event.budget)}" placeholder="e.g. £30"></label>
    <label>Exchange date <input name="exchangeDate" value="${esc(event.exchangeDate)}" placeholder="e.g. Christmas Day"></label>
    <button>Save details</button>
  </form>
</section>

<section class="card">
  <h2>People (${ps.length})</h2>
  <p class="muted">People with the same <strong>household</strong> (e.g. "Smiths") will never draw each other – use this for spouses and partners.
  Use <strong>exclusions</strong> for any other pairs who shouldn't get each other.</p>
  ${ps.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Name / email / household</th><th>Can't draw</th><th>Personal link</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>` : '<p>No one added yet.</p>'}
  ${drawn ? '' : `
  <h3>Add a person</h3>
  <form method="post" action="${adminPath}/participants" class="grid">
    <label>Name <input name="name" required></label>
    <label>Email <input name="email" type="email" placeholder="optional"></label>
    <label>Household <input name="household" placeholder="e.g. Smiths" list="households"></label>
    <datalist id="households">${[...new Set(ps.map((p) => p.household).filter(Boolean))].map((h) => `<option value="${esc(h)}">`).join('')}</datalist>
    <button>Add</button>
  </form>`}
</section>

<section class="card">
  <h2>The draw</h2>
  ${drawn ? `
    <p>✨ Names were drawn on ${esc(new Date(event.drawnAt).toLocaleString('en-GB'))}. Send everyone their personal link above.
    The assignments are hidden here so you can take part too.</p>
    ${mailEnabled ? `<form method="post" action="${adminPath}/email-all"><button>📧 Email everyone their person</button></form>` : '<p class="muted">Email is not configured (see README) – people will see their match on their personal page.</p>'}
    <form method="post" action="${adminPath}/reset" onsubmit="return confirm('This throws away the current draw. Everyone will get a new person. Are you sure?')">
      <button class="danger">Undo draw</button>
    </form>`
  : `
    <p>When everyone's added, draw names. People's links will then show who they're buying for.</p>
    <form method="post" action="${adminPath}/draw"><button ${ps.length < 2 ? 'disabled' : ''}>🎲 Draw names</button></form>`}
</section>`);
}

function person({ event, me, receiver, pagePath, mailEnabled, msg, err }) {
  const drawn = Boolean(event.assignments);
  const details = [
    event.budget && `<li>💷 Budget: <strong>${esc(event.budget)}</strong></li>`,
    event.exchangeDate && `<li>📅 Exchange: <strong>${esc(event.exchangeDate)}</strong></li>`,
  ].filter(Boolean).join('');

  let main;
  if (!drawn) {
    main = `<section class="card center"><p>Names haven't been drawn yet – check back soon! 🎄</p>
      <p class="muted">In the meantime, add some gift ideas below for whoever draws you.</p></section>`;
  } else if (!me.revealedAt) {
    main = `<section class="card center">
      <p>Names have been drawn! Ready to find out who you're buying for?</p>
      <form method="post" action="${pagePath}/reveal"><button class="big">🎁 Reveal my person</button></form>
      <p class="muted">Make sure nobody's looking over your shoulder…</p>
    </section>`;
  } else {
    main = `<section class="card center reveal">
      <p>You're Secret Santa for…</p>
      <p class="name">${esc(receiver.name)}</p>
      ${receiver.wishlist
        ? `<div class="wishlist"><h3>Their gift ideas</h3><p>${esc(receiver.wishlist).replace(/\n/g, '<br>')}</p></div>`
        : `<p class="muted">${esc(receiver.name)} hasn't added any gift ideas yet.</p>`}
      ${mailEnabled && me.email ? `<form method="post" action="${pagePath}/email"><button class="small secondary">📧 Email me a reminder</button></form>` : ''}
    </section>`;
  }

  return layout(`Secret Santa – ${me.name}`, `
<h1>🎅 Hi ${esc(me.name)}!</h1>
<p class="muted">${esc(event.eventName)}</p>
${flash(msg)}${flash(err, 'err')}
${details ? `<ul class="details">${details}</ul>` : ''}
${main}
<section class="card">
  <h2>Your wishlist</h2>
  <p class="muted">Whoever drew you will see this. Hints, sizes, links – anything helps!</p>
  <form method="post" action="${pagePath}/wishlist">
    <textarea name="wishlist" rows="5" maxlength="4000">${esc(me.wishlist)}</textarea>
    <button>Save wishlist</button>
  </form>
</section>
<p class="muted small">This page is just for you – please don't share the link.</p>`);
}

module.exports = { home, notFound, admin, person };
