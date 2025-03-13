// pages/api/generate-hybrid-image.js
import { OpenAI } from 'openai';

// Configuration constants
const TIMEOUT_MS = 60000; // 60 seconds timeout (longer to allow for rate limits)
const MAX_RETRIES = 3;    // Maximum number of retries for failed requests

// Track request timestamps to implement rate limiting
let requestTimestamps = [];
const RATE_LIMIT = 4;     // Limit to 4 requests per minute (below OpenAI's 5/min)
const RATE_WINDOW = 60000; // 1 minute window

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { hybridName, hybridDescription, parent1Name, parent2Name, hybridityMode } = req.body;
    
    if (!hybridName) {
      return res.status(400).json({ 
        error: 'Missing required parameter: hybridName',
        success: false 
      });
    }

    
console.log(`Hybrid description: ${hybridDescription}, Mode: ${hybridityMode}`);

    // Check if OpenAI API key is configured
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("OPENAI_API_KEY not found in environment variables");
      return res.status(200).json({
        success: false,
        imageUrl: null,
        fallback: true,
        message: "Image generation skipped - API key not configured"
      });
    }
    
    // Generate a stable cache key for this hybrid
    const cacheKey = `${hybridName}-${parent1Name || ''}-${parent2Name || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Check if we need to wait for rate limiting
    await enforceRateLimit();
    
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
      timeout: TIMEOUT_MS,
    });
    
    // Craft a simplified prompt for faster generation
    let prompt = `A wordless, simple, realistic, full color, detailed pixel art representation of ${hybridName}. No text.`;
    
    if (parent1Name && parent2Name) {
      prompt += `, a hybrid of ${parent1Name} and ${parent2Name}`;
    }
    
    // Much simpler style specification for faster generation
    prompt += `. Scientific illustration style, minimal details, no text.`;
    
    console.log(`[Image Generator] Request for: ${hybridName}, using DALL-E 2 model`);
    
    // Create a placeholder URL as fallback
    const encodedName = encodeURIComponent(hybridName);
    const placeholderUrl = `https://via.placeholder.com/256x256/8B5A2B/FFFFFF?text=${encodedName}`;
    
    // Attempt generation with retries
    let imageUrl = null;
    let error = null;
    let attempt = 0;
    let success = false;
    
    while (attempt < MAX_RETRIES && !success) {
      attempt++;
      try {
        console.log(`[Image Generator] Attempt ${attempt} for ${hybridName}`);
        // Record the request timestamp for rate limiting
        recordRequest();
        
        const response = await openai.images.generate({
          model: "dall-e-2", // Use DALL-E 2 for faster generation
          prompt: prompt,
          n: 1,
          size: "256x256", // Smaller size for faster generation
          response_format: "url"
        });
        
        // Get the image URL from the response
        imageUrl = response.data[0].url;
        success = true;
        
        console.log(`[Image Generator] Success for ${hybridName} on attempt ${attempt}`);
      } catch (err) {
        error = err;
        console.error(`[Image Generator] Error on attempt ${attempt} for ${hybridName}:`, err.message);
        
        // If it's a rate limit error, wait longer before retrying
        if (err.message.includes('rate limit') || err.status === 429) {
          const waitTime = 15000 * attempt; // 15s, 30s, 45s for consecutive rate limit errors
          console.log(`[Image Generator] Rate limit hit, waiting ${waitTime/1000}s before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // For other errors, wait a shorter time
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }
    }
    
    // Return final result (success or fallback)
    if (success) {
      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        prompt: prompt,
        model: "dall-e-2",
        cacheKey: cacheKey
      });
    } else {
      // Provide detailed error information with the fallback
      const errorInfo = {
        message: error ? error.message : 'Unknown error',
        code: error ? (error.code || 'unknown') : 'unknown',
        type: error ? (error.type || 'unknown') : 'unknown',
        attempts: attempt
      };
      
      console.log(`[Image Generator] Falling back to placeholder for ${hybridName} after ${attempt} attempts`);
      
      // Return a successful response with fallback image
      return res.status(200).json({
        success: true,
        imageUrl: placeholderUrl,
        fallback: true,
        error: errorInfo,
        message: `Using fallback image after ${attempt} attempts - ${errorInfo.message}`,
        cacheKey: cacheKey
      });
    }
  } catch (error) {
    console.error("[Image Generator] API error:", error);
    
    // Create a placeholder image for any error case
    const fallbackName = encodeURIComponent(req.body.hybridName || 'Hybrid Species');
    const placeholderUrl = `https://via.placeholder.com/256x256/8B5A2B/FFFFFF?text=${fallbackName}`;
    
    // Return a graceful error that won't break the client
    return res.status(200).json({
      success: true,
      imageUrl: placeholderUrl,
      fallback: true,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      message: "Using fallback image due to server error"
    });
  }
}

// Function to enforce rate limits
async function enforceRateLimit() {
  // Clean up old timestamps
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(timestamp => 
    now - timestamp < RATE_WINDOW
  );
  
  // Check if we're at the rate limit
  if (requestTimestamps.length >= RATE_LIMIT) {
    // Calculate how long to wait
    const oldestTimestamp = requestTimestamps[0];
    const waitTime = RATE_WINDOW - (now - oldestTimestamp);
    
    if (waitTime > 0) {
      console.log(`[Rate Limiter] Waiting ${waitTime}ms due to rate limits`);
      // Wait until we're under the rate limit again
      await new Promise(resolve => setTimeout(resolve, waitTime + 200)); // Add 200ms buffer
    }
  }
}

// Function to record a request timestamp
function recordRequest() {
  requestTimestamps.push(Date.now());
}
