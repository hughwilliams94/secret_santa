# 🎅 Family Secret Santa

A small, self-hosted Secret Santa web app for a family get-together.

- **No logins.** Everyone gets a private personal link, which you send them.
- **Exclusions.** Put spouses and partners in the same *household* and they'll never draw each other. You can also block any other pair (for example, whoever you had last year).
- **Reveal on click.** People open their link and press *Reveal my person*.
- **Email confirmation (optional).** When someone reveals their person, they get an email with the name, budget and date. You can also email everyone at once from the organiser page.
- **Wishlists.** Everyone can add gift ideas, and their Secret Santa sees them.
- **You can take part too.** The organiser page shows who has looked at their match, but never who drew whom.

## Running it

Requires Node.js 20 or newer. To host it on a server, see [Deploying on a VPS](#deploying-on-a-vps-with-rootless-podman-and-quadlet).

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

All settings come from environment variables:

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | Public address of the site, e.g. `https://santa.example.com`. Used in links and emails. |
| `ADMIN_TOKEN` | Fixes the organiser link. If unset, a random one is generated on first start, saved and printed in the logs. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email. Email is off unless `SMTP_HOST` is set. Port 465 uses TLS, and 587 uses STARTTLS. |
| `PORT`, `DATA_FILE` | Listen port (default 3000) and data file (default `data/db.json`, `/data/db.json` in the container). |

On startup the app logs into the SMTP server and prints `SMTP login OK` or the error, so you can spot email problems straight away.

To run locally: `cp .env.example .env`, edit it, then run `node --env-file=.env server.js`.

## Deploying on a VPS with rootless Podman and Quadlet

The `deploy/` folder has a Quadlet unit, a named volume for the data, and an example environment file. Everything below runs as your normal user (no `sudo`) unless shown.

### 1. Fastmail app password

Fastmail needs an app password for SMTP. Your normal password won't work. In Fastmail, go to **Settings → Privacy & Security → Manage app passwords and access → New app password**, and choose access to **SMTP**. Store it as a Podman secret so it never sits in a file:

```bash
printf '%s' 'your-app-password' | podman secret create secret-santa-smtp-pass -
```

`MAIL_FROM` must be your Fastmail address or one of your aliases or domains, or Fastmail will reject the message.

### 2. Build the image

```bash
git clone <this repo> ~/secret_santa && cd ~/secret_santa
podman build -t localhost/secret-santa:latest -f Containerfile .
```

### 3. Install the Quadlet units and config

```bash
mkdir -p ~/.config/containers/systemd ~/.config/secret-santa
cp deploy/secret-santa.container deploy/secret-santa-data.volume ~/.config/containers/systemd/
cp deploy/secret-santa.env.example ~/.config/secret-santa/secret-santa.env
chmod 600 ~/.config/secret-santa/secret-santa.env
$EDITOR ~/.config/secret-santa/secret-santa.env   # BASE_URL, SMTP_USER, MAIL_FROM
```

### 4. Start it

```bash
sudo loginctl enable-linger "$USER"   # once: keeps your user services running after you log out
systemctl --user daemon-reload
systemctl --user start secret-santa
journalctl --user -u secret-santa     # shows the organiser link and "SMTP login OK"
```

Quadlet units are generated rather than "enabled". The `[Install]` section starts the service at boot, as long as linger is on.

### 5. HTTPS in front

The container listens only on `127.0.0.1:3000`. Put a reverse proxy in front of it. With Caddy, this gets a certificate automatically:

```
santa.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

### Updating

```bash
cd ~/secret_santa && git pull
podman build -t localhost/secret-santa:latest -f Containerfile .
systemctl --user restart secret-santa
```

Data lives in the `secret-santa-data` volume, so rebuilding and restarting is safe. To back it up, run:

```bash
podman volume export secret-santa-data > secret-santa-backup.tar
```

## How the draw works

`lib/draw.js` assigns everyone one person. Nobody draws themselves, someone in their own household, or someone on either person's exclusion list, and everyone is drawn exactly once. It uses randomised backtracking, so it always finds a valid draw if one exists. If none exists, it tells you to loosen the exclusions.

```bash
npm test
```

## Security notes

The personal links are the only "password". They're long and random, and pages are marked `noindex`. Anyone with someone's link can see who that person drew, so send each link only to its owner. Keep the organiser link to yourself.

## Claude Artifact version

`artifact/secret-santa.html` is a version that runs as a Claude Artifact on claude.ai, so there's nothing to host. Family members sign in to claude.ai, so it uses each person's account in place of secret links. They open the page once and pick their name. The artifact's database rules mean each person can only read their own pick. Only the organiser (the artifact's owner) can change the event or run the draw. The page never shows the organiser who drew whom.

Differences from the Node app: it doesn't send email, and everyone needs a claude.ai account with the artifact shared to them as a **Contributor**.
