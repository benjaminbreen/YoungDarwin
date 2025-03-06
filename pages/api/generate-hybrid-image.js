// pages/api/generate-hybrid-image.js
// This file should go in your 'pages/api' folder

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { hybridId, prompt } = req.body;
    
    if (!hybridId || !prompt) {
      return res.status(400).json({ error: 'Missing hybridId or prompt parameter' });
    }
    
    // Validate API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("API key is missing");
      return res.status(500).json({ error: "API key is not configured" });
    }
    
    // Call DALLE API to generate an image
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        n: 1,
        size: '1024x1024',
        response_format: 'url'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to generate image');
    }
    
    const data = await response.json();
    const imageUrl = data.data[0]?.url;
    
    if (!imageUrl) {
      throw new Error('No image URL returned from API');
    }
    
    // In a production app, you would now:
    // 1. Download the image from the URL
    // 2. Save it to your public/specimens/generated folder
    // 3. Return the local path to the client
    
    // For the purposes of this demo, we'll just return the URL
    return res.status(200).json({
      success: true,
      imageUrl,
      hybridId
    });
    
  } catch (error) {
    console.error('Error generating hybrid image:', error);
    return res.status(500).json({
      error: 'Failed to generate hybrid image',
      details: error.message
    });
  }
}