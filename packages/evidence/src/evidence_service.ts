import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { EvidenceRecord } from '@test-io-agent/shared';
import type { AgentStudioDatabase } from '@test-io-agent/storage';

export interface CaptureEvidenceOptions {
  type: EvidenceRecord['type'];
  content: Buffer | string;
  stepId?: string;
  filenamePrefix?: string;
  isRedacted?: boolean;
  category?: EvidenceRecord['category'];
}

export class EvidenceService {
  private baseDir: string;

  constructor(
    private db: AgentStudioDatabase,
    baseDir: string = './data/evidence'
  ) {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Capture evidence with SHA-256 integrity verification
   */
  public async captureEvidence(
    runId: string,
    options: CaptureEvidenceOptions
  ): Promise<EvidenceRecord> {
    const evidenceId = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const extension = options.type === 'SCREENSHOT' ? '.png' : options.type === 'CONSOLE_LOG' ? '.log' : '.json';
    const filename = `${options.filenamePrefix || 'evidence'}_${evidenceId}${extension}`;
    const filePath = path.join(this.baseDir, filename);

    const buffer = Buffer.isBuffer(options.content)
      ? options.content
      : Buffer.from(options.content, 'utf8');

    // Write file to disk
    fs.writeFileSync(filePath, buffer);

    // Compute SHA-256 hash
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    const record: EvidenceRecord = {
      id: evidenceId,
      runId,
      stepId: options.stepId,
      type: options.type,
      category: options.category || 'FUNCTIONAL_EVIDENCE',
      filePath,
      fileSizeBytes: buffer.length,
      sha256Hash: hash,
      isRedacted: Boolean(options.isRedacted),
      capturedAt: new Date().toISOString()
    };

    // Persist to SQLite
    this.db.saveEvidence(record);
    return record;
  }

  public verifyIntegrity(evidenceId: string): boolean {
    const record = this.db.getEvidence(evidenceId);
    if (!record || !fs.existsSync(record.filePath)) return false;

    const buffer = fs.readFileSync(record.filePath);
    const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');
    return computedHash === record.sha256Hash;
  }
}

let activeEvidenceService: EvidenceService | null = null;

export function initEvidenceService(db: AgentStudioDatabase, dir?: string): EvidenceService {
  activeEvidenceService = new EvidenceService(db, dir);
  return activeEvidenceService;
}

export async function captureEvidence(
  runId: string,
  stepId: string | undefined,
  options: Omit<CaptureEvidenceOptions, 'stepId'>
): Promise<EvidenceRecord> {
  if (!activeEvidenceService) {
    throw new Error('EvidenceService has not been initialized.');
  }
  return activeEvidenceService.captureEvidence(runId, { ...options, stepId });
}
