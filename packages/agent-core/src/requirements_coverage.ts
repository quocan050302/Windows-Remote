import * as crypto from 'node:crypto';
import type {
  TaskAnalysis,
  TestPlan,
  TestPlanStep,
  StepExecutionResult,
  TestRequirementItem,
  RequirementsCoverageMatrix,
  ScenarioCoverageMapping,
  PageObservation,
  InteractiveControl
} from '@test-io-agent/shared';

/**
 * Computes a deterministic SHA-256 fingerprint for a task's testing requirements.
 * Used to invalidate cached test plans whenever the task scope, brief, target URL, or model changes.
 */
export function computeRequirementsFingerprint(
  task: { title: string; description: string; targetUrl?: string },
  analysis?: TaskAnalysis,
  modelId?: string
): string {
  const payload = {
    title: (task.title || '').trim().toLowerCase(),
    description: (task.description || '').trim().toLowerCase(),
    targetUrl: (task.targetUrl || '').trim().toLowerCase(),
    inScope: (analysis?.inScopeFeatures || []).map((s) => s.trim().toLowerCase()).sort(),
    outOfScope: (analysis?.outOfScopeFeatures || []).map((s) => s.trim().toLowerCase()).sort(),
    requirements: (analysis?.requirements || []).map((s) => s.trim().toLowerCase()).sort(),
    modelId: (modelId || '').trim().toLowerCase()
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Extracts explicit and discovered requirements from TaskAnalysis and real PageObservation.
 * Discovers actual interactive homepage elements (CTAs, promo banners, carousels, accordion sections, category links).
 */
export function extractTestRequirements(
  analysis: TaskAnalysis,
  observation?: PageObservation
): TestRequirementItem[] {
  const items: TestRequirementItem[] = [];
  let reqIndex = 1;

  // 1. Explicit requirements from Task Analysis
  for (const r of analysis.requirements || []) {
    const trimmed = r.trim();
    if (!trimmed) continue;
    let category: TestRequirementItem['category'] = 'GENERAL_UI';
    const lower = trimmed.toLowerCase();
    if (lower.includes('cta') || lower.includes('button') || lower.includes('click')) {
      category = 'CTA';
    } else if (lower.includes('promo') || lower.includes('banner') || lower.includes('sale') || lower.includes('discount')) {
      category = 'PROMOTIONAL';
    } else if (lower.includes('carousel') || lower.includes('slider')) {
      category = 'CAROUSEL';
    } else if (lower.includes('expand') || lower.includes('accordion') || lower.includes('collapse') || lower.includes('faq')) {
      category = 'ACCORDION';
    } else if (lower.includes('nav') || lower.includes('link') || lower.includes('menu')) {
      category = 'NAVIGATION';
    } else if (lower.includes('product') || lower.includes('card') || lower.includes('item')) {
      category = 'FEATURED_CONTENT';
    } else if (lower.includes('total') || lower.includes('calc') || lower.includes('price')) {
      category = 'CALCULATION';
    }

    items.push({
      id: `req_${reqIndex++}`,
      category,
      description: trimmed,
      source: 'TASK_SPECIFICATION',
      inScope: true
    });
  }

  // 2. In-scope features
  for (const f of analysis.inScopeFeatures || []) {
    const trimmed = f.trim();
    if (!trimmed) continue;
    // Avoid exact duplicate
    if (!items.some((i) => i.description.toLowerCase() === trimmed.toLowerCase())) {
      items.push({
        id: `req_${reqIndex++}`,
        category: trimmed.toLowerCase().includes('cart') ? 'CALCULATION' : 'FEATURED_CONTENT',
        description: `Verify functionality and responsiveness of: ${trimmed}`,
        source: 'IN_SCOPE_FEATURE',
        inScope: true
      });
    }
  }

  // 3. Discover real controls on live page observation if available
  if (observation && observation.controls) {
    const controls = observation.controls;

    // A. Real CTA Buttons
    const ctas = controls.filter((c) => {
      const txt = (c.text || '').toLowerCase();
      const sel = c.selector.toLowerCase();
      return (
        c.isVisible &&
        c.isEnabled &&
        (c.tag === 'button' || c.role === 'button') &&
        (txt.includes('book') ||
          txt.includes('buy') ||
          txt.includes('explore') ||
          txt.includes('get started') ||
          txt.includes('search') ||
          txt.includes('add to cart') ||
          sel.includes('cta') ||
          sel.includes('primary'))
      );
    });

    for (const cta of ctas.slice(0, 3)) {
      const desc = `Verify CTA button: "${cta.text || cta.name || cta.selector}"`;
      if (!items.some((i) => i.description === desc)) {
        items.push({
          id: `req_${reqIndex++}`,
          category: 'CTA',
          description: desc,
          source: 'DOM_DISCOVERY',
          inScope: true,
          targetControlDescription: cta.selector
        });
      }
    }

    // B. Real Carousels / Sliders
    const carouselControls = controls.filter((c) => {
      const sel = c.selector.toLowerCase();
      const txt = (c.text || '').toLowerCase();
      return (
        c.isVisible &&
        (sel.includes('carousel') ||
          sel.includes('slider') ||
          sel.includes('slide-next') ||
          sel.includes('slide-prev') ||
          txt.includes('next slide') ||
          txt.includes('prev slide'))
      );
    });

    if (carouselControls.length > 0) {
      const desc = 'Verify homepage image slider / carousel navigation and active item transition';
      if (!items.some((i) => i.description === desc)) {
        items.push({
          id: `req_${reqIndex++}`,
          category: 'CAROUSEL',
          description: desc,
          source: 'DOM_DISCOVERY',
          inScope: true,
          targetControlDescription: carouselControls[0].selector
        });
      }
    }

    // C. Real Expandable Sections (Accordion / FAQ / Details)
    const expandableControls = controls.filter((c) => {
      const sel = c.selector.toLowerCase();
      const txt = (c.text || '').toLowerCase();
      return (
        c.isVisible &&
        (sel.includes('accordion') ||
          sel.includes('collapse') ||
          sel.includes('faq') ||
          sel.includes('details') ||
          sel.includes('expand') ||
          txt.includes('faq') ||
          txt.includes('frequently asked'))
      );
    });

    if (expandableControls.length > 0) {
      const desc = 'Verify expandable section toggle (collapse and expand behavior)';
      if (!items.some((i) => i.description === desc)) {
        items.push({
          id: `req_${reqIndex++}`,
          category: 'ACCORDION',
          description: desc,
          source: 'DOM_DISCOVERY',
          inScope: true,
          targetControlDescription: expandableControls[0].selector
        });
      }
    }

    // D. Promotional Banners / Links
    const promoControls = controls.filter((c) => {
      const sel = c.selector.toLowerCase();
      const txt = (c.text || '').toLowerCase();
      return (
        c.isVisible &&
        (sel.includes('promo') ||
          sel.includes('banner') ||
          sel.includes('deal') ||
          txt.includes('sale') ||
          txt.includes('deal') ||
          txt.includes('discount') ||
          txt.includes('off'))
      );
    });

    for (const promo of promoControls.slice(0, 2)) {
      const desc = `Verify promotional banner / offer link: "${promo.text || promo.selector}"`;
      if (!items.some((i) => i.description === desc)) {
        items.push({
          id: `req_${reqIndex++}`,
          category: 'PROMOTIONAL',
          description: desc,
          source: 'DOM_DISCOVERY',
          inScope: true,
          targetControlDescription: promo.selector
        });
      }
    }

    // E. Category Links
    const categoryLinks = controls.filter((c) => {
      const sel = c.selector.toLowerCase();
      const txt = (c.text || '').toLowerCase();
      return (
        c.isVisible &&
        c.tag === 'a' &&
        (sel.includes('category') ||
          sel.includes('nav-cat') ||
          txt.includes('category') ||
          txt.includes('boats') ||
          txt.includes('yachts') ||
          txt.includes('sailboat'))
      );
    });

    for (const cat of categoryLinks.slice(0, 2)) {
      const desc = `Verify category navigation link: "${cat.text || cat.selector}"`;
      if (!items.some((i) => i.description === desc)) {
        items.push({
          id: `req_${reqIndex++}`,
          category: 'NAVIGATION',
          description: desc,
          source: 'DOM_DISCOVERY',
          inScope: true,
          targetControlDescription: cat.selector
        });
      }
    }
  }

  // Fallback sanity item if none found
  if (items.length === 0) {
    items.push({
      id: `req_1`,
      category: 'GENERAL_UI',
      description: 'Observe application initial state and core interactive controls',
      source: 'FALLBACK_SANITY',
      inScope: true
    });
  }

  return items;
}

/**
 * Builds the complete Requirements Coverage Matrix by mapping test plan scenarios
 * and executed step results to the extracted requirements.
 */
export function buildCoverageMatrix(
  requirements: TestRequirementItem[],
  plan: TestPlan,
  stepResults: StepExecutionResult[] = []
): RequirementsCoverageMatrix {
  const resultMap = new Map<string, StepExecutionResult>();
  for (const res of stepResults) {
    resultMap.set(res.stepId, res);
  }

  let passedCases = 0;
  let failedCases = 0;
  let blockedCases = 0;
  let skippedCases = 0;
  let unverifiedCases = 0;

  const reqCoverages = requirements.map((req) => {
    // Find matching steps in test plan
    const matchingSteps: TestPlanStep[] = [];
    const reqWords = req.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    for (const step of plan.steps) {
      const stepText = `${step.goal} ${step.expectedBehavior} ${step.targetDescription || ''} ${step.targetSelector || ''}`.toLowerCase();
      const matchesCategory =
        (req.category === 'CAROUSEL' && (stepText.includes('carousel') || stepText.includes('slider'))) ||
        (req.category === 'CTA' && (stepText.includes('cta') || stepText.includes('button') || stepText.includes('click'))) ||
        (req.category === 'ACCORDION' && (stepText.includes('accordion') || stepText.includes('expand') || stepText.includes('faq'))) ||
        (req.category === 'PROMOTIONAL' && (stepText.includes('promo') || stepText.includes('banner') || stepText.includes('sale'))) ||
        (req.category === 'CALCULATION' && (stepText.includes('calc') || stepText.includes('total') || stepText.includes('cart'))) ||
        (req.category === 'NAVIGATION' && (stepText.includes('nav') || stepText.includes('url') || stepText.includes('link')));

      const wordMatch = reqWords.some((w) => stepText.includes(w));
      if (matchesCategory || wordMatch) {
        matchingSteps.push(step);
      }
    }

    // Build scenario mappings
    const scenarios: ScenarioCoverageMapping[] = matchingSteps.map((s) => {
      const exec = resultMap.get(s.stepId);
      const executionStatus = !exec
        ? 'NOT_RUN'
        : exec.outcome === 'BLOCKED'
        ? 'BLOCKED'
        : exec.actionSucceeded
        ? 'EXECUTED'
        : 'FAILED';

      const verificationStatus = exec ? exec.verificationStatus : 'UNVERIFIED';

      if (verificationStatus === 'PASS') passedCases++;
      else if (verificationStatus === 'FAIL') failedCases++;
      else if (verificationStatus === 'BLOCKED') blockedCases++;
      else if (verificationStatus === 'NOT_APPLICABLE') skippedCases++;
      else unverifiedCases++;

      return {
        requirementId: req.id,
        scenarioStepId: s.stepId,
        objective: s.goal,
        targetControl: s.targetSelector || s.targetDescription || 'Page element',
        expectedBehavior: s.expectedBehavior,
        executionStatus,
        verificationStatus,
        evidenceIds: exec ? exec.evidenceIds : [],
        blockerReason: exec && exec.outcome === 'BLOCKED' ? exec.notes : undefined
      };
    });

    let status: RequirementsCoverageMatrix['requirements'][0]['status'] = 'UNCOVERED';
    if (!req.inScope) {
      status = 'EXCLUDED';
    } else if (scenarios.length === 0) {
      status = 'UNCOVERED';
    } else if (scenarios.some((s) => s.verificationStatus === 'FAIL')) {
      status = 'COVERED_FAIL';
    } else if (scenarios.some((s) => s.verificationStatus === 'BLOCKED')) {
      status = 'BLOCKED';
    } else if (scenarios.some((s) => s.verificationStatus === 'PASS')) {
      status = 'COVERED_PASS';
    } else {
      status = 'UNVERIFIED';
    }

    return {
      item: req,
      scenarios,
      status
    };
  });

  const totalRequirements = requirements.filter((r) => r.inScope).length;
  const coveredRequirements = reqCoverages.filter(
    (r) => r.item.inScope && (r.status === 'COVERED_PASS' || r.status === 'COVERED_FAIL')
  ).length;

  const remainingRequirements = totalRequirements - coveredRequirements;
  const coverageRatio = totalRequirements > 0 ? coveredRequirements / totalRequirements : 0;
  const isComplete = totalRequirements > 0 && remainingRequirements === 0;

  return {
    taskId: plan.taskId,
    planId: plan.planId,
    totalRequirements,
    coveredRequirements,
    passedCases,
    failedCases,
    blockedCases,
    skippedCases,
    unverifiedCases,
    remainingRequirements,
    coverageRatio,
    isComplete,
    requirements: reqCoverages
  };
}

/**
 * Validates that all in-scope requirements have planned test scenarios.
 */
export function validatePlanCoverage(matrix: RequirementsCoverageMatrix): {
  isComplete: boolean;
  uncovered: TestRequirementItem[];
  coverageRatio: number;
} {
  const uncovered = matrix.requirements
    .filter((r) => r.item.inScope && r.status === 'UNCOVERED')
    .map((r) => r.item);

  return {
    isComplete: uncovered.length === 0,
    uncovered,
    coverageRatio: matrix.coverageRatio
  };
}

/**
 * Returns list of requirements not covered or unverified.
 */
export function getUncoveredRequirements(matrix: RequirementsCoverageMatrix): TestRequirementItem[] {
  return matrix.requirements
    .filter((r) => r.item.inScope && (r.status === 'UNCOVERED' || r.status === 'UNVERIFIED'))
    .map((r) => r.item);
}
