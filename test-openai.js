// Simple script to test OpenAI API connectivity
// Run with: node test-openai.js

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Get API key from environment
const apiKey = process.env.OPENAI_API_KEY;

// Check if API key exists
if (!apiKey) {
  console.error('❌ ERROR: OPENAI_API_KEY is not set in your .env.local file');
  process.exit(1);
}

console.log('API Key found. Testing OpenAI API connection...');

// Use the fetch API to make a request to OpenAI
async function testOpenAI() {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Using a cheaper model for testing
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello!' }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Success! API is working correctly.');
    console.log('Response:', data.choices[0].message.content);
  } catch (error) {
    console.error('❌ Error testing OpenAI API:', error);
  }
}

// Run the test
testOpenAI();