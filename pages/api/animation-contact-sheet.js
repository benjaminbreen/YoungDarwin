import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VIEW_OPTIONS = new Set(['front', 'side', 'threeQuarter']);
const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'animation-sheets');

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const asset = cleanString(req.body?.asset);
  const clip = cleanString(req.body?.clip);
  const outputId = safeName(req.body?.outputId || asset);
  const view = VIEW_OPTIONS.has(req.body?.view) ? req.body.view : 'threeQuarter';
  const frames = clampNumber(req.body?.frames, 12, 1, 24);
  const size = clampNumber(req.body?.size, 360, 120, 720);

  if (!asset) return res.status(400).json({ ok: false, error: 'Missing asset.' });
  if (!clip) return res.status(400).json({ ok: false, error: 'Missing clip.' });
  if (!outputId) return res.status(400).json({ ok: false, error: 'Missing output id.' });

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
    '--view', view,
  ];

  try {
    const result = await runContactSheet(args);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    return res.status(200).json({
      ok: true,
      report: path.relative(ROOT, reportPath),
      output: report.clips?.[0]?.output || null,
      sheet: report.clips?.[0]?.sheet || null,
      directory: report.clips?.[0]?.directory || null,
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
  }
}
