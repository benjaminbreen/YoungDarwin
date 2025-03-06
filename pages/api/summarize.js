// /api/summarize.js - API route for generating event summaries
// Following the pattern in generate.js for API key handling

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { event } = req.body;

    if (!event || !event.fullContent) {
      return res.status(400).json({ error: 'Event data is required' });
    }

    // Validate API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing");
      return res.status(500).json({ error: "API key is not configured" });
    }

    // Extract key event details
    const eventType = event.eventType || 'narrative';
    const eventLocation = event.location || 'Unknown';
    const eventTime = event.time || '';
    const eventDay = event.day || 1;
    const eventContent = event.fullContent || '';

    // Call the OpenAI API with the API key from env
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a summarizer for a game about Charles Darwin exploring the Galápagos Islands in 1835.
            Your task is to create a concise, vivid one-sentence summary of game events.
            Focus on capturing the most scientifically or narratively significant aspects.
            Use present tense, engaging language, and focus on Darwin's actions, especially the user input. If user has entered dialogue, reproduce it in full. 
            Keep summaries under 50 words. Make them crisp, almost telegraphic, think Hemingway or Becket. Maximize content per word. NO FLUFF.`
          },
          {
            role: 'user',
            content: `Event details:
            - Type: ${eventType}
            - Location: ${eventLocation}
            - Time: ${eventTime} on Day ${eventDay}
            - Full Content: "${eventContent.substring(0, 500)}${eventContent.length > 500 ? '...' : ''}"
            
            Summarize this event in a single, vivid, highly specific sentence that captures the most important information and user inputs.`
          }
        ],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenAI API error: ${errorText}`);
      return res.status(500).json({ 
        error: `Error from OpenAI API: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    // Extract the summary from the response
    const summary = data.choices[0].message.content.trim();
    
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