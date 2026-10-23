import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TaskRecord,
  TestPlan,
  TestPlanStep,
  AuthorizationRecord,
  AuthorizationStatus,
  AuthorizationAuditEntry,
  CreateAuthorizationDto,
  AuthorizationEvaluationResult,
  CandidateBug,
  BugVerification,
  EvidenceRecord,
  ReportDraft,
  AuditLogEntry,
  ApplicationSettings,
  ModelUsageRecord
} from '@test-io-agent/shared';

export class AgentStudioDatabase {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.initPragmas();
    this.runMigrations();
  }

  private initPragmas(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');
  }

  private runMigrations(): void {
    this.db.exec(`
      -- 1. Tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_platform TEXT NOT NULL DEFAULT 'TEST_IO',
        target_url TEXT,
        target_app TEXT,
        cycle_id TEXT,
        status TEXT NOT NULL DEFAULT 'CREATED',
        execution_mode TEXT NOT NULL DEFAULT 'COPILOT_MODE',
        analysis_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      -- 2. Test Cycles
      CREATE TABLE IF NOT EXISTS test_cycles (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        platform_info TEXT,
        start_date TEXT,
        end_date TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
      );

      -- 3. Test Requirements
      CREATE TABLE IF NOT EXISTS test_requirements (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        requirement_text TEXT NOT NULL,
        is_in_scope INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- 4. Test Plans
      CREATE TABLE IF NOT EXISTS test_plans (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        boundaries_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- 5. Test Steps
      CREATE TABLE IF NOT EXISTS test_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        goal TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_selector TEXT,
        target_description TEXT,
        input_value TEXT,
        expected_behavior TEXT NOT NULL,
        risk_category TEXT NOT NULL DEFAULT 'LOW',
        preconditions_json TEXT,
        allowed_actions_json TEXT,
        FOREIGN KEY(plan_id) REFERENCES test_plans(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_test_steps_plan ON test_steps(plan_id, step_number);

      -- 6. Browser Sessions
      CREATE TABLE IF NOT EXISTS browser_sessions (
        id TEXT PRIMARY KEY,
        browser_id TEXT NOT NULL,
        context_id TEXT NOT NULL,
        authorization_id TEXT,
        start_time TEXT NOT NULL,
        is_closed INTEGER NOT NULL DEFAULT 0
      );

      -- 7. Agent Runs
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        total_steps INTEGER NOT NULL DEFAULT 0,
        passed_steps INTEGER NOT NULL DEFAULT 0,
        failed_steps INTEGER NOT NULL DEFAULT 0,
        bugs_found INTEGER NOT NULL DEFAULT 0,
        start_time TEXT NOT NULL,
        end_time TEXT,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      -- 8. Agent Actions
      CREATE TABLE IF NOT EXISTS agent_actions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT,
        action_type TEXT NOT NULL,
        target TEXT,
        payload_json TEXT,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      -- 9. Observations
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT,
        page_url TEXT,
        page_title TEXT,
        dom_summary TEXT,
        interactive_controls_json TEXT,
        console_errors_json TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      -- 10. Verification Results
      CREATE TABLE IF NOT EXISTS verification_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        passed INTEGER NOT NULL,
        confidence REAL NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      -- 11. Candidate Bugs
      CREATE TABLE IF NOT EXISTS candidate_bugs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        expected_result TEXT NOT NULL,
        actual_result TEXT NOT NULL,
        page_url TEXT NOT NULL,
        environment TEXT NOT NULL,
        reproduction_status TEXT NOT NULL DEFAULT 'PENDING',
        evidence_ids_json TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      -- 12. Bug Verifications
      CREATE TABLE IF NOT EXISTS bug_verifications (
        id TEXT PRIMARY KEY,
        bug_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        is_reproduced INTEGER NOT NULL,
        notes TEXT NOT NULL,
        evidence_ids_json TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY(bug_id) REFERENCES candidate_bugs(id) ON DELETE CASCADE
      );

      -- 13. Evidence
      CREATE TABLE IF NOT EXISTS evidence (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_id TEXT,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        sha256_hash TEXT NOT NULL,
        is_redacted INTEGER NOT NULL DEFAULT 0,
        captured_at TEXT NOT NULL,
        category TEXT DEFAULT 'FUNCTIONAL_EVIDENCE',
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence(sha256_hash);

      -- 14. Report Drafts
      CREATE TABLE IF NOT EXISTS report_drafts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        environment_json TEXT NOT NULL,
        steps_json TEXT NOT NULL,
        expected_result TEXT NOT NULL,
        actual_result TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        scope_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
      );

      -- 15. Authorizations
      CREATE TABLE IF NOT EXISTS authorizations (
        id TEXT PRIMARY KEY,
        granting_party TEXT NOT NULL,
        verification_evidence TEXT NOT NULL,
        scope TEXT NOT NULL,
        allowed_domains_json TEXT NOT NULL,
        allowed_actions_json TEXT NOT NULL,
        allowed_devices_json TEXT NOT NULL,
        start_time TEXT NOT NULL,
        expiration_time TEXT NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        status TEXT,
        revocation_reason TEXT,
        audit_history_json TEXT,
        updated_at TEXT,
        created_at TEXT NOT NULL
      );

      -- 16. Audit Logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        run_id TEXT,
        tool_name TEXT NOT NULL,
        action_summary TEXT NOT NULL,
        permission_decision TEXT NOT NULL,
        target_domain TEXT,
        timestamp TEXT NOT NULL,
        outcome TEXT NOT NULL,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);

      -- 17. Application Settings
      CREATE TABLE IF NOT EXISTS application_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- 18. Model Usage
      CREATE TABLE IF NOT EXISTS model_usage (
        id TEXT PRIMARY KEY,
        run_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    try {
      this.db.exec(`ALTER TABLE authorizations ADD COLUMN status TEXT;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE authorizations ADD COLUMN revocation_reason TEXT;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE authorizations ADD COLUMN audit_history_json TEXT;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE authorizations ADD COLUMN updated_at TEXT;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE test_plans ADD COLUMN plan_version INTEGER DEFAULT 1;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE test_plans ADD COLUMN requirements_fingerprint TEXT;`);
    } catch { /* already exists */ }
    try {
      this.db.exec(`ALTER TABLE evidence ADD COLUMN category TEXT DEFAULT 'FUNCTIONAL_EVIDENCE';`);
    } catch { /* already exists */ }
  }

  // ==========================================
  // Repository Methods
  // ==========================================

  public saveRun(run: { id: string; taskId: string; status: string; mode: string; startTime: string }): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_runs (id, task_id, status, mode, start_time)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status
    `);
    stmt.run(run.id, run.taskId, run.status, run.mode, run.startTime);
  }

  public updateRun(run: { id: string; status: string; totalSteps: number; passedSteps: number; failedSteps: number; bugsFound?: number; endTime?: string }): void {
    const stmt = this.db.prepare(`
      UPDATE agent_runs
      SET status = ?, total_steps = ?, passed_steps = ?, failed_steps = ?, bugs_found = ?, end_time = COALESCE(?, end_time)
      WHERE id = ?
    `);
    stmt.run(run.status, run.totalSteps, run.passedSteps, run.failedSteps, run.bugsFound ?? 0, run.endTime || null, run.id);
  }

  public saveTask(task: TaskRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, source_platform, target_url, target_app, cycle_id, status, execution_mode, analysis_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        execution_mode = excluded.execution_mode,
        analysis_json = excluded.analysis_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      task.id,
      task.title,
      task.description,
      task.sourcePlatform,
      task.targetUrl || null,
      task.targetApp || null,
      task.cycleId || null,
      task.status,
      task.executionMode,
      task.analysis ? JSON.stringify(task.analysis) : null,
      task.createdAt,
      task.updatedAt
    );
  }

  public getTask(id: string): TaskRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM tasks WHERE id = ?`);
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      sourcePlatform: row.source_platform as string,
      targetUrl: (row.target_url as string) || undefined,
      targetApp: (row.target_app as string) || undefined,
      cycleId: (row.cycle_id as string) || undefined,
      status: row.status as any,
      executionMode: row.execution_mode as any,
      analysis: row.analysis_json ? JSON.parse(row.analysis_json as string) : undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    };
  }

  public listTasks(): TaskRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`);
    const rows = stmt.all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      sourcePlatform: row.source_platform as string,
      targetUrl: (row.target_url as string) || undefined,
      targetApp: (row.target_app as string) || undefined,
      cycleId: (row.cycle_id as string) || undefined,
      status: row.status as any,
      executionMode: row.execution_mode as any,
      analysis: row.analysis_json ? JSON.parse(row.analysis_json as string) : undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string
    }));
  }

  public saveTestPlan(plan: TestPlan): void {
    const stmtPlan = this.db.prepare(`
      INSERT INTO test_plans (id, task_id, summary, boundaries_json, plan_version, requirements_fingerprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        summary = excluded.summary,
        boundaries_json = excluded.boundaries_json,
        plan_version = excluded.plan_version,
        requirements_fingerprint = excluded.requirements_fingerprint
    `);
    stmtPlan.run(
      plan.planId,
      plan.taskId,
      plan.summary,
      JSON.stringify(plan.outOfScopeBoundaries),
      plan.planVersion || 1,
      plan.requirementsFingerprint || null,
      plan.createdAt
    );

    const stmtDeleteSteps = this.db.prepare(`DELETE FROM test_steps WHERE plan_id = ?`);
    stmtDeleteSteps.run(plan.planId);

    const stmtStep = this.db.prepare(`
      INSERT INTO test_steps (
        id, plan_id, step_number, goal, action_type, target_selector,
        target_description, input_value, expected_behavior, risk_category,
        preconditions_json, allowed_actions_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        plan_id = excluded.plan_id,
        step_number = excluded.step_number,
        goal = excluded.goal,
        action_type = excluded.action_type,
        target_selector = excluded.target_selector,
        target_description = excluded.target_description,
        input_value = excluded.input_value,
        expected_behavior = excluded.expected_behavior,
        risk_category = excluded.risk_category,
        preconditions_json = excluded.preconditions_json,
        allowed_actions_json = excluded.allowed_actions_json
    `);

    for (const step of plan.steps) {
      stmtStep.run(
        step.stepId,
        plan.planId,
        step.stepNumber,
        step.goal,
        step.actionType,
        step.targetSelector || null,
        step.targetDescription || null,
        step.inputValue || null,
        step.expectedBehavior,
        step.riskCategory,
        JSON.stringify(step.preconditions),
        JSON.stringify(step.allowedActions)
      );
    }
  }

  public getTestPlanForTask(taskId: string): TestPlan | null {
    const stmtPlan = this.db.prepare(
      `SELECT * FROM test_plans WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
    );
    const planRow = stmtPlan.get(taskId) as Record<string, unknown> | undefined;
    if (!planRow) return null;

    const stmtSteps = this.db.prepare(
      `SELECT * FROM test_steps WHERE plan_id = ? ORDER BY step_number ASC`
    );
    const stepRows = stmtSteps.all(planRow.id as string) as Array<Record<string, unknown>>;

    const steps: TestPlanStep[] = stepRows.map((s) => ({
      stepId: s.id as string,
      stepNumber: s.step_number as number,
      goal: s.goal as string,
      actionType: s.action_type as string,
      targetSelector: (s.target_selector as string) || undefined,
      targetDescription: (s.target_description as string) || undefined,
      inputValue: (s.input_value as string) || undefined,
      expectedBehavior: s.expected_behavior as string,
      riskCategory: s.risk_category as any,
      preconditions: s.preconditions_json ? JSON.parse(s.preconditions_json as string) : [],
      allowedActions: s.allowed_actions_json ? JSON.parse(s.allowed_actions_json as string) : [],
      verificationMethod: 'DOM_ASSERTION',
      evidenceRequirements: ['SCREENSHOT']
    }));

    return {
      planId: planRow.id as string,
      taskId: planRow.task_id as string,
      summary: planRow.summary as string,
      outOfScopeBoundaries: planRow.boundaries_json ? JSON.parse(planRow.boundaries_json as string) : [],
      steps,
      planVersion: (planRow.plan_version as number) || 1,
      requirementsFingerprint: (planRow.requirements_fingerprint as string) || undefined,
      createdAt: planRow.created_at as string
    };
  }

  public deleteTestPlanForTask(taskId: string): void {
    const stmtFind = this.db.prepare(`SELECT id FROM test_plans WHERE task_id = ?`);
    const rows = stmtFind.all(taskId) as Array<Record<string, unknown>>;
    for (const r of rows) {
      this.db.prepare(`DELETE FROM test_steps WHERE plan_id = ?`).run(r.id as string);
    }
    this.db.prepare(`DELETE FROM test_plans WHERE task_id = ?`).run(taskId);
  }

  private mapAuthorizationRow(r: Record<string, unknown>): AuthorizationRecord {
    const isRevoked = Boolean(r.is_revoked);
    const now = new Date();
    const exp = new Date(r.expiration_time as string);
    const start = new Date(r.start_time as string);
    let status: AuthorizationStatus = 'ACTIVE';
    if (isRevoked) {
      status = 'REVOKED';
    } else if (now > exp) {
      status = 'EXPIRED';
    } else if (now < start) {
      status = 'PENDING';
    }

    let auditHistory: AuthorizationAuditEntry[] = [];
    if (r.audit_history_json) {
      try {
        auditHistory = JSON.parse(r.audit_history_json as string);
      } catch {
        auditHistory = [];
      }
    }

    return {
      id: r.id as string,
      grantingOrgOrPerson: r.granting_party as string,
      verificationEvidence: r.verification_evidence as string,
      scope: r.scope as string,
      allowedDomains: JSON.parse(r.allowed_domains_json as string),
      allowedActions: JSON.parse(r.allowed_actions_json as string),
      allowedDeviceTypes: JSON.parse(r.allowed_devices_json as string),
      startTime: r.start_time as string,
      expirationTime: r.expiration_time as string,
      isRevoked,
      status: (r.status as AuthorizationStatus) || status,
      revocationReason: (r.revocation_reason as string) || undefined,
      auditHistory,
      createdAt: r.created_at as string,
      updatedAt: (r.updated_at as string) || undefined
    };
  }

  public saveAuthorization(auth: AuthorizationRecord): void {
    const now = new Date();
    const exp = new Date(auth.expirationTime);
    const start = new Date(auth.startTime);
    let computedStatus: AuthorizationStatus = 'ACTIVE';
    if (auth.isRevoked) {
      computedStatus = 'REVOKED';
    } else if (now > exp) {
      computedStatus = 'EXPIRED';
    } else if (now < start) {
      computedStatus = 'PENDING';
    }
    const finalStatus = auth.status || computedStatus;

    const stmt = this.db.prepare(`
      INSERT INTO authorizations (
        id, granting_party, verification_evidence, scope, allowed_domains_json,
        allowed_actions_json, allowed_devices_json, start_time, expiration_time, is_revoked,
        status, revocation_reason, audit_history_json, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        granting_party = excluded.granting_party,
        verification_evidence = excluded.verification_evidence,
        scope = excluded.scope,
        allowed_domains_json = excluded.allowed_domains_json,
        allowed_actions_json = excluded.allowed_actions_json,
        allowed_devices_json = excluded.allowed_devices_json,
        start_time = excluded.start_time,
        expiration_time = excluded.expiration_time,
        is_revoked = excluded.is_revoked,
        status = excluded.status,
        revocation_reason = excluded.revocation_reason,
        audit_history_json = excluded.audit_history_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      auth.id,
      auth.grantingOrgOrPerson,
      auth.verificationEvidence,
      auth.scope,
      JSON.stringify(auth.allowedDomains),
      JSON.stringify(auth.allowedActions),
      JSON.stringify(auth.allowedDeviceTypes),
      auth.startTime,
      auth.expirationTime,
      auth.isRevoked ? 1 : 0,
      finalStatus,
      auth.revocationReason || null,
      JSON.stringify(auth.auditHistory || []),
      auth.updatedAt || new Date().toISOString(),
      auth.createdAt
    );
  }

  public getAuthorization(id: string): AuthorizationRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM authorizations WHERE id = ?`);
    const r = stmt.get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return this.mapAuthorizationRow(r);
  }

  public listAuthorizations(): AuthorizationRecord[] {
    const stmt = this.db.prepare(`SELECT * FROM authorizations ORDER BY created_at DESC`);
    const rows = stmt.all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapAuthorizationRow(r));
  }

  public createVerifiedAuthorization(dto: CreateAuthorizationDto): AuthorizationRecord {
    const grantor = (dto.grantingOrgOrPerson || dto.grantingParty || '').trim();
    if (!grantor) {
      throw new Error('grantingOrgOrPerson is required for verified authorization');
    }
    const rawDomains = dto.allowedDomains && dto.allowedDomains.length > 0
      ? dto.allowedDomains
      : (dto.domain ? [dto.domain] : []);
    if (rawDomains.length === 0) {
      throw new Error('At least one allowedDomain is required');
    }
    const sanitizedDomains = rawDomains
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, ''))
      .filter(Boolean);

    if (sanitizedDomains.length === 0) {
      throw new Error('No valid domain names provided in allowedDomains');
    }

    if (sanitizedDomains.includes('*') || sanitizedDomains.includes('all')) {
      throw new Error('Wildcard domains (*) are strictly prohibited by security policy');
    }

    // Prohibit authorizing tester.test.io platform for autonomous testing
    for (const d of sanitizedDomains) {
      if (d === 'tester.test.io' || d.endsWith('.test.io')) {
        throw new Error(`Authorizing Test IO platform '${d}' for autonomous testing is strictly prohibited by security policy.`);
      }
    }

    const now = new Date().toISOString();
    const id = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auth: AuthorizationRecord = {
      id,
      grantingOrgOrPerson: (dto.grantingOrgOrPerson || dto.grantingParty || 'Authorized Grantor').trim(),
      verificationEvidence: (dto.verificationEvidence || 'Verified manual authorization grant').trim(),
      scope: (dto.scope || 'EXPLORATORY').trim(),
      allowedDomains: sanitizedDomains,
      allowedActions: dto.allowedActions || ['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'SCROLL', 'CAPTURE', 'FINISH'],
      allowedDeviceTypes: dto.allowedDeviceTypes || ['Desktop Chrome', 'Windows 11'],
      startTime: dto.startTime || now,
      expirationTime: dto.expirationTime || dto.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
      isRevoked: false,
      status: 'ACTIVE',
      auditHistory: [
        {
          action: 'CREATED',
          timestamp: now,
          actor: 'SECURITY_AUDITOR_USER',
          details: `Verified authorization grant created for domain(s) [${sanitizedDomains.join(', ')}] granted by '${grantor}'`
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    this.saveAuthorization(auth);
    return auth;
  }

  public revokeAuthorization(id: string, reason?: string): AuthorizationRecord {
    const existing = this.getAuthorization(id);
    if (!existing) {
      throw new Error(`Authorization grant '${id}' not found`);
    }
    const now = new Date().toISOString();
    const revocationReason = reason || 'Revoked by authorized operator';
    existing.isRevoked = true;
    existing.status = 'REVOKED';
    existing.revocationReason = revocationReason;
    existing.updatedAt = now;
    existing.auditHistory = existing.auditHistory || [];
    existing.auditHistory.push({
      action: 'REVOKED',
      timestamp: now,
      actor: 'SECURITY_AUDITOR_USER',
      details: revocationReason
    });
    this.saveAuthorization(existing);
    return existing;
  }

  public saveCandidateBug(bug: CandidateBug): void {
    const stmt = this.db.prepare(`
      INSERT INTO candidate_bugs (
        id, run_id, step_id, title, severity, expected_result, actual_result,
        page_url, environment, reproduction_status, evidence_ids_json, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        reproduction_status = excluded.reproduction_status
    `);
    stmt.run(
      bug.id,
      bug.runId,
      bug.stepId || null,
      bug.title,
      bug.severity,
      bug.expectedResult,
      bug.actualResult,
      bug.pageUrl,
      bug.environment,
      bug.reproductionStatus,
      JSON.stringify(bug.evidenceIds),
      bug.timestamp
    );
  }

  public listCandidateBugs(runId?: string): CandidateBug[] {
    const query = runId
      ? `SELECT * FROM candidate_bugs WHERE run_id = ? ORDER BY timestamp DESC`
      : `SELECT * FROM candidate_bugs ORDER BY timestamp DESC`;
    const stmt = this.db.prepare(query);
    const rows = (runId ? stmt.all(runId) : stmt.all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      runId: r.run_id as string,
      stepId: (r.step_id as string) || undefined,
      title: r.title as string,
      severity: r.severity as any,
      expectedResult: r.expected_result as string,
      actualResult: r.actual_result as string,
      pageUrl: r.page_url as string,
      actionHistory: [],
      environment: r.environment as string,
      evidenceIds: r.evidence_ids_json ? JSON.parse(r.evidence_ids_json as string) : [],
      reproductionStatus: r.reproduction_status as any,
      timestamp: r.timestamp as string
    }));
  }

  public saveEvidence(evidence: EvidenceRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO evidence (
        id, run_id, step_id, type, file_path, file_size_bytes, sha256_hash, is_redacted, captured_at, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        sha256_hash = excluded.sha256_hash,
        category = excluded.category
    `);
    stmt.run(
      evidence.id,
      evidence.runId,
      evidence.stepId || null,
      evidence.type,
      evidence.filePath,
      evidence.fileSizeBytes,
      evidence.sha256Hash,
      evidence.isRedacted ? 1 : 0,
      evidence.capturedAt,
      evidence.category || 'FUNCTIONAL_EVIDENCE'
    );
  }

  public getEvidence(id: string): EvidenceRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM evidence WHERE id = ?`);
    const r = stmt.get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      runId: r.run_id as string,
      stepId: (r.step_id as string) || undefined,
      type: r.type as any,
      filePath: r.file_path as string,
      fileSizeBytes: r.file_size_bytes as number,
      sha256Hash: r.sha256_hash as string,
      isRedacted: Boolean(r.is_redacted),
      capturedAt: r.captured_at as string,
      category: (r.category as any) || 'FUNCTIONAL_EVIDENCE'
    };
  }

  public saveReportDraft(report: ReportDraft): void {
    const stmt = this.db.prepare(`
      INSERT INTO report_drafts (
        id, task_id, run_id, report_type, title, status, environment_json,
        steps_json, expected_result, actual_result, evidence_json, scope_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        expected_result = excluded.expected_result,
        actual_result = excluded.actual_result,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      report.id,
      report.taskId,
      report.runId,
      report.reportType,
      report.title,
      report.status,
      JSON.stringify(report.environmentDetails),
      JSON.stringify(report.stepsToReproduce),
      report.expectedResult,
      report.actualResult,
      JSON.stringify(report.evidenceLinks),
      report.scopeComplianceNote,
      report.createdAt,
      report.updatedAt
    );
  }

  public getReportDraft(id: string): ReportDraft | null {
    const stmt = this.db.prepare(`SELECT * FROM report_drafts WHERE id = ?`);
    const r = stmt.get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      taskId: r.task_id as string,
      runId: r.run_id as string,
      reportType: r.report_type as any,
      title: r.title as string,
      status: r.status as any,
      environmentDetails: JSON.parse(r.environment_json as string),
      stepsToReproduce: JSON.parse(r.steps_json as string),
      expectedResult: r.expected_result as string,
      actualResult: r.actual_result as string,
      evidenceLinks: JSON.parse(r.evidence_json as string),
      scopeComplianceNote: (r.scope_note as string) || '',
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string
    };
  }

  public logAudit(entry: AuditLogEntry): void {
    const id = entry.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, task_id, run_id, tool_name, action_summary, permission_decision, target_domain, timestamp, outcome, error_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.taskId || null,
      entry.runId || null,
      entry.toolName,
      entry.actionSummary,
      entry.permissionDecision,
      entry.targetDomain || null,
      entry.timestamp,
      entry.outcome,
      entry.errorCode || null
    );
  }

  public listAuditLogs(limit: number = 100): AuditLogEntry[] {
    const stmt = this.db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?`);
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      taskId: (r.task_id as string) || undefined,
      runId: (r.run_id as string) || undefined,
      toolName: r.tool_name as string,
      actionSummary: r.action_summary as string,
      permissionDecision: r.permission_decision as any,
      targetDomain: (r.target_domain as string) || undefined,
      timestamp: r.timestamp as string,
      outcome: r.outcome as any,
      errorCode: (r.error_code as string) || undefined
    }));
  }

  public getDashboardMetrics() {
    const taskCount = (this.db.prepare(`SELECT COUNT(*) as c FROM tasks`).get() as any).c;
    const activeRuns = (
      this.db.prepare(`SELECT COUNT(*) as c FROM agent_runs WHERE status = 'RUNNING'`).get() as any
    ).c;
    const pendingReviews = (
      this.db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE status = 'NEEDS_REVIEW'`).get() as any
    ).c;
    const bugCount = (this.db.prepare(`SELECT COUNT(*) as c FROM candidate_bugs`).get() as any).c;
    const reportCount = (this.db.prepare(`SELECT COUNT(*) as c FROM report_drafts`).get() as any).c;
    const auditCount = (this.db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get() as any).c;

    return {
      taskCount,
      activeRuns,
      pendingReviews,
      bugCount,
      reportCount,
      auditCount
    };
  }

  public getRun(id: string) {
    const stmt = this.db.prepare(`SELECT * FROM agent_runs WHERE id = ?`);
    const r = stmt.get(id) as Record<string, unknown> | undefined;
    if (!r) return null;
    return {
      id: r.id as string,
      taskId: r.task_id as string,
      status: r.status as string,
      mode: r.mode as string,
      totalSteps: r.total_steps as number,
      passedSteps: r.passed_steps as number,
      failedSteps: r.failed_steps as number,
      bugsFound: r.bugs_found as number,
      startTime: r.start_time as string,
      endTime: (r.end_time as string) || undefined
    };
  }

  public listRuns(limit: number = 20) {
    const stmt = this.db.prepare(`SELECT * FROM agent_runs ORDER BY start_time DESC LIMIT ?`);
    const rows = stmt.all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      taskId: r.task_id as string,
      status: r.status as string,
      mode: r.mode as string,
      totalSteps: r.total_steps as number,
      passedSteps: r.passed_steps as number,
      failedSteps: r.failed_steps as number,
      bugsFound: r.bugs_found as number,
      startTime: r.start_time as string,
      endTime: (r.end_time as string) || undefined
    }));
  }

  public listEvidence(runId?: string): EvidenceRecord[] {
    const query = runId
      ? `SELECT * FROM evidence WHERE run_id = ? ORDER BY captured_at DESC`
      : `SELECT * FROM evidence ORDER BY captured_at DESC`;
    const stmt = this.db.prepare(query);
    const rows = (runId ? stmt.all(runId) : stmt.all()) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      runId: r.run_id as string,
      stepId: (r.step_id as string) || undefined,
      type: r.type as any,
      filePath: r.file_path as string,
      fileSizeBytes: r.file_size_bytes as number,
      sha256Hash: r.sha256_hash as string,
      isRedacted: Boolean(r.is_redacted),
      capturedAt: r.captured_at as string,
      category: (r.category as any) || 'FUNCTIONAL_EVIDENCE'
    }));
  }

  public findAuthorizationForDomain(domain: string, includeRevoked: boolean = false): AuthorizationRecord | null {
    const query = includeRevoked
      ? `SELECT * FROM authorizations ORDER BY (CASE WHEN id = 'auth_demo_lab' THEN 1 ELSE 0 END) ASC, created_at DESC`
      : `SELECT * FROM authorizations WHERE is_revoked = 0 ORDER BY (CASE WHEN id = 'auth_demo_lab' THEN 1 ELSE 0 END) ASC, created_at DESC`;
    const stmt = this.db.prepare(query);
    const rows = stmt.all() as Array<Record<string, unknown>>;
    const norm = domain.toLowerCase();

    for (const r of rows) {
      const allowedDomains = JSON.parse(r.allowed_domains_json as string) as string[];
      const match = allowedDomains.some((d) => {
        const ld = d.toLowerCase();
        return (
          ld === norm ||
          norm.endsWith(`.${ld}`) ||
          ((norm === 'localhost' || norm === '127.0.0.1') && (ld === 'localhost' || ld === '127.0.0.1'))
        );
      });
      if (match) {
        return this.mapAuthorizationRow(r);
      }
    }
    return null;
  }

  public evaluateTargetAuthorization(targetUrl: string): AuthorizationEvaluationResult {
    let hostname = '';
    try {
      const parsed = new URL(targetUrl);
      hostname = parsed.hostname.toLowerCase();
    } catch {
      return {
        targetUrl,
        targetDomain: '',
        isAuthorized: false,
        status: 'UNAUTHORIZED',
        reason: 'Invalid or unparseable target URL.',
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: false
      };
    }

    // 1. Block tester.test.io unconditionally from automated browsing
    if (hostname === 'tester.test.io' || hostname.endsWith('.test.io')) {
      return {
        targetUrl,
        targetDomain: hostname,
        isAuthorized: false,
        authorized: false,
        isTestIo: true,
        status: 'BLOCKED_PLATFORM',
        reason: `Autonomous browser automation on Test IO platform '${hostname}' is prohibited by policy. Use manual browser viewing mode.`,
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: true
      };
    }

    // 2. Resolve authorization record (including revoked ones to report accurate status)
    let auth = this.findAuthorizationForDomain(hostname, true);
    if (!auth && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      this.seedDemoAuthorizationIfMissing();
      auth = this.findAuthorizationForDomain(hostname, true);
    }

    if (!auth) {
      return {
        targetUrl,
        targetDomain: hostname,
        isAuthorized: false,
        authorized: false,
        isTestIo: false,
        status: 'UNAUTHORIZED',
        reason: `AUTHORIZATION_REQUIRED: No verified authorization record exists for domain '${hostname}'. Autonomous testing requires an explicit authorization grant.`,
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: true
      };
    }

    if (auth.isRevoked) {
      return {
        targetUrl,
        targetDomain: hostname,
        isAuthorized: false,
        authorized: false,
        isTestIo: false,
        status: 'REVOKED',
        authorization: auth,
        reason: `Authorization grant '${auth.id}' for domain '${hostname}' has been revoked (${auth.revocationReason || 'No reason provided'}).`,
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: true
      };
    }

    const now = new Date();
    const expiry = new Date(auth.expirationTime);
    if (now > expiry) {
      return {
        targetUrl,
        targetDomain: hostname,
        isAuthorized: false,
        authorized: false,
        isTestIo: false,
        status: 'EXPIRED',
        authorization: auth,
        reason: `Authorization grant '${auth.id}' for domain '${hostname}' expired on ${auth.expirationTime}.`,
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: true
      };
    }

    return {
      targetUrl,
      targetDomain: hostname,
      isAuthorized: true,
      authorized: true,
      isTestIo: false,
      status: 'AUTHORIZED',
      authorization: auth,
      reason: `Verified authorization grant '${auth.id}' issued by '${auth.grantingOrgOrPerson}'. Valid until ${auth.expirationTime}.`,
      canExecuteAutonomousRun: true,
      canOpenManualBrowser: true
    };
  }

  public getAuthorizationStatusForTask(taskId: string): AuthorizationEvaluationResult {
    const task = this.getTask(taskId);
    if (!task || !task.targetUrl) {
      return {
        targetUrl: '',
        targetDomain: '',
        isAuthorized: false,
        status: 'UNAUTHORIZED',
        reason: task ? 'Task does not specify a target URL.' : `Task '${taskId}' not found.`,
        canExecuteAutonomousRun: false,
        canOpenManualBrowser: false
      };
    }
    return this.evaluateTargetAuthorization(task.targetUrl);
  }

  public seedDemoAuthorizationIfMissing(): void {
    const existing = this.findAuthorizationForDomain('localhost') || this.findAuthorizationForDomain('127.0.0.1');
    if (!existing) {
      const demoAuth: AuthorizationRecord = {
        id: 'auth_demo_lab',
        grantingOrgOrPerson: 'Test IO Agent Studio Self-Hosted Testing Lab',
        verificationEvidence: 'Local Sandbox / Owned Testing Target Grant',
        scope: 'Automated exploratory & regression testing on owned demo lab port 4173',
        allowedDomains: ['localhost', '127.0.0.1'],
        allowedActions: ['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'SCROLL', 'CAPTURE', 'FINISH'],
        allowedDeviceTypes: ['Desktop Chrome', 'Windows 11'],
        startTime: new Date(Date.now() - 86400000).toISOString(),
        expirationTime: new Date(Date.now() + 30 * 86400000).toISOString(),
        isRevoked: false,
        createdAt: new Date().toISOString()
      };
      this.saveAuthorization(demoAuth);
    }
  }

  public seedDemoTasksIfEmpty(): void {
    this.seedDemoAuthorizationIfMissing();

    const count = (this.db.prepare(`SELECT COUNT(*) as c FROM tasks`).get() as any).c;
    if (count > 0) return;

    // Seed Task 1
    const task1: TaskRecord = {
      id: 'task_demo_1',
      title: '[DEMO] Shopping Cart & Total Calculation Verification',
      description: 'Add Product 1 ($29.99) and Product 2 ($49.99) to shopping cart. Open cart drawer and assert mathematical total ($79.98). Do not execute payments.',
      sourcePlatform: 'TEST_IO_DEMO',
      targetUrl: 'http://127.0.0.1:4173',
      targetApp: 'Demo Testing Lab (E-Commerce)',
      cycleId: 'cycle_demo_lab',
      status: 'READY',
      executionMode: 'COPILOT_MODE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveTask(task1);

    // Seed Task 2
    const task2: TaskRecord = {
      id: 'task_demo_2',
      title: '[DEMO] Customer Authentication & Form Validation Check',
      description: 'Navigate to login dialog. Submit blank fields and verify client-side validation errors are shown.',
      sourcePlatform: 'TEST_IO_DEMO',
      targetUrl: 'http://127.0.0.1:4173',
      targetApp: 'Demo Testing Lab (Auth)',
      cycleId: 'cycle_demo_lab',
      status: 'READY',
      executionMode: 'COPILOT_MODE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveTask(task2);
  }

  public getSetting(key: string): string | null {
    const stmt = this.db.prepare(`SELECT value FROM application_settings WHERE key = ?`);
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  public setSetting(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO application_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, value);
  }

  public close(): void {
    this.db.close();
  }
}

