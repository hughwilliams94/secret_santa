'use strict';
const nodemailer = require('nodemailer');

const enabled = Boolean(process.env.SMTP_HOST);
const port = Number(process.env.SMTP_PORT || 465);
// Port 465 (Fastmail's default) uses implicit TLS; 587 uses STARTTLS.
const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;

const transport = enabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      requireTLS: !secure,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;

async function sendAssignment({ event, giver, receiver, link }) {
  if (!enabled || !giver.email) return false;
  const lines = [
    `Hi ${giver.name},`,
    '',
    `Names have been drawn for ${event.eventName}!`,
    '',
    `You are buying a gift for: ${receiver.name}`,
  ];
  if (event.budget) lines.push(`Budget: ${event.budget}`);
  if (event.exchangeDate) lines.push(`Gift exchange: ${event.exchangeDate}`);
  lines.push('', `Check their wishlist (and add your own) here: ${link}`, '', 'Shh... keep it secret! 🎅');

  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: giver.email,
    subject: `🎁 Your Secret Santa for ${event.eventName}`,
    text: lines.join('\n'),
  });
  return true;
}

async function verify() {
  if (!enabled) return false;
  await transport.verify();
  return true;
}

module.exports = { enabled, sendAssignment, verify };
