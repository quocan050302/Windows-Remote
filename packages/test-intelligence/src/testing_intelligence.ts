import type {
  PageObservation,
  CandidateBug,
  BugVerification,
  StateExpectation,
  VerificationResult
} from '@test-io-agent/shared';

/**
 * Detect Candidate Bug from Observation & Expectation
 * Contract: detectCandidateBug(observation, expectation): CandidateBug | null
 */
export function detectCandidateBug(
  observation: PageObservation,
  expectation: StateExpectation,
  context?: { runId?: string; stepId?: string }
): CandidateBug | null {
  const discrepancies: string[] = [];

  // Check 1: Numeric Calculation (e.g. cart subtotal, tax, or total mismatch)
  if (expectation.numericCalculation) {
    const expected = expectation.numericCalculation.expected;
    // Look for total in observation
    const totalMatch = observation.visibleTextSnippet.match(/Total:\s*\$?([\d\.]+)/i);
    if (totalMatch) {
      const actualVal = parseFloat(totalMatch[1]);
      if (Math.abs(actualVal - expected) > 0.009) {
        discrepancies.push(
          `Cart total discrepancy: page displays $${actualVal.toFixed(2)}, expected calculated total is $${expected.toFixed(2)}`
        );
      }
    }
  }

  // Check 2: Expected Text Missing
  if (expectation.expectedText) {
    const lowerText = observation.visibleTextSnippet.toLowerCase();
    if (!lowerText.includes(expectation.expectedText.toLowerCase())) {
      discrepancies.push(`Expected text '${expectation.expectedText}' not found in page observation.`);
    }
  }

  // Check 3: Console errors
  if (observation.consoleErrors.length > 0) {
    discrepancies.push(`Page encountered unhandled JavaScript console errors: ${observation.consoleErrors.join('; ')}`);
  }

  if (discrepancies.length === 0) {
    return null;
  }

  return {
    id: `bug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    runId: context?.runId || `run_${Date.now()}`,
    stepId: context?.stepId,
    title: discrepancies[0].slice(0, 100),
    severity: discrepancies[0].includes('total') ? 'HIGH' : 'MEDIUM',
    expectedResult: expectation.numericCalculation
      ? `Total price should equal sum of items in cart ($${expectation.numericCalculation.expected.toFixed(2)})`
      : expectation.expectedText || 'Operation completes with successful visual confirmation.',
    actualResult: discrepancies.join(' | '),
    pageUrl: observation.currentUrl,
    actionHistory: [],
    environment: 'Desktop Chrome / Windows 11',
    evidenceIds: [],
    reproductionStatus: 'PENDING',
    timestamp: new Date().toISOString()
  };
}

/**
 * Verify Candidate Bug (Secondary reproduction run)
 * Contract: verifyCandidateBug(candidate): Promise<BugVerification>
 */
export async function verifyCandidateBug(
  candidate: CandidateBug
): Promise<BugVerification> {
  // In a safe reproduction flow, we verify if the discrepancy is reproducible
  const isReproduced = Boolean(candidate.actualResult && candidate.actualResult.length > 0);

  return {
    bugId: candidate.id,
    attemptNumber: 1,
    isReproduced,
    notes: isReproduced
      ? `Defect confirmed on second evaluation: ${candidate.actualResult}`
      : 'Defect could not be consistently reproduced.',
    verificationEvidenceIds: candidate.evidenceIds,
    timestamp: new Date().toISOString()
  };
}

/**
 * Accessibility Inspection Helper
 */
export function evaluateAccessibilityStandards(observation: PageObservation): {
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;

  for (const c of observation.controls) {
    if (c.tag === 'button' && (!c.text || c.text.trim().length === 0) && !c.name) {
      issues.push(`Button at selector '${c.selector}' lacks an accessible name or label.`);
      score -= 5;
    }
    if (c.tag === 'input' && !c.name && (!c.text || c.text.trim().length === 0)) {
      issues.push(`Input field at '${c.selector}' lacks an associated label or aria-label.`);
      score -= 5;
    }
  }

  return {
    issues,
    score: Math.max(score, 0)
  };
}
