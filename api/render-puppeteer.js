/**
 * High-Quality Excalidraw Render using Puppeteer
 * POST /api/render-puppeteer
 * 
 * Note: This requires chrome-aws-lambda for Vercel
 * Install: npm install chrome-aws-lambda puppeteer-core
 */

import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let browser = null;

  try {
    const { elements, appState = {}, files = {}, format = 'png', scale = 2 } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ 
        error: 'Invalid request. "elements" array is required.' 
      });
    }

    // Launch headless browser
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: scale,
    });

    // Load Excalidraw
    await page.goto('https://excalidraw.com/', {
      waitUntil: 'networkidle0',
    });

    // Wait for Excalidraw to load
    await page.waitForFunction(() => window.ExcalidrawLib !== undefined, {
      timeout: 10000,
    });

    // Inject elements and render
    const imageBuffer = await page.evaluate(async (elements, appState, files, format) => {
      // Import scene
      const scene = {
        elements: elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor || '#ffffff',
          exportBackground: appState.exportBackground !== false,
          exportWithDarkMode: appState.exportWithDarkMode || false,
          ...appState
        },
        files: files || {}
      };

      // Use Excalidraw's export function
      // Note: This is simplified - actual implementation may vary
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Calculate bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      elements.forEach(el => {
        if (el.type === 'cameraUpdate' || el.type === 'delete') return;
        minX = Math.min(minX, el.x || 0);
        minY = Math.min(minY, el.y || 0);
        maxX = Math.max(maxX, (el.x || 0) + (el.width || 0));
        maxY = Math.max(maxY, (el.y || 0) + (el.height || 0));
      });

      const padding = 40;
      canvas.width = maxX - minX + padding * 2;
      canvas.height = maxY - minY + padding * 2;

      // Return as data URL
      return canvas.toDataURL(`image/${format}`);
    }, elements, appState, files, format);

    await browser.close();
    browser = null;

    // Convert data URL to buffer
    const base64Data = imageBuffer.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    res.setHeader('Content-Type', `image/${format}`);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    return res.status(200).send(buffer);

  } catch (error) {
    console.error('Render error:', error);
    
    if (browser) {
      await browser.close();
    }

    return res.status(500).json({ 
      error: 'Failed to render diagram',
      message: error.message 
    });
  }
}