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
    BUG_CAROUSEL_NEXT_BROKEN: true,
    BUG_ACCORDION_EMPTY_CONTENT: true,
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

const CHALLENGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Just a moment...</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fafafa; color: #333; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .challenge-container { max-width: 480px; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
    .cf-turnstile { width: 300px; height: 65px; border: 1px solid #ddd; margin: 1.5rem auto; display: flex; align-items: center; justify-content: center; background: #f9f9f9; }
    .footer { margin-top: 2rem; font-size: 0.8rem; color: #888; }
  </style>
</head>
<body>
  <div class="challenge-container">
    <h1>www.nautal.com</h1>
    <h2>Checking if the site connection is secure</h2>
    <p>Enable JavaScript and cookies to continue</p>
    <div id="challenge-form" class="cf-turnstile" data-translate="turnstile">
      <input type="checkbox" id="cf-turnstile-checkbox" style="margin-right: 0.5rem;" />
      <label for="cf-turnstile-checkbox">Verify you are human</label>
    </div>
    <p style="font-size: 0.85rem; color: #666;">This process is automatic. Your browser will redirect to your requested content shortly.</p>
    <div class="footer">
      <div>Ray ID: 8e5a7bc12d8a9f01</div>
      <div>Performance & security by Cloudflare</div>
    </div>
  </div>
</body>
</html>`;

export const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // Cloudflare / Security challenge simulation route
  if (pathname === '/challenge' || pathname === '/cloudflare' || pathname === '/security-check') {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(CHALLENGE_HTML);
    return;
  }

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
