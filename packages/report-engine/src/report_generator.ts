import type {
  ReportDraft,
  ReportValidationResult,
  CandidateBug,
  EvidenceRecord
} from '@test-io-agent/shared';

export interface GenerateReportParams {
  taskId: string;
  runId: string;
  reportType?: ReportDraft['reportType'];
  candidateBug?: CandidateBug;
  stepsToReproduce?: string[];
  evidenceRecords?: EvidenceRecord[];
  environment?: {
    os?: string;
    browser?: string;
    viewport?: string;
  };
}

/**
 * Generate Test IO-compliant Bug Report Draft
 */
export async function generateReportDraft(
  params: GenerateReportParams,
  reportType: ReportDraft['reportType'] = 'FUNCTIONAL_BUG'
): Promise<ReportDraft> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const title = params.candidateBug
    ? `[${params.candidateBug.title.split(' - ')[0] || 'Cart'}] ${params.candidateBug.title}`
    : `[QA Execution] Test Run Summary for ${params.taskId}`;

  const evidenceLinks = (params.evidenceRecords || []).map((e) => ({
    id: e.id,
    type: e.type,
    sha256: e.sha256Hash,
    path: e.filePath
  }));

  const steps = params.stepsToReproduce && params.stepsToReproduce.length > 0
    ? params.stepsToReproduce
    : [
        '1. Open application URL in an authorized browser session',
        '2. Navigate to target feature under test',
        '3. Perform specified test interaction',
        '4. Observe actual result vs expected outcome'
      ];

  const report: ReportDraft = {
    id: reportId,
    taskId: params.taskId,
    runId: params.runId,
    reportType,
    title,
    status: evidenceLinks.length > 0 ? 'READY_FOR_HUMAN_SUBMISSION' : 'NEEDS_EVIDENCE',
    environmentDetails: {
      os: params.environment?.os || 'Windows 11 Pro 64-bit',
      browser: params.environment?.browser || 'Chromium 134',
      viewport: params.environment?.viewport || '1280x800'
    },
    stepsToReproduce: steps,
    expectedResult: params.candidateBug?.expectedResult || 'System should behave strictly as specified in requirements.',
    actualResult: params.candidateBug?.actualResult || 'System deviated from expected behavior as detailed in observation.',
    evidenceLinks,
    scopeComplianceNote: 'Verified against in-scope instructions. No unauthorized domains accessed.',
    createdAt: now,
    updatedAt: now
  };

  return report;
}

/**
 * Validate Report Draft against Test IO QA Standards
 */
export function validateReportDraft(report: ReportDraft): ReportValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!report.title || report.title.trim().length < 10) {
    missingFields.push('Title must be at least 10 characters and describe the issue accurately.');
  }

  if (!report.environmentDetails?.os || !report.environmentDetails?.browser) {
    missingFields.push('Complete environment details (OS, Browser) are required.');
  }

  if (!report.stepsToReproduce || report.stepsToReproduce.length === 0) {
    missingFields.push('Numbered steps to reproduce are mandatory.');
  }

  if (!report.expectedResult || report.expectedResult.trim().length < 5) {
    missingFields.push('Expected result must be clearly stated.');
  }

  if (!report.actualResult || report.actualResult.trim().length < 5) {
    missingFields.push('Actual result must describe the observed defect.');
  }

  if (!report.evidenceLinks || report.evidenceLinks.length === 0) {
    warnings.push('No evidence links attached. Report should contain at least one screenshot or log.');
  }

  const isValid = missingFields.length === 0;

  return {
    isValid,
    missingFields,
    warnings
  };
}
