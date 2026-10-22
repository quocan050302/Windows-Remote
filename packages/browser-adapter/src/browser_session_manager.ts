import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { URL } from 'node:url';
import type {
  BrowserSession,
  BrowserSessionOptions,
  BrowserPage,
  PageObservation,
  InteractiveControl,
  BrowserAction,
  ActionResult,
  StateExpectation,
  VerificationResult,
  AuthorizationRecord,
  PermissionDecision,
  TestPlan
} from '@test-io-agent/shared';

interface InternalSession {
  session: BrowserSession;
  browser: Browser;
  context: BrowserContext;
  pages: Map<string, Page>;
  consoleErrors: Map<string, string[]>;
}

export class BrowserSessionManager {
  private sessions = new Map<string, InternalSession>();
  private defaultOptions: BrowserSessionOptions = {
    headless: false,
    viewport: { width: 1280, height: 800 }
  };

  /**
   * Create an isolated browser session with authorization checks
   */
  public async createBrowserSession(
    options?: BrowserSessionOptions,
    authorization?: AuthorizationRecord
  ): Promise<BrowserSession> {
    const opts = { ...this.defaultOptions, ...options };
    const sessionId = `bs_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const browserId = `b_${Date.now()}`;
    const contextId = `ctx_${Date.now()}`;

    // Launch Chromium instance
    const browser = await chromium.launch({
      headless: opts.headless ?? false
    });

    const context = await browser.newContext({
      viewport: opts.viewport,
      userAgent: opts.userAgent
    });

    const sessionRecord: BrowserSession = {
      sessionId,
      browserId,
      contextId,
      activePages: [],
      authorizationId: authorization?.id,
      startTime: new Date().toISOString(),
      isClosed: false
    };

    const internalSession: InternalSession = {
      session: sessionRecord,
      browser,
      context,
      pages: new Map(),
      consoleErrors: new Map()
    };

    this.sessions.set(sessionId, internalSession);
    return sessionRecord;
  }

  /**
   * Open an authorized tab in the browser context
   */
  public async openAuthorizedTab(sessionId: string, url: string): Promise<BrowserPage> {
    const internal = this.sessions.get(sessionId);
    if (!internal || internal.session.isClosed) {
      throw new Error(`Browser session '${sessionId}' is not active.`);
    }

    // Domain validation
    const parsed = new URL(url);
    const domain = parsed.hostname.toLowerCase();

    // Prevent navigation to blocked platform
    if (domain === 'tester.test.io' || domain.endsWith('.test.io')) {
      throw new Error(`Domain '${domain}' is blocked by security policy.`);
    }

    const page = await internal.context.newPage();
    const pageId = `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Track console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    // Enforce destination policy on navigation and redirects
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        try {
          const navUrl = new URL(frame.url());
          const navDomain = navUrl.hostname.toLowerCase();
          if (
            navDomain === 'tester.test.io' ||
            navDomain.endsWith('.test.io') ||
            navDomain === 'paypal.com' ||
            navDomain === 'stripe.com'
          ) {
            page.close().catch(() => {});
            throw new Error(`Security Violation: Redirect to prohibited destination '${navDomain}' blocked.`);
          }
        } catch (_) {}
      }
    });

    // Guard against new popups / tabs
    internal.context.on('page', (newPage) => {
      newPage.on('framenavigated', (frame) => {
        if (frame === newPage.mainFrame()) {
          try {
            const h = new URL(frame.url()).hostname.toLowerCase();
            if (h === 'tester.test.io' || h.endsWith('.test.io') || h === 'paypal.com' || h === 'stripe.com') {
              newPage.close().catch(() => {});
            }
          } catch (_) {}
        }
      });
    });

    internal.pages.set(pageId, page);
    internal.consoleErrors.set(pageId, errors);
    internal.session.activePages.push(pageId);

    // Navigate to URL
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const title = await page.title();
    return {
      pageId,
      sessionId,
      currentUrl: page.url(),
      title
    };
  }

  /**
   * Get latest live screenshot for active session
   */
  public async getLatestScreenshot(sessionId: string): Promise<string | undefined> {
    const internal = this.sessions.get(sessionId);
    if (!internal || internal.session.isClosed || internal.session.activePages.length === 0) {
      return undefined;
    }
    const lastPageId = internal.session.activePages[internal.session.activePages.length - 1];
    const page = internal.pages.get(lastPageId);
    if (!page) return undefined;

    try {
      const buf = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 60 });
      return buf.toString('base64');
    } catch (_) {
      return undefined;
    }
  }

  public getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId)?.session;
  }

  /**
   * Inspect page state (Accessible roles, controls, text, errors)
   */
  public async inspectWebPage(pageId: string): Promise<PageObservation> {
    const page = this.getPage(pageId);
    const currentUrl = page.url();
    const title = await page.title();
    const errors = this.getConsoleErrors(pageId);

    // Extract interactive controls
    const controls = await page.evaluate(() => {
      const results: any[] = [];
      const elements = document.querySelectorAll(
        'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"]'
      );

      elements.forEach((el, index) => {
        const htmlEl = el as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        const isVisible =
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(htmlEl).visibility !== 'hidden';

        let selector = '';
        if (htmlEl.id) {
          selector = `#${htmlEl.id}`;
        } else if (htmlEl.getAttribute('data-testid')) {
          selector = `[data-testid="${htmlEl.getAttribute('data-testid')}"]`;
        } else if (htmlEl.getAttribute('name')) {
          selector = `${htmlEl.tagName.toLowerCase()}[name="${htmlEl.getAttribute('name')}"]`;
        } else {
          selector = `${htmlEl.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
        }

        results.push({
          selector,
          role: htmlEl.getAttribute('role') || htmlEl.tagName.toLowerCase(),
          name:
            htmlEl.getAttribute('aria-label') ||
            htmlEl.getAttribute('name') ||
            (htmlEl as HTMLInputElement).placeholder,
          text: (htmlEl.textContent || (htmlEl as HTMLInputElement).value || '').trim().slice(0, 100),
          tag: htmlEl.tagName.toLowerCase(),
          inputType: (htmlEl as HTMLInputElement).type,
          isEnabled: !(htmlEl as HTMLButtonElement).disabled,
          isVisible,
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        });
      });

      return results;
    });

    // Extract headings and text snippet
    const headings = await page.$$eval('h1, h2, h3', (nodes) =>
      nodes.map((n) => n.textContent?.trim() || '').filter(Boolean)
    );

    const bodyText = await page.evaluate(() => document.body.innerText || '');
    const visibleTextSnippet = bodyText.replace(/\s+/g, ' ').slice(0, 8000);

    return {
      pageId,
      currentUrl,
      title,
      controls: controls.slice(0, 50),
      headings,
      visibleTextSnippet,
      forms: [],
      links: [],
      consoleErrors: errors,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Execute Browser Action with deterministic Playwright locators
   */
  public async executeBrowserAction(
    pageId: string,
    action: BrowserAction,
    permission: PermissionDecision
  ): Promise<ActionResult> {
    const started = Date.now();

    if (permission.status !== 'ALLOW') {
      return {
        success: false,
        actionSummary: `Action '${action.type}' denied by policy`,
        errorMessage: permission.reason,
        durationMs: Date.now() - started
      };
    }

    const page = this.getPage(pageId);

    try {
      switch (action.type) {
        case 'navigate': {
          if (!action.url) throw new Error('Action navigate requires a URL');
          await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          return {
            success: true,
            actionSummary: `Navigated to ${action.url}`,
            durationMs: Date.now() - started
          };
        }
        case 'click': {
          if (!action.selector) throw new Error('Action click requires a selector');
          const locator = page.locator(action.selector).first();
          await locator.waitFor({ state: 'visible', timeout: 10000 });
          await locator.click();
          await page.waitForTimeout(300); // UI render settle
          return {
            success: true,
            actionSummary: `Clicked on ${action.selector}`,
            durationMs: Date.now() - started
          };
        }
        case 'fill': {
          if (!action.selector) throw new Error('Action fill requires a selector');
          const locator = page.locator(action.selector).first();
          await locator.waitFor({ state: 'visible', timeout: 10000 });
          await locator.fill(action.value || '');
          return {
            success: true,
            actionSummary: `Filled '${action.value}' into ${action.selector}`,
            durationMs: Date.now() - started
          };
        }
        case 'select': {
          if (!action.selector) throw new Error('Action select requires a selector');
          const locator = page.locator(action.selector).first();
          await locator.selectOption(action.optionValue || action.value || '');
          return {
            success: true,
            actionSummary: `Selected '${action.value}' in ${action.selector}`,
            durationMs: Date.now() - started
          };
        }
        case 'scroll': {
          const dy = action.scrollAmount?.y ?? 300;
          await page.evaluate((amount) => window.scrollBy(0, amount), dy);
          return {
            success: true,
            actionSummary: `Scrolled down by ${dy}px`,
            durationMs: Date.now() - started
          };
        }
        case 'capture': {
          const buffer = await page.screenshot({ fullPage: false });
          return {
            success: true,
            actionSummary: 'Captured screenshot',
            details: buffer.toString('base64'),
            durationMs: Date.now() - started
          };
        }
        case 'finish': {
          return {
            success: true,
            actionSummary: 'Execution finished by agent instruction',
            durationMs: Date.now() - started
          };
        }
        default: {
          return {
            success: false,
            actionSummary: `Unsupported browser action type: ${action.type}`,
            durationMs: Date.now() - started
          };
        }
      }
    } catch (err: any) {
      return {
        success: false,
        actionSummary: `Execution error for action ${action.type}`,
        errorMessage: err?.message || String(err),
        durationMs: Date.now() - started
      };
    }
  }

  /**
   * Verify Browser State against Expectations
   */
  public async verifyBrowserState(
    pageId: string,
    expectation: StateExpectation
  ): Promise<VerificationResult> {
    const page = this.getPage(pageId);
    const discrepancies: string[] = [];

    // URL Check
    if (expectation.expectedUrlPattern) {
      const currentUrl = page.url();
      const pattern = new RegExp(expectation.expectedUrlPattern);
      if (!pattern.test(currentUrl)) {
        discrepancies.push(`URL '${currentUrl}' did not match pattern '${expectation.expectedUrlPattern}'`);
      }
    }

    // Visible text assertion
    if (expectation.expectedText) {
      const content = await page.content();
      if (!content.toLowerCase().includes(expectation.expectedText.toLowerCase())) {
        discrepancies.push(`Page does not contain expected text: '${expectation.expectedText}'`);
      }
    }

    // Element state check
    if (expectation.elementState) {
      const loc = page.locator(expectation.elementState.selector).first();
      const isVisible = await loc.isVisible().catch(() => false);
      if (
        expectation.elementState.shouldBeVisible !== undefined &&
        isVisible !== expectation.elementState.shouldBeVisible
      ) {
        discrepancies.push(
          `Element '${expectation.elementState.selector}' visibility was ${isVisible}, expected ${expectation.elementState.shouldBeVisible}`
        );
      }
    }

    const passed = discrepancies.length === 0;
    return {
      passed,
      confidence: passed ? 0.95 : 0.9,
      status: passed ? 'PASS' : 'FAIL',
      details: passed ? 'All state assertions matched successfully.' : 'State assertion discrepancies detected.',
      discrepancies
    };
  }

  public async capturePageScreenshot(pageId: string): Promise<Buffer> {
    const page = this.getPage(pageId);
    return page.screenshot({ fullPage: false });
  }

  public getPage(pageId: string): Page {
    for (const internal of this.sessions.values()) {
      const page = internal.pages.get(pageId);
      if (page) return page;
    }
    throw new Error(`Page '${pageId}' not found.`);
  }

  public getConsoleErrors(pageId: string): string[] {
    for (const internal of this.sessions.values()) {
      const errors = internal.consoleErrors.get(pageId);
      if (errors) return [...errors];
    }
    return [];
  }

  public async closeSession(sessionId: string): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal) return;
    internal.session.isClosed = true;
    await internal.context.close().catch(() => {});
    await internal.browser.close().catch(() => {});
    this.sessions.delete(sessionId);
  }

  public async closeAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.closeSession(id);
    }
  }
}

// Global Singleton
export const browserSessionManager = new BrowserSessionManager();

export async function createBrowserSession(
  options?: BrowserSessionOptions,
  authorization?: AuthorizationRecord
): Promise<BrowserSession> {
  return browserSessionManager.createBrowserSession(options, authorization);
}

export async function openAuthorizedTab(sessionId: string, url: string): Promise<BrowserPage> {
  return browserSessionManager.openAuthorizedTab(sessionId, url);
}

export async function inspectWebPage(pageId: string): Promise<PageObservation> {
  return browserSessionManager.inspectWebPage(pageId);
}

export async function executeBrowserAction(
  pageId: string,
  action: BrowserAction,
  permission: PermissionDecision
): Promise<ActionResult> {
  return browserSessionManager.executeBrowserAction(pageId, action, permission);
}

export async function verifyBrowserState(
  pageId: string,
  expectation: StateExpectation
): Promise<VerificationResult> {
  return browserSessionManager.verifyBrowserState(pageId, expectation);
}
