#!/usr/bin/env node

/**
 * Simple HTML build script that processes include directives
 * Usage: node build-html.js
 * 
 * Reads src/renderer/index.html and processes <!-- include: path/to/file.html --> directives
 * Creates a built version with all partials inlined
 */

const fs = require('fs');
const path = require('path');

const SOURCE_HTML = path.join(__dirname, 'src/renderer/index.html');
const OUTPUT_HTML = path.join(__dirname, 'src/renderer/index.built.html');

console.log('🔨 Building HTML with includes...');

try {
  // Read the source HTML
  let html = fs.readFileSync(SOURCE_HTML, 'utf-8');
  
  // Process all include directives
  const includeRegex = /<!--\s*include:\s*([^\s]+)\s*-->/g;
  let match;
  let processedCount = 0;
  
  while ((match = includeRegex.exec(html)) !== null) {
    const partialPath = match[1];
    const fullPath = path.join(__dirname, 'src/renderer', partialPath);
    
    try {
      const partialContent = fs.readFileSync(fullPath, 'utf-8');
      html = html.replace(match[0], partialContent);
      console.log(`  ✓ Included: ${partialPath}`);
      processedCount++;
    } catch (error) {
      console.error(`  ✗ Failed to include ${partialPath}:`, error.message);
    }
  }
  
  // Write the output
  fs.writeFileSync(OUTPUT_HTML, html);
  
  console.log(`✅ Built HTML successfully (${processedCount} includes processed)`);
  console.log(`   Output: ${OUTPUT_HTML}`);
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

