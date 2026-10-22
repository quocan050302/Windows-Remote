import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.DEMO_LAB_PORT || '4173', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// Global Bug Configuration State
export const bugConfig = {
  buildMode: 'BUGGY_BUILD', // 'BUGGY_BUILD' | 'FIXED_BUILD'
  bugs: {
    BUG_CART_TOTAL_CALCULATION: true,
    BUG_EMAIL_VALIDATION_REGEX: true,
    BUG_REQUIRED_FIELD_BYPASS: true,
    BUG_SORT_PRICE_INVERTED: true,
    BUG_SEARCH_MISSING_RESULTS: true,
    BUG_CHECKOUT_BUTTON_UNRESPONSIVE: true,
    BUG_NAV_TAB_MISMATCH: true,
    BUG_TEXT_OVERFLOW: true,
    BUG_FORM_SUBMIT_WRONG_STATE: true,
    BUG_MOCK_CHATBOT_RULE_FAIL: true
  }
};

export function setBuildMode(mode) {
  bugConfig.buildMode = mode;
  const isBuggy = mode === 'BUGGY_BUILD';
  for (const key of Object.keys(bugConfig.bugs)) {
    bugConfig.bugs[key] = isBuggy;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(bugConfig));
    return;
  }

  if (pathname === '/api/set-build' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        setBuildMode(data.mode || 'BUGGY_BUILD');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, bugConfig }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'text/plain';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Server Error: ${err.message}`);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Demo Testing Lab running at http://127.0.0.1:${PORT} (Mode: ${bugConfig.buildMode})`);
  });
}
