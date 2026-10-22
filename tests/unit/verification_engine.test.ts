import test from 'node:test';
import * as assert from 'node:assert';
import { verifyActionPostcondition } from '../../packages/agent-core/src/verification_engine.js';
import type { PageObservation, BrowserAction } from '../../packages/shared/src/index.js';

test('Verification Engine - Evaluates destination URL transition', () => {
  const beforeObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: ['Welcome'],
    visibleTextSnippet: 'Home page content',
    controls: [{ tag: 'a', role: 'link', name: 'Fleet', selector: '#nav-fleet', isVisible: true, isEnabled: true }],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const afterObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/fleet',
    title: 'Our Fleet',
    headings: ['Available Fleet'],
    visibleTextSnippet: 'Fleet list: Catamarans, Sailboats',
    controls: [],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const action: BrowserAction = {
    type: 'navigate',
    url: 'http://127.0.0.1:4173/fleet',
    reason: 'Navigate to fleet page',
    expectedObservation: 'Fleet list displayed'
  };

  // 1. Matches expected destination -> PASS
  const resultPass = verifyActionPostcondition(action, beforeObs, afterObs);
  assert.strictEqual(resultPass.status, 'PASS');
  assert.strictEqual(resultPass.passed, true);

  // 2. Mismatch in expected destination -> FAIL
  const failAction: BrowserAction = {
    type: 'navigate',
    url: 'http://127.0.0.1:4173/checkout',
    reason: 'Navigate to checkout',
    expectedObservation: 'Checkout form displayed'
  };
  const resultFail = verifyActionPostcondition(failAction, beforeObs, afterObs);
  assert.strictEqual(resultFail.status, 'FAIL');
  assert.strictEqual(resultFail.passed, false);
});

test('Verification Engine - Evaluates carousel active slide change', () => {
  const beforeObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: [],
    visibleTextSnippet: 'Featured Luxury Yacht 1',
    controls: [
      { tag: 'button', role: 'button', name: 'Next', selector: '#btn-carousel-next', isVisible: true, isEnabled: true },
      { tag: 'div', role: 'img', name: 'Slide 1 active', selector: '.slide.active[data-index="0"]', text: 'Slide 1', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const afterObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: [],
    visibleTextSnippet: 'Featured Luxury Yacht 2',
    controls: [
      { tag: 'button', role: 'button', name: 'Next', selector: '#btn-carousel-next', isVisible: true, isEnabled: true },
      { tag: 'div', role: 'img', name: 'Slide 2 active', selector: '.slide.active[data-index="1"]', text: 'Slide 2', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const action: BrowserAction = {
    type: 'click',
    selector: '#btn-carousel-next',
    reason: 'Advance carousel',
    expectedObservation: 'Next slide is visible'
  };

  // Carousel slide change automatically verified differential postcondition
  const result = verifyActionPostcondition(action, beforeObs, afterObs);
  assert.strictEqual(result.status, 'PASS');
  assert.strictEqual(result.passed, true);
});

test('Verification Engine - Evaluates accordion expandable section expansion', () => {
  const beforeObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: [],
    visibleTextSnippet: 'FAQ Section',
    controls: [
      { tag: 'button', role: 'button', name: 'Do I need a sailing license?', selector: '#faq-btn-1', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const afterObs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: [],
    visibleTextSnippet: 'FAQ Section: A valid skipper license is required for bareboat charters.',
    controls: [
      { tag: 'button', role: 'button', name: 'Do I need a sailing license?', selector: '#faq-btn-1', isVisible: true, isEnabled: true },
      { tag: 'div', role: 'region', name: 'FAQ 1 Content', selector: '#faq-content-1', isVisible: true, isEnabled: true }
    ],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const action: BrowserAction = {
    type: 'click',
    selector: '#faq-btn-1',
    reason: 'Expand FAQ accordion',
    expectedObservation: 'FAQ answer revealed'
  };

  const result = verifyActionPostcondition(action, beforeObs, afterObs);
  assert.strictEqual(result.status, 'PASS');
  assert.strictEqual(result.passed, true);
});

test('Verification Engine - Missing testable expectations returns UNVERIFIED (never false PASS)', () => {
  const obs: PageObservation = {
    pageId: 'p1',
    currentUrl: 'http://127.0.0.1:4173/',
    title: 'Home',
    headings: [],
    visibleTextSnippet: 'Static page content with no changes',
    controls: [],
    forms: [],
    links: [],
    consoleErrors: [],
    timestamp: new Date().toISOString()
  };

  const action: BrowserAction = {
    type: 'click',
    selector: '#unrelated-element',
    reason: 'Arbitrary click',
    expectedObservation: 'No expectation'
  };

  // No explicit expected postconditions provided and no differential change occurred
  const result = verifyActionPostcondition(action, obs, obs);
  assert.strictEqual(result.status, 'UNVERIFIED');
  assert.strictEqual(result.passed, false);
});
