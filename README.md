# 🎅 Family Secret Santa

A small, self-hosted Secret Santa web app for a family get-together.

- **No logins.** Everyone gets a private personal link, which you send them.
- **Exclusions.** Put spouses and partners in the same *household* and they'll never draw each other. You can also block any other pair (for example, whoever you had last year).
- **Reveal on click.** People open their link and press *Reveal my person*.
- **Email confirmation (optional).** When someone reveals their person, they get an email with the name, budget and date. You can also email everyone at once from the organiser page.
- **Wishlists.** Everyone can add gift ideas, and their Secret Santa sees them.
- **You can take part too.** The organiser page shows who has looked at their match, but never who drew whom.

## Running it

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

On startup it prints your **organiser link**, for example `http://localhost:3000/admin/AbC123...`. Open it and then:

1. Enter the event details (name, budget, date).
2. Add each person with their email (optional) and household. Spouses get the same household, e.g. "Smiths".
3. Optionally, open *Can't draw* for anyone with extra exclusions.
4. Click **Draw names**.
5. Copy each person's personal link from the table and send it to them by WhatsApp, text, card and so on.

Changed your mind? **Undo draw** clears the assignments so you can edit and draw again. Personal links stay the same.

Data is stored in `data/db.json`. Set `DATA_FILE` to put it somewhere else.

## Configuration

Settings come from environment variables. See `.env.example`. With Node 20.6+ you can run:

```bash
cp .env.example .env   # then edit it
node --env-file=.env server.js
```

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 3000) |
| `BASE_URL` | Public address of the site, used in the links in emails. Set this when hosting. |
| `ADMIN_TOKEN` | Fixes the organiser link. If unset, a random one is generated once and saved. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email settings. Email is off unless `SMTP_HOST` is set. |

### Email with Gmail

Turn on 2-step verification for the account, create an [App Password](https://myaccount.google.com/apppasswords), then use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=<your address>` and `SMTP_PASS=<the app password>`. Any other SMTP provider works too (Brevo, Mailgun, Fastmail, your ISP and so on).

## Hosting

Any host that runs a Node app with a persistent disk will work: a Raspberry Pi at home, a small VPS, Render, Railway or Fly.io. Mount a volume for `data/`, or the draw is lost on redeploy. Use HTTPS so the personal links aren't sent in plain text.

## How the draw works

`lib/draw.js` assigns everyone one person. Nobody draws themselves, someone in their own household, or someone on either person's exclusion list, and everyone is drawn exactly once. It uses randomised backtracking, so it always finds a valid draw if one exists. If none exists, it tells you to loosen the exclusions.

```bash
npm test
```

## Security notes

The personal links are the only "password". They're long and random, and pages are marked `noindex`. Anyone with someone's link can see who that person drew, so send each link only to its owner. Keep the organiser link to yourself.
