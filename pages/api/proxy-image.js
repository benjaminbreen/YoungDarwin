// pages/api/proxy-image.js
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { pipeline } from 'stream/promises';

// This API route serves as a proxy for external images and saves them locally
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, id } = req.query;
  
  if (!url || !id) {
    return res.status(400).json({ error: 'Missing required parameters: url and id' });
  }
  
  try {
    // Create the specimens directory if it doesn't exist
    const dir = './public/specimens';
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Path to save the image
    const filePath = `./public/specimens/${id.toLowerCase()}.jpg`;
    
    // Check if we already have this image
    if (existsSync(filePath)) {
      // If we already have the image, redirect to the local path
      return res.redirect(`/specimens/${id.toLowerCase()}.jpg`);
    }
    
    // Fetch the image from the URL
    const imageResponse = await fetch(url);
    
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    
    // Create a read stream from the response body
    const body = await imageResponse.arrayBuffer();
    
    // Write the image to the filesystem
    const buffer = Buffer.from(body);
    require('fs').writeFileSync(filePath, buffer);
    
    // Redirect to the saved image
    res.redirect(`/specimens/${id.toLowerCase()}.jpg`);
    
  } catch (error) {
    console.error('Error proxying image:', error);
    
    // Redirect to placeholder on error
    res.redirect('/specimens/placeholder.jpg');
  }
}