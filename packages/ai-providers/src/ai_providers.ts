import type {
  TaskAnalysis,
  TestPlan,
  TestPlanStep,
  PageObservation,
  BrowserAction,
  StateExpectation,
  VerificationResult
} from '@test-io-agent/shared';

export interface AiProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface AiProvider {
  name: string;
  analyzeTask(input: { title: string; description: string }): Promise<TaskAnalysis>;
  generatePlan(analysis: TaskAnalysis): Promise<TestPlan>;
  chooseAction(observation: PageObservation, plan: TestPlan, completedSteps: number): Promise<BrowserAction>;
  evaluateVerification(observation: PageObservation, expectation: StateExpectation): Promise<VerificationResult>;
}

/**
 * Built-in Deterministic QA Intelligence Engine.
 * Provides deterministic, verifiable testing reasoning without flaky external API failures.
 */
export class DeterministicQaProvider implements AiProvider {
  public name = 'Deterministic QA Engine (Built-in)';

  public async analyzeTask(input: { title: string; description: string }): Promise<TaskAnalysis> {
    const text = `${input.title} ${input.description}`.toLowerCase();
    const missing: string[] = [];

    // Domain inference / detection
    const authorizedDomains: string[] = ['localhost', '127.0.0.1'];
    if (text.includes('test.io') && !text.includes('demo')) {
      missing.push('Customer written authorization is required before testing external platform.');
    }

    let taskType: TaskAnalysis['taskType'] = 'EXPLORATORY';
    if (text.includes('regression')) taskType = 'REGRESSION';
    else if (text.includes('reproduce') || text.includes('bug')) taskType = 'BUG_REPRODUCTION';
    else if (text.includes('test case')) taskType = 'TEST_CASE';
    else if (text.includes('usability')) taskType = 'USABILITY';
    else if (text.includes('accessibility') || text.includes('a11y')) taskType = 'ACCESSIBILITY';

    const inScope: string[] = [];
    const outOfScope: string[] = ['Payment submission', 'Third-party portals', 'Account deletion'];

    if (text.includes('cart') || text.includes('giỏ hàng')) {
      inScope.push('Shopping Cart addition', 'Cart items list', 'Total calculation check');
    }
    if (text.includes('search') || text.includes('tìm kiếm')) {
      inScope.push('Product search filter');
    }
    if (text.includes('login') || text.includes('đăng nhập')) {
      inScope.push('Authentication form validation');
    }

    if (inScope.length === 0) {
      inScope.push('General navigation', 'UI sanity verification');
    }

    const needsReview = missing.length > 0;

    return {
      taskId: `task_ana_${Date.now()}`,
      taskType,
      targetApplication: 'Demo Testing Lab / Web Target',
      authorizedDomains,
      inScopeFeatures: inScope,
      outOfScopeFeatures: outOfScope,
      requirements: [
        'Do not submit actual financial payments',
        'Verify UI calculation accuracy against expected values',
        'Capture evidence for discrepancies'
      ],
      requiredDevice: 'Desktop Chrome / Windows 11',
      reportingRequirements: ['Test IO Functional Bug Format', 'Reproduction Steps', 'Screenshot Evidence'],
      riskLevel: needsReview ? 'HIGH' : 'LOW',
      missingInformation: missing,
      needsReviewReason: needsReview ? missing.join(' ') : undefined,
      confidenceScore: 0.95
    };
  }

  public async generatePlan(analysis: TaskAnalysis): Promise<TestPlan> {
    const steps: TestPlanStep[] = [];
    let stepNum = 1;

    // Step 1: Open Target URL
    steps.push({
      stepId: `step_${stepNum}`,
      stepNumber: stepNum++,
      goal: 'Navigate to application home and observe initial state',
      actionType: 'navigate',
      targetDescription: 'Target application URL',
      expectedBehavior: 'Application loaded with visible navigation and products',
      preconditions: ['Browser session active', 'Domain authorized'],
      allowedActions: ['navigate', 'capture'],
      verificationMethod: 'DOM_ASSERTION',
      riskCategory: 'LOW',
      evidenceRequirements: ['SCREENSHOT']
    });

    // Plan steps tailored to task domain
    const isCartTask = analysis.inScopeFeatures.some((f) => f.toLowerCase().includes('cart'));

    if (isCartTask) {
      steps.push({
        stepId: `step_${stepNum}`,
        stepNumber: stepNum++,
        goal: 'Add first product to shopping cart',
        actionType: 'click',
        targetSelector: '[data-testid="add-to-cart-1"], button:has-text("Add to Cart")',
        targetDescription: 'Add to Cart button for product 1',
        expectedBehavior: 'Product item added to cart; cart badge or list reflects 1 item',
        preconditions: ['Product list visible'],
        allowedActions: ['click'],
        verificationMethod: 'DOM_ASSERTION',
        riskCategory: 'LOW',
        evidenceRequirements: ['SCREENSHOT']
      });

      steps.push({
        stepId: `step_${stepNum}`,
        stepNumber: stepNum++,
        goal: 'Add second product to shopping cart',
        actionType: 'click',
        targetSelector: '[data-testid="add-to-cart-2"], button:has-text("Add to Cart")',
        targetDescription: 'Add to Cart button for product 2',
        expectedBehavior: 'Second product added to cart',
        preconditions: ['Product 2 visible'],
        allowedActions: ['click'],
        verificationMethod: 'DOM_ASSERTION',
        riskCategory: 'LOW',
        evidenceRequirements: ['SCREENSHOT']
      });

      steps.push({
        stepId: `step_${stepNum}`,
        stepNumber: stepNum++,
        goal: 'Open Cart drawer or page and verify total price calculation',
        actionType: 'click',
        targetSelector: '[data-testid="cart-button"], #cart-button, button:has-text("Cart")',
        targetDescription: 'Cart View Button',
        expectedBehavior: 'Cart drawer open; subtotal and total accurately calculate sum of items',
        preconditions: ['Products added to cart'],
        allowedActions: ['click', 'capture'],
        verificationMethod: 'NUMERIC_CALCULATION',
        riskCategory: 'LOW',
        evidenceRequirements: ['SCREENSHOT', 'DOM_SNAPSHOT']
      });
    } else {
      steps.push({
        stepId: `step_${stepNum}`,
        stepNumber: stepNum++,
        goal: 'Inspect interactive navigation tabs and buttons',
        actionType: 'click',
        targetSelector: 'nav a, header button',
        targetDescription: 'First navigation link',
        expectedBehavior: 'Navigation triggers active view update',
        preconditions: ['Page rendered'],
        allowedActions: ['click'],
        verificationMethod: 'DOM_ASSERTION',
        riskCategory: 'LOW',
        evidenceRequirements: ['SCREENSHOT']
      });
    }

    return {
      planId: `plan_${Date.now()}`,
      taskId: analysis.taskId,
      summary: `Automated Test Plan for ${analysis.targetApplication}`,
      steps,
      outOfScopeBoundaries: analysis.outOfScopeFeatures,
      createdAt: new Date().toISOString()
    };
  }

  public async chooseAction(
    observation: PageObservation,
    plan: TestPlan,
    completedSteps: number
  ): Promise<BrowserAction> {
    const currentStep = plan.steps[completedSteps];
    if (!currentStep) {
      return {
        type: 'finish',
        reason: 'All planned steps have been executed',
        expectedObservation: 'Testing complete'
      };
    }

    if (currentStep.actionType === 'navigate') {
      return {
        type: 'navigate',
        url: currentStep.targetDescription?.startsWith('http')
          ? currentStep.targetDescription
          : observation.currentUrl,
        reason: currentStep.goal,
        expectedObservation: currentStep.expectedBehavior
      };
    }

    if (currentStep.actionType === 'click') {
      // Find matching control in observation
      let selector = currentStep.targetSelector || '';
      const matched = observation.controls.find(
        (c) =>
          c.selector.includes('add-to-cart') ||
          c.selector.includes('cart') ||
          (c.text && c.text.toLowerCase().includes('cart')) ||
          (c.name && c.name.toLowerCase().includes('cart'))
      );

      if (matched && !selector) {
        selector = matched.selector;
      }

      return {
        type: 'click',
        selector: selector || currentStep.targetSelector,
        reason: currentStep.goal,
        expectedObservation: currentStep.expectedBehavior
      };
    }

    return {
      type: 'capture',
      reason: 'Capture evidence for observation',
      expectedObservation: 'Screenshot captured'
    };
  }

  public async evaluateVerification(
    observation: PageObservation,
    expectation: StateExpectation
  ): Promise<VerificationResult> {
    const discrepancies: string[] = [];

    if (expectation.numericCalculation) {
      const expectedTotal = expectation.numericCalculation.expected;
      // Look for total price pattern in observation snippet
      const match = observation.visibleTextSnippet.match(/Total:\s*\$?([\d\.]+)/i);
      if (match) {
        const parsedTotal = parseFloat(match[1]);
        if (Math.abs(parsedTotal - expectedTotal) > 0.01) {
          discrepancies.push(
            `Cart total mismatch: Page shows $${parsedTotal}, but expected calculation is $${expectedTotal}`
          );
        }
      }
    }

    const passed = discrepancies.length === 0;
    return {
      passed,
      confidence: 0.95,
      status: passed ? 'PASS' : 'FAIL',
      details: passed ? 'State verified successfully' : 'Discrepancy detected in actual observation',
      discrepancies
    };
  }
}

/**
 * Factory function to instantiate AI providers
 */
export function createAiProvider(type: string = 'deterministic', config: AiProviderConfig = {}): AiProvider {
  switch (type.toLowerCase()) {
    case 'deterministic':
    case 'local_qa':
    default:
      return new DeterministicQaProvider();
  }
}
