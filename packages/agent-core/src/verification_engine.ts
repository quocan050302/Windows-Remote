import type {
  BrowserAction,
  PageObservation,
  StateExpectation,
  VerificationResult,
  StepVerificationStatus
} from '@test-io-agent/shared';

/**
 * Evaluates the actual postcondition of an executed action by comparing
 * page state before and after the action against explicit testable expectations.
 *
 * Never marks a step PASS simply because the action executed without throwing.
 */
export function verifyActionPostcondition(
  action: BrowserAction,
  before: PageObservation,
  after: PageObservation,
  expected?: StateExpectation
): VerificationResult {
  const discrepancies: string[] = [];
  let evaluatedExpectation = false;

  // 1. Navigation Actions
  if (action.type === 'navigate') {
    evaluatedExpectation = true;
    const targetUrl = (action.url || '').toLowerCase();
    const currentUrl = (after.currentUrl || '').toLowerCase();

    if (targetUrl && !currentUrl.includes(targetUrl.replace(/^https?:\/\//, '').split('?')[0])) {
      discrepancies.push(
        `Navigation postcondition failed: Expected URL containing '${targetUrl}', but page is on '${after.currentUrl}'`
      );
    }

    if (after.visibleTextSnippet.length < 20 && after.controls.length === 0) {
      discrepancies.push('Page content appears blank or failed to render after navigation');
    }

    const passed = discrepancies.length === 0;
    return {
      passed,
      confidence: passed ? 0.95 : 0.8,
      status: passed ? 'PASS' : 'FAIL',
      details: passed
        ? `Successfully navigated to '${after.currentUrl}' and observed page content.`
        : discrepancies.join('; '),
      discrepancies
    };
  }

  // 2. Explicit Expectation: Numeric Calculation (e.g. cart subtotal, discount, total calculation)
  if (expected?.numericCalculation) {
    evaluatedExpectation = true;
    const expectedVal = expected.numericCalculation.expected;
    const match = after.visibleTextSnippet.match(/Total:\s*\$?([\d\.]+)/i);

    if (match) {
      const actualVal = parseFloat(match[1]);
      if (Math.abs(actualVal - expectedVal) > 0.01) {
        discrepancies.push(
          `Numeric calculation mismatch: Page shows $${actualVal.toFixed(2)}, expected calculation is $${expectedVal.toFixed(2)}`
        );
      }
    } else {
      discrepancies.push(
        `Expected calculated total of $${expectedVal.toFixed(2)}, but no total figure was found in page observation.`
      );
    }
  }

  // 3. Explicit Expectation: Expected Text Presence
  if (expected?.expectedText) {
    evaluatedExpectation = true;
    const expectedLower = expected.expectedText.toLowerCase();
    const afterText = after.visibleTextSnippet.toLowerCase();

    if (!afterText.includes(expectedLower)) {
      discrepancies.push(
        `Postcondition text verification failed: Expected text '${expected.expectedText}' was not observed.`
      );
    }
  }

  // 4. Explicit Expectation: Element Visibility / State
  if (expected?.elementState) {
    evaluatedExpectation = true;
    const targetSel = expected.elementState.selector.toLowerCase();
    const foundControl = after.controls.find(
      (c) => c.selector.toLowerCase() === targetSel || c.selector.toLowerCase().includes(targetSel)
    );

    if (expected.elementState.shouldBeVisible) {
      if (!foundControl || !foundControl.isVisible) {
        discrepancies.push(
          `Element state postcondition failed: Element '${expected.elementState.selector}' is not visible.`
        );
      }
    }
  }

  // 5. Differential Postconditions for Specific Action Types
  if (action.type === 'click') {
    const sel = (action.selector || '').toLowerCase();

    // A. Carousel next/prev click verification
    if (sel.includes('carousel') || sel.includes('slide') || sel.includes('next') || sel.includes('prev')) {
      evaluatedExpectation = true;
      // In a carousel, the active slide indicator or text snippet should differ
      const beforeSnippet = before.visibleTextSnippet;
      const afterSnippet = after.visibleTextSnippet;
      const textChanged = beforeSnippet !== afterSnippet;

      // Check active slide indicator change
      const beforeActive = (before.controls || []).find((c) => c.selector.includes('active') || (c.text || '').includes('Slide'));
      const afterActive = (after.controls || []).find((c) => c.selector.includes('active') || (c.text || '').includes('Slide'));
      const slideChanged = beforeActive?.selector !== afterActive?.selector || beforeActive?.text !== afterActive?.text;

      if (!textChanged && !slideChanged) {
        discrepancies.push(
          `Carousel click on '${action.selector}' did not change active slide or page content.`
        );
      }
    }

    // B. Expandable section / Accordion / FAQ click verification
    else if (sel.includes('accordion') || sel.includes('expand') || sel.includes('collapse') || sel.includes('faq')) {
      evaluatedExpectation = true;
      const controlsCountChanged = before.controls.length !== after.controls.length;
      const textChanged = before.visibleTextSnippet.length !== after.visibleTextSnippet.length;

      if (!controlsCountChanged && !textChanged) {
        discrepancies.push(
          `Accordion/expandable toggle on '${action.selector}' did not expand or reveal new content.`
        );
      }
    }

    // C. CTA Button Click verification
    else if (sel.includes('cta') || sel.includes('btn') || sel.includes('cart') || sel.includes('add')) {
      evaluatedExpectation = true;
      const urlChanged = before.currentUrl !== after.currentUrl;
      const textChanged = before.visibleTextSnippet !== after.visibleTextSnippet;

      if (!urlChanged && !textChanged) {
        discrepancies.push(
          `CTA click on '${action.selector}' produced no visible state change, modal, or navigation.`
        );
      }
    }
  }

  // Check JavaScript console errors introduced by the action
  const newErrors = after.consoleErrors.filter((e) => !before.consoleErrors.includes(e));
  if (newErrors.length > 0) {
    discrepancies.push(`Action triggered JavaScript error: ${newErrors.join('; ')}`);
  }

  // If no explicit expectation was defined or checked, return UNVERIFIED
  if (!evaluatedExpectation) {
    return {
      passed: false,
      confidence: 0.5,
      status: 'UNVERIFIED',
      details:
        'No explicit testable postcondition (expected URL, text, element state, or differential change) was evaluated.',
      discrepancies: []
    };
  }

  const passed = discrepancies.length === 0;
  return {
    passed,
    confidence: passed ? 0.95 : 0.85,
    status: passed ? 'PASS' : 'FAIL',
    details: passed
      ? 'Action postcondition explicitly verified against expected state.'
      : discrepancies.join('; '),
    discrepancies
  };
}
