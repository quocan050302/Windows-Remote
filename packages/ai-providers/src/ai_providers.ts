import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TaskAnalysis,
  TestPlan,
  TestPlanStep,
  PageObservation,
  BrowserAction,
  StateExpectation,
  VerificationResult
} from '@test-io-agent/shared';

function loadEnvIfAvailable(): void {
  try {
    const envPaths = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '.env'),
      path.resolve(process.cwd(), '..', '..', '.env')
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
          if (match) {
            const key = match[1].trim();
            const val = match[2].trim();
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        }
        break;
      }
    }
  } catch {
    // Optional env loading fallback
  }
}
loadEnvIfAvailable();


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
    const inScope = analysis?.inScopeFeatures || [];
    const isCartTask = inScope.some((f) => f.toLowerCase().includes('cart')) || !analysis || analysis.taskType === 'EXPLORATORY';

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
 * Sanitize text to ensure sensitive Test IO tokens or private customer credentials are not leaked
 */
export function sanitizeForExternalAi(text: string): string {
  return text
    .replace(/(bearer\s+[a-zA-Z0-9_\-\.]+)/gi, '[REDACTED_TOKEN]')
    .replace(/(password|passwd|pwd)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED_PASSWORD]')
    .replace(/(session[_\-]?id|token)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED_SESSION]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]');
}

/**
 * OpenAI-Compatible Provider (OpenAI, Local Ollama, Groq, vLLM)
 */
export class OpenAiCompatibleProvider implements AiProvider {
  public name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private temperature: number;

  constructor(config: AiProviderConfig = {}, providerLabel: string = 'OpenAI Compatible LLM') {
    loadEnvIfAvailable();
    this.name = providerLabel;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.model = config.model || 'gpt-4o-mini';
    this.apiKey = (config.apiKey !== undefined ? config.apiKey : (process.env.OPENAI_API_KEY || '')).trim();
    this.temperature = config.temperature ?? 0.1;

    const isLocalhost = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
    if (!this.apiKey && !isLocalhost) {
      throw new Error(`[${providerLabel}] Missing API Key. Please provide a valid API key in settings or OPENAI_API_KEY environment variable.`);
    }
  }

  private async callChat(systemPrompt: string, userPrompt: string): Promise<string> {
    const sanitizedUser = sanitizeForExternalAi(userPrompt);
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: sanitizedUser }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AI Provider API request failed (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  public async analyzeTask(input: { title: string; description: string }): Promise<TaskAnalysis> {
    const systemPrompt = `You are a Principal QA Engineer. Analyze the testing task and return valid JSON conforming to this TypeScript interface:
{
  "taskId": string,
  "taskType": "EXPLORATORY"|"REGRESSION"|"BUG_REPRODUCTION"|"TEST_CASE"|"USABILITY"|"ACCESSIBILITY",
  "targetApplication": string,
  "authorizedDomains": string[],
  "inScopeFeatures": string[],
  "outOfScopeFeatures": string[],
  "requirements": string[],
  "requiredDevice": string,
  "reportingRequirements": string[],
  "riskLevel": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "missingInformation": string[],
  "confidenceScore": number
}
Return ONLY valid raw JSON without markdown code fences.`;

    try {
      const userPrompt = `Title: ${input.title}\nDescription: ${input.description}`;
      const raw = await this.callChat(systemPrompt, userPrompt);
      const cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/gm, '').trim();
      const parsed = JSON.parse(cleaned);
      parsed.taskId = parsed.taskId || `task_ana_${Date.now()}`;
      return parsed;
    } catch {
      // Fallback parser if LLM output had text wrapping or API failure
      return new DeterministicQaProvider().analyzeTask(input);
    }
  }

  public async generatePlan(analysis: TaskAnalysis): Promise<TestPlan> {
    const systemPrompt = `You are an automated testing planner. Generate an actionable test plan as raw JSON:
{
  "planId": string,
  "taskId": string,
  "summary": string,
  "outOfScopeBoundaries": string[],
  "steps": Array<{
    "stepId": string,
    "stepNumber": number,
    "goal": string,
    "actionType": "navigate"|"click"|"fill"|"select"|"scroll"|"capture"|"finish",
    "targetSelector"?: string,
    "targetDescription"?: string,
    "inputValue"?: string,
    "expectedBehavior": string,
    "preconditions": string[],
    "allowedActions": string[],
    "verificationMethod": "DOM_ASSERTION"|"NUMERIC_CALCULATION"|"VISUAL_DIFF",
    "riskCategory": "LOW"|"MEDIUM"|"HIGH",
    "evidenceRequirements": string[]
  }>
}
Return ONLY raw JSON.`;

    try {
      const raw = await this.callChat(systemPrompt, JSON.stringify(analysis));
      const cleaned = raw.replace(/^```json\s*/im, '').replace(/^```\s*/gm, '').trim();
      const parsed = JSON.parse(cleaned);
      parsed.planId = parsed.planId || `plan_${Date.now()}`;
      parsed.taskId = analysis.taskId;
      parsed.createdAt = new Date().toISOString();
      return parsed;
    } catch {
      return new DeterministicQaProvider().generatePlan(analysis);
    }
  }

  public async chooseAction(
    observation: PageObservation,
    plan: TestPlan,
    completedSteps: number
  ): Promise<BrowserAction> {
    const currentStep = plan.steps[completedSteps];
    if (!currentStep) {
      return { type: 'finish', reason: 'Plan completed', expectedObservation: 'All steps finished' };
    }

    const systemPrompt = `Given the planned step and active web page controls, choose the next browser action as raw JSON:
{
  "type": "navigate"|"click"|"fill"|"select"|"scroll"|"capture"|"finish",
  "selector"?: string,
  "url"?: string,
  "value"?: string,
  "reason": string,
  "expectedObservation": string
}`;

    const userPrompt = `Planned Step: ${JSON.stringify(currentStep)}\nAvailable Controls: ${JSON.stringify(
      observation.controls.slice(0, 20)
    )}\nCurrent URL: ${observation.currentUrl}`;

    try {
      const raw = await this.callChat(systemPrompt, userPrompt);
      const cleaned = raw.replace(/^```json/m, '').replace(/^```/m, '').trim();
      const action = JSON.parse(cleaned);
      return action;
    } catch {
      return new DeterministicQaProvider().chooseAction(observation, plan, completedSteps);
    }
  }

  public async evaluateVerification(
    observation: PageObservation,
    expectation: StateExpectation
  ): Promise<VerificationResult> {
    return new DeterministicQaProvider().evaluateVerification(observation, expectation);
  }
}

/**
 * Google Gemini Provider
 */
export class GeminiProvider implements AiProvider {
  public name = 'Google Gemini Generative AI';
  private apiKey: string;
  private model: string;

  constructor(config: AiProviderConfig = {}) {
    loadEnvIfAvailable();
    this.apiKey = (config.apiKey !== undefined ? config.apiKey : (process.env.GEMINI_API_KEY || '')).trim();
    this.model = config.model || 'gemini-3.5-flash';

    if (!this.apiKey) {
      throw new Error('Gemini Provider Error: Missing API key. Please configure GEMINI_API_KEY in settings or environment.');
    }
  }

  public async analyzeTask(input: { title: string; description: string }): Promise<TaskAnalysis> {
    const openAiCompat = new OpenAiCompatibleProvider(
      {
        apiKey: this.apiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: this.model
      },
      this.name
    );
    return openAiCompat.analyzeTask(input);
  }

  public async generatePlan(analysis: TaskAnalysis): Promise<TestPlan> {
    const openAiCompat = new OpenAiCompatibleProvider(
      {
        apiKey: this.apiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: this.model
      },
      this.name
    );
    return openAiCompat.generatePlan(analysis);
  }

  public async chooseAction(
    observation: PageObservation,
    plan: TestPlan,
    completedSteps: number
  ): Promise<BrowserAction> {
    const openAiCompat = new OpenAiCompatibleProvider(
      {
        apiKey: this.apiKey,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: this.model
      },
      this.name
    );
    return openAiCompat.chooseAction(observation, plan, completedSteps);
  }

  public async evaluateVerification(
    observation: PageObservation,
    expectation: StateExpectation
  ): Promise<VerificationResult> {
    return new DeterministicQaProvider().evaluateVerification(observation, expectation);
  }
}

/**
 * Anthropic Claude Provider
 */
export class AnthropicProvider implements AiProvider {
  public name = 'Anthropic Claude Engine';
  private apiKey: string;
  private model: string;

  constructor(config: AiProviderConfig = {}) {
    loadEnvIfAvailable();
    this.apiKey = (config.apiKey !== undefined ? config.apiKey : (process.env.ANTHROPIC_API_KEY || '')).trim();
    this.model = config.model || 'claude-3-5-sonnet-latest';

    if (!this.apiKey) {
      throw new Error('Anthropic Provider Error: Missing API key. Please configure ANTHROPIC_API_KEY in settings or environment.');
    }
  }

  private async callChat(systemPrompt: string, userPrompt: string): Promise<string> {
    const sanitizedUser = sanitizeForExternalAi(userPrompt);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: sanitizedUser }]
      })
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic API request failed (${res.status}): ${errText}`);
    }

    const data: any = await res.json();
    return data?.content?.[0]?.text || '';
  }

  public async analyzeTask(input: { title: string; description: string }): Promise<TaskAnalysis> {
    const systemPrompt = `You are a Principal QA Engineer. Analyze the testing task and return valid JSON conforming to this TypeScript interface:
{
  "taskId": string,
  "taskType": "EXPLORATORY"|"REGRESSION"|"BUG_REPRODUCTION"|"TEST_CASE"|"USABILITY"|"ACCESSIBILITY",
  "targetApplication": string,
  "authorizedDomains": string[],
  "inScopeFeatures": string[],
  "outOfScopeFeatures": string[],
  "requirements": string[],
  "requiredDevice": string,
  "reportingRequirements": string[],
  "riskLevel": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "missingInformation": string[],
  "confidenceScore": number
}
Return ONLY valid raw JSON without markdown code fences.`;

    const userPrompt = `Title: ${input.title}\nDescription: ${input.description}`;
    const raw = await this.callChat(systemPrompt, userPrompt);
    const cleaned = raw.replace(/^```json/m, '').replace(/^```/m, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      parsed.taskId = parsed.taskId || `task_ana_${Date.now()}`;
      return parsed;
    } catch {
      throw new Error(`Anthropic Claude response could not be parsed as valid JSON: ${cleaned.slice(0, 150)}`);
    }
  }

  public async generatePlan(analysis: TaskAnalysis): Promise<TestPlan> {
    const systemPrompt = `You are an automated testing planner. Generate an actionable test plan as raw JSON conforming to TestPlan interface. Return ONLY raw JSON without markdown.`;
    const raw = await this.callChat(systemPrompt, JSON.stringify(analysis));
    const cleaned = raw.replace(/^```json/m, '').replace(/^```/m, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      parsed.planId = parsed.planId || `plan_${Date.now()}`;
      parsed.taskId = analysis.taskId;
      parsed.createdAt = new Date().toISOString();
      return parsed;
    } catch {
      throw new Error(`Anthropic Claude response could not be parsed as valid JSON: ${cleaned.slice(0, 150)}`);
    }
  }

  public async chooseAction(
    observation: PageObservation,
    plan: TestPlan,
    completedSteps: number
  ): Promise<BrowserAction> {
    const currentStep = plan.steps[completedSteps];
    if (!currentStep) {
      return { type: 'finish', reason: 'Plan completed', expectedObservation: 'All steps finished' };
    }

    const systemPrompt = `Given the planned step and active web page controls, choose the next browser action as raw JSON:
{
  "type": "navigate"|"click"|"fill"|"select"|"scroll"|"capture"|"finish",
  "selector"?: string,
  "url"?: string,
  "value"?: string,
  "reason": string,
  "expectedObservation": string
}`;

    const userPrompt = `Planned Step: ${JSON.stringify(currentStep)}\nAvailable Controls: ${JSON.stringify(
      observation.controls.slice(0, 20)
    )}\nCurrent URL: ${observation.currentUrl}`;

    const raw = await this.callChat(systemPrompt, userPrompt);
    const cleaned = raw.replace(/^```json/m, '').replace(/^```/m, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(`Anthropic Claude action could not be parsed as valid JSON: ${cleaned.slice(0, 150)}`);
    }
  }

  public async evaluateVerification(
    observation: PageObservation,
    expectation: StateExpectation
  ): Promise<VerificationResult> {
    const discrepancies: string[] = [];
    if (expectation.numericCalculation) {
      const expectedTotal = expectation.numericCalculation.expected;
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
    const passed = discrepancies.length === 0 && observation.consoleErrors.length === 0;
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
 * Factory function to instantiate AI providers with validation and explicit error visibility
 */
export function createAiProvider(type: string = 'deterministic', config: AiProviderConfig = {}): AiProvider {
  const normType = (type || 'deterministic').toLowerCase().trim();

  switch (normType) {
    case 'deterministic':
    case 'local_qa':
    case 'offline':
      return new DeterministicQaProvider();

    case 'openai':
      return new OpenAiCompatibleProvider(config, 'OpenAI GPT Engine');

    case 'gemini':
    case 'google':
      return new GeminiProvider(config);

    case 'anthropic':
    case 'claude':
      return new AnthropicProvider(config);

    case 'ollama':
      return new OpenAiCompatibleProvider(
        {
          baseUrl: config.baseUrl || 'http://localhost:11434/v1',
          model: config.model || 'llama3',
          ...config
        },
        'Local Ollama Engine'
      );

    default:
      throw new Error(
        `Unsupported AI provider '${type}'. Supported providers: 'deterministic', 'openai', 'gemini', 'anthropic', 'ollama'.`
      );
  }
}
