import { getLLMUsageSnapshot } from '../../utils/server/llmSafety';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.query.sessionId || req.headers['x-young-darwin-session'] || null;
  return res.status(200).json(getLLMUsageSnapshot(Array.isArray(sessionId) ? sessionId[0] : sessionId));
}
