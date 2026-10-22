import type {
  PageObservation,
  PageAccessState,
  AccessBlockerResult,
  ApplicationReadyResult,
  TaskAnalysis
} from '@test-io-agent/shared';

/**
 * Robust, evidence-backed detection for bot challenges, Cloudflare verification,
 * security firewalls, and access denials.
 * Does NOT rely on a single vendor selector.
 */
export function detectAccessBlocker(observation: PageObservation): AccessBlockerResult | null {
  const url = (observation.currentUrl || '').toLowerCase();
  const title = (observation.title || '').toLowerCase();
  const bodySnippet = (observation.visibleTextSnippet || '').toLowerCase();
  const headings = (observation.headings || []).map((h) => h.toLowerCase()).join(' ');
  const combinedText = `${title} ${headings} ${bodySnippet}`;

  const signalsDetected: string[] = [];

  // 1. Cloudflare Human Verification / Turnstile / DDoS Protection signals
  const cfTitlePatterns = [
    'just a moment',
    'attention required! | cloudflare',
    'security check',
    'checking your browser',
    'cloudflare',
    'verify you are human'
  ];
  for (const pat of cfTitlePatterns) {
    if (title.includes(pat)) {
      signalsDetected.push(`Title indicates security challenge: "${observation.title}"`);
      break;
    }
  }

  const cfTextPatterns = [
    'verify you are human',
    'please verify you are a human',
    'cloudflare ray id',
    'ray id:',
    'performance & security by cloudflare',
    'enable javascript and cookies to continue',
    'checking if the site connection is secure',
    'this process is automatic',
    'dast.cloudflare.com',
    'challenges.cloudflare.com',
    'turnstile'
  ];
  for (const pat of cfTextPatterns) {
    if (combinedText.includes(pat)) {
      signalsDetected.push(`Page content contains security challenge signature: "${pat}"`);
    }
  }

  // 2. Control & Iframe signals for CAPTCHA / Turnstile
  for (const c of observation.controls || []) {
    const sel = (c.selector || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    const text = (c.text || '').toLowerCase();
    if (
      sel.includes('turnstile') ||
      sel.includes('cf-challenge') ||
      sel.includes('challenge-form') ||
      sel.includes('recaptcha') ||
      sel.includes('hcaptcha') ||
      name.includes('cf-turnstile') ||
      text.includes('verify you are human')
    ) {
      signalsDetected.push(`Security challenge control detected: ${c.selector}`);
    }
  }

  if (signalsDetected.length > 0) {
    const isCloudflare =
      combinedText.includes('cloudflare') ||
      title.includes('just a moment') ||
      combinedText.includes('turnstile') ||
      signalsDetected.some((s) => s.toLowerCase().includes('cloudflare') || s.toLowerCase().includes('turnstile'));

    return {
      isBlocked: true,
      accessState: 'SECURITY_CHALLENGE',
      blockerType: isCloudflare ? 'CLOUDFLARE_CHALLENGE' : 'CAPTCHA',
      signalsDetected,
      diagnosticDetails: `Automated access blocked by security verification challenge (${isCloudflare ? 'Cloudflare Turnstile/Challenge' : 'CAPTCHA'}). Human interaction required.`,
      recommendedRunStatus: 'BLOCKED_SITE_VERIFICATION'
    };
  }

  // 3. Rate Limiting signals (429, Too Many Requests)
  if (
    title.includes('429 too many requests') ||
    title.includes('rate limited') ||
    combinedText.includes('rate limit exceeded') ||
    combinedText.includes('too many requests from your ip')
  ) {
    return {
      isBlocked: true,
      accessState: 'RATE_LIMITED',
      blockerType: 'RATE_LIMIT',
      signalsDetected: ['HTTP 429 / Rate Limit text detected'],
      diagnosticDetails: 'Automated access blocked by server rate-limiting policy (HTTP 429).',
      recommendedRunStatus: 'BLOCKED_SITE_VERIFICATION'
    };
  }

  // 4. Access Denied / 403 Forbidden / IP Block
  if (
    title.includes('403 forbidden') ||
    title.includes('access denied') ||
    combinedText.includes('error 1020') ||
    combinedText.includes('access denied: error 1020') ||
    combinedText.includes('you do not have permission to access')
  ) {
    return {
      isBlocked: true,
      accessState: 'ACCESS_DENIED',
      blockerType: 'ACCESS_DENIED',
      signalsDetected: ['HTTP 403 / Access Denied text detected'],
      diagnosticDetails: 'Automated access forbidden by remote server (HTTP 403 / Access Denied).',
      recommendedRunStatus: 'BLOCKED_SITE_VERIFICATION'
    };
  }

  // 5. Network Failure / Chrome error
  if (
    url.startsWith('chrome-error://') ||
    title.includes('problem loading page') ||
    combinedText.includes('err_connection_refused') ||
    combinedText.includes('dns_probe_finished') ||
    combinedText.includes('err_name_not_resolved')
  ) {
    return {
      isBlocked: true,
      accessState: 'NETWORK_FAILURE',
      blockerType: 'NETWORK_ERROR',
      signalsDetected: ['Network failure / Browser navigation error'],
      diagnosticDetails: 'Navigation failed due to host resolution or network connectivity failure.',
      recommendedRunStatus: 'NEEDS_REVIEW'
    };
  }

  return null;
}

/**
 * Classifies the high-level access state of the observed page.
 */
export function classifyPageAccessState(observation: PageObservation): PageAccessState {
  const blocker = detectAccessBlocker(observation);
  if (blocker) {
    return blocker.accessState;
  }

  // Check for authentication required on homepage
  const url = (observation.currentUrl || '').toLowerCase();
  if (url.includes('/login') || url.includes('/signin') || url.includes('/auth')) {
    const hasPasswordInput = (observation.controls || []).some(
      (c) => c.inputType === 'password' || c.selector.includes('password')
    );
    if (hasPasswordInput) {
      return 'AUTHENTICATION_REQUIRED';
    }
  }

  return 'NORMAL_APPLICATION_PAGE';
}

/**
 * Verifies that the application page is truly ready for exploratory testing.
 * A successful HTTP 200 or DOMContentLoaded is insufficient.
 */
export function verifyApplicationReady(
  observation: PageObservation,
  taskScope?: TaskAnalysis
): ApplicationReadyResult {
  const blocker = detectAccessBlocker(observation);
  if (blocker) {
    return {
      isReady: false,
      reason: blocker.diagnosticDetails,
      detectedState: blocker.accessState,
      missingPreconditions: blocker.signalsDetected
    };
  }

  const accessState = classifyPageAccessState(observation);
  if (accessState !== 'NORMAL_APPLICATION_PAGE') {
    return {
      isReady: false,
      reason: `Page access state is '${accessState}', not ready for testing.`,
      detectedState: accessState,
      missingPreconditions: [`Access state: ${accessState}`]
    };
  }

  // Check visible content presence
  const snippet = (observation.visibleTextSnippet || '').trim();
  if (snippet.length < 15 && (observation.controls || []).length < 2) {
    return {
      isReady: false,
      reason: 'Page body is essentially blank or unpopulated (loading shell).',
      detectedState: 'NORMAL_APPLICATION_PAGE',
      missingPreconditions: ['Visible DOM text is empty or loading']
    };
  }

  return {
    isReady: true,
    reason: 'Application homepage state is fully rendered and accessible for testing.',
    detectedState: 'NORMAL_APPLICATION_PAGE'
  };
}
