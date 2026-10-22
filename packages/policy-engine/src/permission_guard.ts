import type {
  ActionContext,
  PermissionDecision
} from '@test-io-agent/shared';

export interface ActionCandidate {
  type: string;
  target?: string;
  domain?: string;
  payload?: Record<string, unknown>;
  isUserApproved?: boolean;
}

export const BLOCKED_DOMAINS_DEFAULT = [
  'tester.test.io',
  'test.io',
  'epamext.test.io',
  'paypal.com',
  'stripe.com',
  'checkout.stripe.com'
];

export const FORBIDDEN_ACTION_TYPES = new Set([
  'EXECUTE_SHELL',
  'POWERSHELL',
  'MODIFY_REGISTRY',
  'DELETE_LOCAL_FILES',
  'KILL_PROCESS',
  'SUBMIT_EXTERNAL_BUG_REPORT',
  'SUBMIT_CREDIT_CARD',
  'MODIFY_PASSWORD',
  'DELETE_ACCOUNT'
]);

/**
 * Core Permission Guard.
 * Contract: checkActionPermission(context, action): PermissionDecision
 * Rule: Default MUST be DENY.
 */
export function checkActionPermission(
  context: ActionContext,
  action: ActionCandidate
): PermissionDecision {
  // 1. Immediately block critical high-risk prohibited actions
  const upperType = action.type.toUpperCase();
  if (FORBIDDEN_ACTION_TYPES.has(upperType)) {
    return {
      status: 'DENY',
      reason: `Action '${action.type}' is strictly prohibited by security policy.`,
      violations: ['HIGH_RISK_ACTION_PROHIBITED']
    };
  }

  // 2. Extract and check domain restrictions
  const targetDomain = (action.domain || context.destinationDomain || '').toLowerCase();
  
  for (const blocked of BLOCKED_DOMAINS_DEFAULT) {
    if (targetDomain === blocked || targetDomain.endsWith(`.${blocked}`)) {
      return {
        status: 'DENY',
        reason: `Target domain '${targetDomain}' is explicitly blocked (e.g. Test IO platform or payment processor).`,
        violations: ['BLOCKED_DOMAIN_ACCESS']
      };
    }
  }

  // 3. Mode-specific authorization
  if (context.executionMode === 'COPILOT_MODE') {
    // In copilot mode, AI only advises, analyzes, and drafts. It cannot execute active browser clicks/inputs.
    if (['CLICK', 'FILL', 'TYPE', 'SUBMIT', 'UPLOAD'].includes(upperType)) {
      return {
        status: 'DENY',
        reason: 'COPILOT_MODE does not allow automated physical/browser actions. Switch to SUPERVISED_MODE or AUTHORIZED_AUTO_MODE.'
      };
    }
    return {
      status: 'ALLOW',
      reason: 'Read-only / inspection action allowed in COPILOT_MODE.'
    };
  }

  if (context.executionMode === 'SUPERVISED_MODE') {
    // In supervised mode, every action requires explicit human approval if not yet approved
    if (action.isUserApproved) {
      return {
        status: 'ALLOW',
        reason: 'Action approved by human operator in SUPERVISED_MODE.'
      };
    }
    return {
      status: 'REQUIRE_HUMAN_APPROVAL',
      reason: 'SUPERVISED_MODE requires human confirmation before executing action.'
    };
  }

  if (context.executionMode === 'AUTHORIZED_AUTO_MODE') {
    // Must possess an active, non-revoked authorization record covering target domain
    if (!context.authorization) {
      return {
        status: 'DENY',
        reason: 'AUTHORIZED_AUTO_MODE requires a valid AuthorizationRecord.',
        violations: ['MISSING_AUTHORIZATION_RECORD']
      };
    }

    if (context.authorization.isRevoked || context.authorization.status === 'REVOKED') {
      return {
        status: 'DENY',
        reason: 'Authorization record has been revoked.',
        violations: ['REVOKED_AUTHORIZATION']
      };
    }

    const expiryTime = context.authorization.expirationTime || context.authorization.expiresAt;
    if (expiryTime) {
      const now = new Date();
      const expiry = new Date(expiryTime);
      if (now > expiry) {
        return {
          status: 'DENY',
          reason: 'Authorization record has expired.',
          violations: ['EXPIRED_AUTHORIZATION']
        };
      }
    }

    // Verify allowed domain
    const allowedDomains = context.authorization.allowedDomains.map((d) => d.toLowerCase());
    const isDomainAllowed = allowedDomains.some((d) => {
      if (d === '*' || d === 'all') return false; // Wildcard all is forbidden
      return targetDomain === d || targetDomain.endsWith(`.${d}`);
    });

    if (!isDomainAllowed) {
      return {
        status: 'DENY',
        reason: `Domain '${targetDomain}' is not in authorized domain scope: [${allowedDomains.join(', ')}].`,
        violations: ['DOMAIN_OUT_OF_SCOPE']
      };
    }

    // Verify allowed actions
    const allowedActions = context.authorization.allowedActions.map((a) => a.toUpperCase());
    if (
      !allowedActions.includes('*') &&
      !allowedActions.includes('ALL') &&
      !allowedActions.includes(upperType)
    ) {
      return {
        status: 'DENY',
        reason: `Action '${action.type}' is not in authorized actions list.`,
        violations: ['ACTION_NOT_PERMITTED_IN_SCOPE']
      };
    }

    return {
      status: 'ALLOW',
      reason: 'Action verified against active AuthorizationRecord.'
    };
  }

  // Fallback: Default MUST be DENY
  return {
    status: 'DENY',
    reason: 'Default policy: action rejected because no rule explicitly allowed it.'
  };
}
