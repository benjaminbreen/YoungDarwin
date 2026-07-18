import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VIEW_OPTIONS = new Set(['front', 'side', 'back', 'top', 'threeQuarter']);
const PRESET_OPTIONS = new Set(['standard', 'quick', 'review']);
const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'animation-sheets');
const PUBLIC_MODEL_ROOT = path.join(ROOT, 'public', 'assets', 'models');
const MODEL_FILE_EXTENSIONS = new Set(['.glb', '.gltf']);
const MAX_ACTIVE_JOBS = 1;
let activeJobs = 0;

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^\[|\]$/g, '').toLowerCase();
  return address === '::1'
    || address === '127.0.0.1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.');
}

function isLocalDevelopmentRequest(req) {
  return process.env.NODE_ENV === 'development'
    && isLoopbackAddress(req.socket?.remoteAddress);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function cleanAsset(value) {
  const asset = cleanString(value);
  if (/^[a-zA-Z0-9_-]{1,80}$/.test(asset)) return asset;
  if (!asset.startsWith('/assets/models/')) return '';

  const candidate = path.resolve(ROOT, 'public', asset.replace(/^\/+/, ''));
  const relative = path.relative(PUBLIC_MODEL_ROOT, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';
  if (!MODEL_FILE_EXTENSIONS.has(path.extname(candidate).toLowerCase())) return '';
  try {
    if (!fs.statSync(candidate).isFile()) return '';
    const realRoot = fs.realpathSync(PUBLIC_MODEL_ROOT);
    const realCandidate = fs.realpathSync(candidate);
    const realRelative = path.relative(realRoot, realCandidate);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) return '';
  } catch {
    return '';
  }
  return asset;
}

function cleanClip(value) {
  const clip = cleanString(value);
  if (!clip || clip.length > 160 || /[\u0000-\u001f\u007f]/.test(clip)) return '';
  return clip;
}

function cleanViews(value, fallback) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(',') : []);
  const views = raw
    .map(item => cleanString(item))
    .filter(item => VIEW_OPTIONS.has(item));
  return Array.from(new Set(views.length ? views : fallback));
}

function safeName(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function tail(text, max = 12000) {
  return text.length > max ? text.slice(text.length - max) : text;
}

function runContactSheet(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/render-animation-contact-sheet.mjs', ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Timed out while generating animation contact sheet.'));
    }, 180000);

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const error = new Error(`Contact-sheet generation failed with exit code ${code}.`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

export default async function handler(req, res) {
  if (!isLocalDevelopmentRequest(req)) {
    return res.status(404).json({ ok: false, error: 'Not found.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const asset = cleanAsset(req.body?.asset);
  const clip = cleanClip(req.body?.clip);
  const outputId = safeName(req.body?.outputId || asset);
  const view = VIEW_OPTIONS.has(req.body?.view) ? req.body.view : 'threeQuarter';
  const views = cleanViews(req.body?.views, [view]);
  const preset = PRESET_OPTIONS.has(req.body?.preset) ? req.body.preset : 'standard';
  const frames = clampNumber(req.body?.frames, 12, 1, 24);
  const size = clampNumber(req.body?.size, 360, 120, 720);
  const overview = cleanBoolean(req.body?.overview, false);
  const ground = cleanBoolean(req.body?.ground, true);
  const motionTrail = cleanBoolean(req.body?.motionTrail, false);
  const followCamera = cleanBoolean(req.body?.followCamera, false);
  const yesAll = cleanBoolean(req.body?.yesAll, clip === 'all');
  const incline = clampNumber(req.body?.incline, 0, -30, 30);

  if (!asset) return res.status(400).json({ ok: false, error: 'Invalid or missing asset.' });
  if (!clip) return res.status(400).json({ ok: false, error: 'Invalid or missing clip.' });
  if (!outputId) return res.status(400).json({ ok: false, error: 'Missing output id.' });
  if (activeJobs >= MAX_ACTIVE_JOBS) {
    return res.status(429).json({ ok: false, error: 'A contact-sheet job is already running.' });
  }

  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  const reportPath = path.join(OUTPUT_ROOT, `${outputId}-${safeName(clip)}-${Date.now()}-report.json`);
  const args = [
    '--asset', asset,
    '--clip', clip,
    '--out', path.relative(ROOT, OUTPUT_ROOT),
    '--output-id', outputId,
    '--report', path.relative(ROOT, reportPath),
    '--frames', String(frames),
    '--size', String(size),
  ];
  if (preset !== 'standard') args.push('--preset', preset);
  if (views.length > 1 || req.body?.views) args.push('--views', views.join(','));
  else args.push('--view', views[0] || view);
  if (overview) args.push('--overview');
  else args.push('--no-overview');
  if (ground) args.push('--ground');
  else args.push('--no-ground');
  if (motionTrail) args.push('--motion-trail');
  else args.push('--no-motion-trail');
  if (followCamera) args.push('--follow-camera');
  if (incline) args.push('--incline', String(incline));
  if (yesAll) args.push('--yes-all');

  activeJobs += 1;
  try {
    const result = await runContactSheet(args);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const primary = report.clips?.[0] || {};
    return res.status(200).json({
      ok: true,
      report: path.relative(ROOT, reportPath),
      overview: report.overview || null,
      output: primary.output || report.overview || null,
      sheet: primary.sheet || null,
      directory: primary.directory || null,
      clips: report.clips || [],
      stdout: tail(result.stdout, 2000),
      stderr: tail(result.stderr, 2000),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to generate contact sheet.',
      stdout: tail(error.stdout || ''),
      stderr: tail(error.stderr || ''),
    });
  } finally {
    activeJobs = Math.max(0, activeJobs - 1);
  }
}
