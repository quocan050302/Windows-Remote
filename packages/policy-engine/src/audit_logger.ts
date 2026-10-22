import type { AuditLogEntry, PermissionDecisionStatus } from '@test-io-agent/shared';
import type { AgentStudioDatabase } from '@test-io-agent/storage';

export class AuditLogService {
  constructor(private db: AgentStudioDatabase) {}

  public record(
    toolName: string,
    actionSummary: string,
    decision: PermissionDecisionStatus,
    outcome: 'SUCCESS' | 'DENIED' | 'FAILED',
    options?: {
      taskId?: string;
      runId?: string;
      targetDomain?: string;
      errorCode?: string;
    }
  ): void {
    // Redact sensitive patterns from summary
    const safeSummary = this.redactSecrets(actionSummary);

    const entry: AuditLogEntry = {
      taskId: options?.taskId,
      runId: options?.runId,
      toolName,
      actionSummary: safeSummary,
      permissionDecision: decision,
      targetDomain: options?.targetDomain,
      timestamp: new Date().toISOString(),
      outcome,
      errorCode: options?.errorCode
    };

    this.db.logAudit(entry);
  }

  public getRecentLogs(limit: number = 50): AuditLogEntry[] {
    return this.db.listAuditLogs(limit);
  }

  private redactSecrets(input: string): string {
    if (!input) return input;
    return input
      .replace(/password\s*=\s*['"][^'"]+['"]/gi, 'password="[REDACTED]"')
      .replace(/token\s*[:=]\s*['"][^'"]+['"]/gi, 'token="[REDACTED]"')
      .replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CARD_REDACTED]');
  }
}
