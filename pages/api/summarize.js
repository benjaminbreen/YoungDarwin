// /api/summarize.js - API route for generating event summaries
// Following the pattern in generate.js for API key handling
import { generateLLMText } from '../../utils/server/llmProvider';
import { getRequestIdentity } from '../../utils/server/llmSafety';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event, idempotencyKey: bodyIdempotencyKey } = req.body;

    if (!event || !event.fullContent) {
      return res.status(400).json({ error: 'Event data is required' });
    }

    // Extract key event details
    const eventType = event.eventType || 'narrative';
    const eventLocation = event.location || 'Unknown';
    const eventTime = event.time || '';
    const eventDay = event.day || 1;
    const eventContent = event.fullContent || '';
    const { sessionId, idempotencyKey } = getRequestIdentity({
      req,
      route: '/api/summarize',
      prompt: eventContent,
      idempotencyKey: bodyIdempotencyKey || event.id,
    });

    const llmResult = await generateLLMText({
      model: process.env.YOUNG_DARWIN_SUMMARY_MODEL || process.env.YOUNG_DARWIN_DEFAULT_MODEL || 'gpt-5.4-nano',
      route: '/api/summarize',
      sessionId,
      idempotencyKey,
      background: true,
      systemPrompt: `You are a summarizer for a game about Charles Darwin exploring the Galápagos Islands in 1835.
            Your task is to create a concise, vivid one-sentence summary of game events.
            Focus on capturing the most scientifically or narratively significant aspects.
            Use present tense, engaging language, and focus on Darwin's actions, especially the user input. If user has entered dialogue, reproduce it in full. 
            Keep summaries under 50 words. Make them crisp, almost telegraphic. Maximize content per word. NO FLUFF.`,
      userPrompt: `Event details:
            - Type: ${eventType}
            - Location: ${eventLocation}
            - Time: ${eventTime} on Day ${eventDay}
            - Full Content: "${eventContent.substring(0, 500)}${eventContent.length > 500 ? '...' : ''}"
            
            Summarize this event in a single, vivid, highly specific sentence that captures the most important information and user inputs.`,
      temperature: 0.3,
      maxTokens: 100,
    });

    if (llmResult.blocked) {
      return res.status(200).json({
        summary: null,
        blocked: true,
        reason: llmResult.reason,
      });
    }

    const summary = llmResult.text.trim();
    
    // Clean the summary if needed (remove quotes, etc.)
    const cleanSummary = summary.replace(/^["']|["']$/g, '');
    
    return res.status(200).json({ summary: cleanSummary });
    
  } catch (error) {
    console.error('Error generating summary:', error);
    return res.status(500).json({ 
      error: 'Error generating summary', 
      details: error.message 
    });
  }
}
