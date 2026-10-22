import test from 'node:test';
import * as assert from 'node:assert';
import { BrowserSessionManager } from '../../packages/browser-adapter/src/browser_session_manager.js';

test('Browser Adapter Integration - Launches Chromium, inspects Demo Lab, and clicks Add to Cart', async () => {
  const manager = new BrowserSessionManager();
  const session = await manager.createBrowserSession({ headless: true });
  assert.ok(session.sessionId);

  try {
    const page = await manager.openAuthorizedTab(session.sessionId, 'http://127.0.0.1:4173');
    assert.strictEqual(page.currentUrl, 'http://127.0.0.1:4173/');

    // Inspect page state
    const observation = await manager.inspectWebPage(page.pageId);
    assert.ok(observation.title.includes('Demo Testing Lab'));
    assert.ok(observation.controls.length > 0);

    // Perform click action on Add to Cart
    const actionResult = await manager.executeBrowserAction(
      page.pageId,
      {
        type: 'click',
        selector: '[data-testid="add-to-cart-1"]',
        reason: 'Add product 1 to cart',
        expectedObservation: 'Cart count incremented'
      },
      { status: 'ALLOW', reason: 'Permitted test interaction' }
    );

    assert.strictEqual(actionResult.success, true);

    // Capture screenshot
    const screenshot = await manager.capturePageScreenshot(page.pageId);
    assert.ok(screenshot.length > 0);
  } finally {
    await manager.closeSession(session.sessionId);
  }
});
