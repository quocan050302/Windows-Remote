import test from 'node:test';
import * as assert from 'node:assert';
import { 
  detectAccessBlocker, 
  classifyPageAccessState, 
  verifyApplicationReady 
} from '../../packages/browser-adapter/src/access_blocker_detector.js';
import type { PageObservation } from '../../packages/shared/src/index.js';

test('Access Blocker - Correctly identifies Cloudflare Turnstile challenge', () => {
  const challengeObservation: PageObservation = {
    pageId: 'page_cf_1',
    currentUrl: 'https://www.nautal.com/en/',
    title: 'Just a moment... | Cloudflare Turnstile Verification',
    headings: ['Verify you are human', 'Checking if the site connection is secure'],
    visibleTextSnippet: 'Please stand by, while we verify your request. Performance & security by Cloudflare Turnstile. Ray ID: 8df293810283.',
    controls: [
      { tag: 'div', role: 'region', name: 'Turnstile Challenge', selector: '#cf-turnstile-wrapper', isVisible: true, isEnabled: true },
      { tag: 'div', role: 'checkbox', name: 'Verify you are human', selector: '.cf-turnstile', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const blocker = detectAccessBlocker(challengeObservation);
  assert.ok(blocker, 'Expected Cloudflare challenge to be detected');
  assert.strictEqual(blocker.blockerType, 'CLOUDFLARE_CHALLENGE');
  assert.strictEqual(blocker.accessState, 'SECURITY_CHALLENGE');
  assert.strictEqual(blocker.recommendedRunStatus, 'BLOCKED_SITE_VERIFICATION');
  assert.ok(blocker.signalsDetected.length >= 2);
  assert.ok(blocker.diagnosticDetails.includes('Cloudflare Turnstile'));

  const pageState = classifyPageAccessState(challengeObservation);
  assert.strictEqual(pageState, 'SECURITY_CHALLENGE');
});

test('Access Blocker - Detects 403 Forbidden / Access Denied page', () => {
  const forbiddenObservation: PageObservation = {
    pageId: 'page_403',
    currentUrl: 'https://target-portal.com/admin',
    title: '403 Forbidden - Access Denied',
    headings: ['Access Denied', '403 Forbidden'],
    visibleTextSnippet: 'You do not have permission to view this directory or page using the credentials that you supplied.',
    controls: [],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const blocker = detectAccessBlocker(forbiddenObservation);
  assert.ok(blocker);
  assert.strictEqual(blocker.blockerType, 'ACCESS_DENIED');
  assert.strictEqual(blocker.accessState, 'ACCESS_DENIED');
  assert.strictEqual(blocker.recommendedRunStatus, 'BLOCKED_SITE_VERIFICATION');
});

test('Access Blocker - Detects 429 Rate Limit page', () => {
  const rateLimitObservation: PageObservation = {
    pageId: 'page_429',
    currentUrl: 'https://api-target.com/',
    title: 'Too Many Requests',
    headings: ['429 Too Many Requests'],
    visibleTextSnippet: 'Rate limit exceeded. Please try again later.',
    controls: [],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const blocker = detectAccessBlocker(rateLimitObservation);
  assert.ok(blocker);
  assert.strictEqual(blocker.blockerType, 'RATE_LIMIT');
  assert.strictEqual(blocker.accessState, 'RATE_LIMITED');
});

test('Access Blocker - Normal application page is not blocked', () => {
  const normalObservation: PageObservation = {
    pageId: 'page_normal',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Demo Testing Lab - E-Commerce',
    headings: ['Discover Mediterranean Boat Charters', 'Featured Yachts'],
    visibleTextSnippet: 'Explore boat charter options with verified customer reviews.',
    controls: [
      { tag: 'button', role: 'button', name: 'Explore Fleet', selector: '#btn-explore-fleet', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [{ text: 'Destinations', href: '/destinations' }],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const blocker = detectAccessBlocker(normalObservation);
  assert.strictEqual(blocker, null);

  const state = classifyPageAccessState(normalObservation);
  assert.strictEqual(state, 'NORMAL_APPLICATION_PAGE');
});

test('Page Readiness - Rejects empty DOM or error page', () => {
  const emptyObservation: PageObservation = {
    pageId: 'empty_1',
    currentUrl: 'about:blank',
    title: '',
    headings: [],
    visibleTextSnippet: '',
    controls: [],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const ready = verifyApplicationReady(emptyObservation);
  assert.strictEqual(ready.isReady, false);
  assert.ok(ready.reason?.includes('blank') || ready.reason?.includes('unpopulated'));
});
