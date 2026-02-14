/**
 * Excalidraw Render API - SVG Export (Vercel Compatible)
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
 *   "format": "svg"    // Only SVG supported (no canvas dependencies)
 * }
 */

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type')
      .end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { elements, appState = {}, files = {}, format = 'svg' } = req.body;

    if (!elements || !Array.isArray(elements)) {
      return res.status(400).json({ 
        error: 'Invalid request. "elements" array is required.' 
      });
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

    // Generate SVG
    const svg = generateSVG(elements, appState, files);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).send(svg);

  } catch (error) {
    console.error('Render error:', error);
    return res.status(500).json({ 
      error: 'Failed to render diagram',
      message: error.message 
    });
  }
}

// SVG generation function
function generateSVG(elements, appState, files) {
  const { viewBackgroundColor = '#ffffff' } = appState;
  
  // Calculate bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;
    minX = Math.min(minX, el.x || 0);
    minY = Math.min(minY, el.y || 0);
    maxX = Math.max(maxX, (el.x || 0) + (el.width || 0));
    maxY = Math.max(maxY, (el.y || 0) + (el.height || 0));
  });

  // Add padding
  const padding = 40;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" 
     xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" 
            refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <polygon points="0 0, 10 3, 0 6" fill="#1e1e1e"/>
    </marker>
    <marker id="arrowhead-blue" markerWidth="10" markerHeight="10" 
            refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <polygon points="0 0, 10 3, 0 6" fill="#4a9eed"/>
    </marker>
    <marker id="arrowhead-purple" markerWidth="10" markerHeight="10" 
            refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <polygon points="0 0, 10 3, 0 6" fill="#8b5cf6"/>
    </marker>
    <marker id="arrowhead-green" markerWidth="10" markerHeight="10" 
            refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
      <polygon points="0 0, 10 3, 0 6" fill="#22c55e"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${viewBackgroundColor}"/>
  <g transform="translate(${offsetX}, ${offsetY})">`;

  // Render elements
  elements.forEach(el => {
    if (el.type === 'cameraUpdate' || el.type === 'delete') return;

    const strokeColor = el.strokeColor || '#1e1e1e';
    const backgroundColor = el.backgroundColor || 'transparent';
    const strokeWidth = el.strokeWidth || 2;
    const opacity = (el.opacity || 100) / 100;
    const strokeStyle = el.strokeStyle || 'solid';
    const strokeDasharray = strokeStyle === 'dashed' ? '5,5' : strokeStyle === 'dotted' ? '2,2' : 'none';

    if (el.type === 'rectangle') {
      const roundness = el.roundness?.type === 3 ? 8 : 0;
      svgContent += `
    <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" 
          rx="${roundness}" ry="${roundness}"
          fill="${backgroundColor}" stroke="${strokeColor}" 
          stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}"
          opacity="${opacity}"/>`;
      
      if (el.label?.text) {
        const fontSize = el.label.fontSize || 20;
        const lines = el.label.text.split('\n');
        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        const startY = el.y + el.height/2 - totalHeight/2 + fontSize;
        
        lines.forEach((line, i) => {
          svgContent += `
    <text x="${el.x + el.width/2}" y="${startY + i * lineHeight}" 
          text-anchor="middle" dominant-baseline="middle"
          font-family="sans-serif" font-size="${fontSize}" 
          fill="${strokeColor}">${escapeXml(line)}</text>`;
        });
      }
    } else if (el.type === 'ellipse') {
      svgContent += `
    <ellipse cx="${el.x + el.width/2}" cy="${el.y + el.height/2}" 
             rx="${el.width/2}" ry="${el.height/2}"
             fill="${backgroundColor}" stroke="${strokeColor}" 
             stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}"
             opacity="${opacity}"/>`;
      
      if (el.label?.text) {
        const fontSize = el.label.fontSize || 20;
        svgContent += `
    <text x="${el.x + el.width/2}" y="${el.y + el.height/2}" 
          text-anchor="middle" dominant-baseline="middle"
          font-family="sans-serif" font-size="${fontSize}" 
          fill="${strokeColor}">${escapeXml(el.label.text)}</text>`;
      }
    } else if (el.type === 'diamond') {
      const cx = el.x + el.width/2;
      const cy = el.y + el.height/2;
      const points = `${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`;
      svgContent += `
    <polygon points="${points}"
             fill="${backgroundColor}" stroke="${strokeColor}" 
             stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}"
             opacity="${opacity}"/>`;
      
      if (el.label?.text) {
        const fontSize = el.label.fontSize || 20;
        svgContent += `
    <text x="${cx}" y="${cy}" 
          text-anchor="middle" dominant-baseline="middle"
          font-family="sans-serif" font-size="${fontSize}" 
          fill="${strokeColor}">${escapeXml(el.label.text)}</text>`;
      }
    } else if (el.type === 'arrow' || el.type === 'line') {
      if (el.points && el.points.length >= 2) {
        let pathData = `M ${el.x + el.points[0][0]} ${el.y + el.points[0][1]}`;
        for (let i = 1; i < el.points.length; i++) {
          pathData += ` L ${el.x + el.points[i][0]} ${el.y + el.points[i][1]}`;
        }
        
        // Determine marker color based on stroke color
        let markerId = 'arrowhead';
        if (strokeColor.includes('4a9eed')) markerId = 'arrowhead-blue';
        else if (strokeColor.includes('8b5cf6')) markerId = 'arrowhead-purple';
        else if (strokeColor.includes('22c55e')) markerId = 'arrowhead-green';
        
        svgContent += `
    <path d="${pathData}" stroke="${strokeColor}" 
          stroke-width="${strokeWidth}" fill="none" 
          stroke-dasharray="${strokeDasharray}"
          opacity="${opacity}"
          ${el.endArrowhead === 'arrow' ? `marker-end="url(#${markerId})"` : ''}/>`;
        
        if (el.label?.text) {
          const fontSize = el.label.fontSize || 14;
          const midIdx = Math.floor(el.points.length / 2);
          const midX = el.x + el.points[midIdx][0];
          const midY = el.y + el.points[midIdx][1];
          svgContent += `
    <text x="${midX}" y="${midY - 5}" 
          text-anchor="middle" font-family="sans-serif"
          font-size="${fontSize}" fill="${strokeColor}">${escapeXml(el.label.text)}</text>`;
        }
      }
    } else if (el.type === 'text') {
      const fontSize = el.fontSize || 20;
      const lines = (el.text || '').split('\n');
      const lineHeight = fontSize * 1.2;
      
      lines.forEach((line, i) => {
        svgContent += `
    <text x="${el.x}" y="${el.y + fontSize + i * lineHeight}" 
          font-family="sans-serif" font-size="${fontSize}" 
          fill="${strokeColor}">${escapeXml(line)}</text>`;
      });
    }
  });

  svgContent += `
  </g>
</svg>`;

  return svgContent;
}

// Helper function to escape XML special characters
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}