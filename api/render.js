/**
 * Excalidraw Render API
 * POST /api/render
 * 
 * Request body:
 * {
 *   "elements": [...], // Excalidraw elements array
 *   "appState": {      // Optional
 *     "viewBackgroundColor": "#ffffff",
 *     "exportWithDarkMode": false
 *   },
 *   "files": {},       // Optional - for images in diagram
 *   "format": "png",   // png, svg, or json (default: png)
 *   "scale": 2         // Export scale (default: 2)
 * }
 */

import { createCanvas } from 'canvas';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { elements, appState = {}, files = {}, format = 'png', scale = 2 } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ 
        error: 'Invalid request. "elements" array is required.' 
      });
    }

    // For SVG export, we can generate it directly
    if (format === 'svg') {
      const svg = await generateSVG(elements, appState, files);
      res.setHeader('Content-Type', 'image/svg+xml');
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      return res.status(200).send(svg);
    }

    // For JSON export (return processed elements)
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      Object.entries(corsHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      return res.status(200).json({
        elements,
        appState,
        files
      });
    }

    // For PNG, we need to use canvas rendering
    // Note: This is a simplified version. For production, use Puppeteer or Playwright
    const imageBuffer = await renderToPNG(elements, appState, scale);

    res.setHeader('Content-Type', 'image/png');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).send(imageBuffer);

  } catch (error) {
    console.error('Render error:', error);
    return res.status(500).json({ 
      error: 'Failed to render diagram',
      message: error.message 
    });
  }
}

// Simple SVG generation
async function generateSVG(elements, appState, files) {
  const { viewBackgroundColor = '#ffffff' } = appState;
  
  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  });

  const width = maxX - minX + 40;
  const height = maxY - minY + 40;
  const offsetX = -minX + 20;
  const offsetY = -minY + 20;

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
     xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${viewBackgroundColor}"/>
  <g transform="translate(${offsetX}, ${offsetY})">`;

  // Render elements
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;

    const strokeColor = el.strokeColor || '#1e1e1e';
    const backgroundColor = el.backgroundColor || 'transparent';
    const strokeWidth = el.strokeWidth || 2;
    const opacity = (el.opacity || 100) / 100;

    if (el.type === 'rectangle') {
      const roundness = el.roundness?.type === 3 ? 8 : 0;
      svgContent += `
    <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" 
          rx="${roundness}" ry="${roundness}"
          fill="${backgroundColor}" stroke="${strokeColor}" 
          stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
      
      if (el.label?.text) {
        svgContent += `
    <text x="${el.x + el.width/2}" y="${el.y + el.height/2}" 
          text-anchor="middle" dominant-baseline="middle"
          font-size="${el.label.fontSize || 20}" fill="${strokeColor}">${el.label.text}</text>`;
      }
    } else if (el.type === 'ellipse') {
      svgContent += `
    <ellipse cx="${el.x + el.width/2}" cy="${el.y + el.height/2}" 
             rx="${el.width/2}" ry="${el.height/2}"
             fill="${backgroundColor}" stroke="${strokeColor}" 
             stroke-width="${strokeWidth}" opacity="${opacity}"/>`;
      
      if (el.label?.text) {
        svgContent += `
    <text x="${el.x + el.width/2}" y="${el.y + el.height/2}" 
          text-anchor="middle" dominant-baseline="middle"
          font-size="${el.label.fontSize || 20}" fill="${strokeColor}">${el.label.text}</text>`;
      }
    } else if (el.type === 'arrow' || el.type === 'line') {
      if (el.points && el.points.length >= 2) {
        const strokeDasharray = el.strokeStyle === 'dashed' ? '5,5' : 'none';
        let pathData = `M ${el.x + el.points[0][0]} ${el.y + el.points[0][1]}`;
        for (let i = 1; i < el.points.length; i++) {
          pathData += ` L ${el.x + el.points[i][0]} ${el.y + el.points[i][1]}`;
        }
        svgContent += `
    <path d="${pathData}" stroke="${strokeColor}" 
          stroke-width="${strokeWidth}" fill="none" 
          stroke-dasharray="${strokeDasharray}"
          ${el.endArrowhead === 'arrow' ? 'marker-end="url(#arrowhead)"' : ''}/>`;
      }
    } else if (el.type === 'text') {
      svgContent += `
    <text x="${el.x}" y="${el.y}" font-size="${el.fontSize || 20}" 
          fill="${strokeColor}">${el.text || ''}</text>`;
    }
  });

  svgContent += `
  </g>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" 
            refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#1e1e1e"/>
    </marker>
  </defs>
</svg>`;

  return svgContent;
}

// Simplified PNG rendering (for production, use Puppeteer)
async function renderToPNG(elements, appState, scale) {
  // Calculate dimensions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + (el.width || 0));
    maxY = Math.max(maxY, el.y + (el.height || 0));
  });

  const width = (maxX - minX + 40) * scale;
  const height = (maxY - minY + 40) * scale;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = appState.viewBackgroundColor || '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Apply scale and offset
  ctx.scale(scale, scale);
  ctx.translate(-minX + 20, -minY + 20);

  // Simple rendering (basic shapes only)
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;

    ctx.strokeStyle = el.strokeColor || '#1e1e1e';
    ctx.fillStyle = el.backgroundColor || 'transparent';
    ctx.lineWidth = el.strokeWidth || 2;
    ctx.globalAlpha = (el.opacity || 100) / 100;

    if (el.type === 'rectangle') {
      if (el.backgroundColor && el.backgroundColor !== 'transparent') {
        ctx.fillRect(el.x, el.y, el.width, el.height);
      }
      ctx.strokeRect(el.x, el.y, el.width, el.height);
      
      if (el.label?.text) {
        ctx.font = `${el.label.fontSize || 20}px sans-serif`;
        ctx.fillStyle = el.strokeColor || '#1e1e1e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label.text, el.x + el.width/2, el.y + el.height/2);
      }
    }
  });

  return canvas.toBuffer('image/png');
}