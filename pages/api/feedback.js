// Player feedback and bug reports, delivered by email.
//
// Sends via Gmail SMTP when FEEDBACK_GMAIL_USER and FEEDBACK_GMAIL_APP_PASSWORD
// are set (a Gmail "app password", not the account password). Without them the
// route reports not-configured and the client falls back to a mailto: link, so
// feedback still reaches the same inbox either way.

import nodemailer from 'nodemailer';
import { getClientId } from '../../utils/server/llmSafety';

const FEEDBACK_TO = process.env.FEEDBACK_TO_ADDRESS || 'breen85@gmail.com';
const MAX_MESSAGE_LENGTH = 6000;
const MAX_PER_CLIENT_PER_HOUR = 10;

const state = globalThis.__youngDarwinFeedback || { clients: new Map() };
globalThis.__youngDarwinFeedback = state;

function rateLimited(clientId) {
  const now = Date.now();
  const windowStart = now - 3_600_000;
  const entry = state.clients.get(clientId) || [];
  const recent = entry.filter(at => at > windowStart);
  if (recent.length >= MAX_PER_CLIENT_PER_HOUR) return true;
  recent.push(now);
  state.clients.set(clientId, recent);
  if (state.clients.size > 2000) {
    for (const [key, times] of state.clients.entries()) {
      if (!times.some(at => at > windowStart)) state.clients.delete(key);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method-not-allowed' });
    return;
  }

  const message = String(req.body?.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  const category = req.body?.category === 'bug' ? 'Bug report' : 'Feedback';
  const contact = String(req.body?.contact || '').trim().slice(0, 200);
  const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};

  if (!message) {
    res.status(400).json({ ok: false, reason: 'empty-message' });
    return;
  }

  if (rateLimited(getClientId(req))) {
    res.status(429).json({ ok: false, reason: 'rate-limited' });
    return;
  }

  const user = process.env.FEEDBACK_GMAIL_USER;
  const pass = process.env.FEEDBACK_GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    res.status(200).json({ ok: false, reason: 'not-configured' });
    return;
  }

  const contextLines = Object.entries(context)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${String(value).slice(0, 300)}`);

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: `"Darwin Game Feedback" <${user}>`,
      to: FEEDBACK_TO,
      replyTo: contact || undefined,
      subject: `[Darwin Game] ${category}`,
      text: [
        message,
        '',
        '---',
        contact ? `Contact: ${contact}` : 'Contact: not provided',
        ...contextLines,
      ].join('\n'),
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('feedback send failed:', error?.message || error);
    res.status(200).json({ ok: false, reason: 'send-failed' });
  }
}
