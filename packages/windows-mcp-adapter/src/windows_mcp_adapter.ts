import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  WindowsMcpConfig,
  McpConnection,
  DesktopSnapshotOptions,
  DesktopSnapshot,
  TargetDescriptor,
  TargetResolution,
  DesktopAction,
  ActionResult,
  ActionContext
} from '@test-io-agent/shared';
import { checkActionPermission } from '@test-io-agent/policy-engine';

export const SAFE_ALLOWED_MCP_TOOLS = [
  'Screenshot',
  'Snapshot',
  'DisplayInventory',
  'ControlStatus',
  'Click',
  'Type',
  'Scroll',
  'Move',
  'Shortcut',
  'Wait',
  'WaitFor'
];

export class WindowsMcpProcessManager {
  private childProcess: ChildProcess | null = null;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isReady: boolean = false;
  private stderrBuffer: string[] = [];

  constructor(private config: WindowsMcpConfig = {}) {}

  public async connect(): Promise<McpConnection> {
    if (process.platform !== 'win32') {
      throw new Error(
        `Windows-MCP requires Windows OS. Detected platform '${process.platform}'. For macOS/Linux, use Browser adapter or mock mode.`
      );
    }

    const projectDir = path.resolve(this.config.projectDir || './research/windows-mcp-reference');
    if (!fs.existsSync(projectDir)) {
      throw new Error(
        `Windows-MCP reference directory does not exist at '${projectDir}'. Please ensure the repository is present.`
      );
    }

    const toolsArg = (this.config.allowedTools || SAFE_ALLOWED_MCP_TOOLS).join(',');
    const idleTimeout = String(this.config.idleTimeoutSeconds ?? 10.0);
    const policy = this.config.controlPolicy ?? 'relaxed';

    const args = [
      'run',
      '--python',
      '3.14',
      '--project',
      projectDir,
      'windows-mcp',
      'serve',
      '--transport',
      'stdio',
      '--tools',
      toolsArg,
      '--control-idle-timeout',
      idleTimeout,
      '--control-policy',
      policy
    ];

    const env = {
      ...process.env,
      ANONYMIZED_TELEMETRY: 'false',
      PYTHONIOENCODING: 'utf-8'
    };

    // StdioClientTransport spawns the process directly using MCP client sdk
    this.transport = new StdioClientTransport({
      command: 'uv',
      args,
      env
    });

    this.client = new Client(
      {
        name: 'test-io-agent-studio-client',
        version: '1.0.0'
      },
      {
        capabilities: {}
      }
    );

    try {
      await this.client.connect(this.transport);
      this.isReady = true;

      // Discover and verify tools
      const toolListResult = await this.client.listTools();
      const discoveredTools = toolListResult.tools.map((t) => t.name);

      // Verify no blocked tools leaked
      const forbiddenFound = discoveredTools.filter((t) =>
        ['Shell', 'PowerShell', 'Registry', 'FileSystem', 'Process'].includes(t)
      );
      if (forbiddenFound.length > 0) {
        throw new Error(
          `Security violation: Windows-MCP exposed forbidden tools: ${forbiddenFound.join(', ')}`
        );
      }

      return {
        isConnected: true,
        transport: 'stdio',
        discoveredTools,
        disconnect: () => this.disconnect(),
        callTool: (toolName: string, callArgs: Record<string, unknown>) =>
          this.callTool(toolName, callArgs)
      };
    } catch (err: any) {
      this.disconnect();
      throw new Error(`Failed to initialize Windows-MCP stdio connection: ${err?.message || err}`);
    }
  }

  public async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client || !this.isReady) {
      throw new Error('Windows-MCP connection is not established.');
    }
    if (!SAFE_ALLOWED_MCP_TOOLS.includes(toolName)) {
      throw new Error(`Tool '${toolName}' is not in the authorized Windows-MCP whitelist.`);
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: args
    });
    return result;
  }

  public async disconnect(): Promise<void> {
    this.isReady = false;
    if (this.client) {
      try {
        await this.client.close();
      } catch (_) {}
      this.client = null;
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (_) {}
      this.transport = null;
    }
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }
}

let activeProcessManager: WindowsMcpProcessManager | null = null;
let activeConnection: McpConnection | null = null;

/**
 * Connect to Windows-MCP
 */
export async function connectWindowsMcp(config: WindowsMcpConfig = {}): Promise<McpConnection> {
  activeProcessManager = new WindowsMcpProcessManager(config);
  activeConnection = await activeProcessManager.connect();
  return activeConnection;
}

/**
 * Capture Desktop Snapshot
 */
export async function captureDesktopSnapshot(
  options: DesktopSnapshotOptions = {}
): Promise<DesktopSnapshot> {
  const timestamp = new Date().toISOString();

  if (!activeConnection || !activeConnection.isConnected) {
    // Return structured offline diagnostic snapshot if MCP not connected
    return {
      timestamp,
      activeWindow: { title: 'Desktop (MCP Offline)', processId: 0 },
      windows: [],
      uiElements: [],
      displayMetadata: [{ index: 0, width: 1920, height: 1080, scale: 1.0 }]
    };
  }

  try {
    const rawResult: any = await activeConnection.callTool('Snapshot', {
      use_vision: Boolean(options.includeVision),
      use_ui_tree: Boolean(options.includeUiTree ?? true),
      use_annotation: Boolean(options.useAnnotation ?? false),
      display: options.displayIndices,
      region: options.region
    });

    return {
      timestamp,
      activeWindow: { title: 'Windows Desktop Active Window', processId: 1000 },
      windows: [],
      uiElements: [],
      displayMetadata: [{ index: 0, width: 1920, height: 1080, scale: 1.0 }],
      screenshotBase64: typeof rawResult === 'string' ? rawResult : undefined
    };
  } catch (error: any) {
    throw new Error(`captureDesktopSnapshot failed: ${error?.message || error}`);
  }
}

/**
 * Resolve Desktop Target using UI Element identity or fallback coordinates
 */
export function resolveDesktopTarget(
  snapshot: DesktopSnapshot,
  descriptor: TargetDescriptor
): TargetResolution {
  // 1. Resolve by label ID if present
  if (descriptor.labelId !== undefined) {
    const matched = snapshot.uiElements.find((e) => e.label === descriptor.labelId);
    if (matched && matched.boundingBox) {
      const [l, t, r, b] = matched.boundingBox;
      return {
        resolved: true,
        coordinates: [Math.round((l + r) / 2), Math.round((t + b) / 2)],
        labelId: descriptor.labelId,
        confidence: 0.95,
        reason: `Matched element label ID ${descriptor.labelId}`
      };
    }
  }

  // 2. Resolve by element name
  if (descriptor.elementName) {
    const query = descriptor.elementName.toLowerCase();
    const matched = snapshot.uiElements.find((e) => e.name.toLowerCase().includes(query));
    if (matched && matched.boundingBox) {
      const [l, t, r, b] = matched.boundingBox;
      return {
        resolved: true,
        coordinates: [Math.round((l + r) / 2), Math.round((t + b) / 2)],
        labelId: matched.label,
        confidence: 0.85,
        reason: `Matched element by name '${descriptor.elementName}'`
      };
    }
  }

  // 3. Fallback to coordinate specification if provided
  if (descriptor.coordinates) {
    return {
      resolved: true,
      coordinates: descriptor.coordinates,
      confidence: 0.6,
      reason: 'Direct coordinate target'
    };
  }

  return {
    resolved: false,
    confidence: 0.0,
    reason: 'Target element could not be found in current desktop snapshot'
  };
}

/**
 * Execute Desktop Action after Permission Check
 */
export async function executeDesktopAction(
  action: DesktopAction,
  context: ActionContext
): Promise<ActionResult> {
  const started = Date.now();

  // 1. Permission check
  const perm = checkActionPermission(context, {
    type: `DESKTOP_${action.actionType.toUpperCase()}`,
    target: action.text || (action.loc ? `${action.loc[0]},${action.loc[1]}` : undefined)
  });

  if (perm.status !== 'ALLOW') {
    return {
      success: false,
      actionSummary: `Desktop action ${action.actionType} denied: ${perm.reason}`,
      durationMs: Date.now() - started,
      errorMessage: perm.reason
    };
  }

  if (!activeConnection || !activeConnection.isConnected) {
    return {
      success: false,
      actionSummary: `Desktop action failed: Windows-MCP server not connected.`,
      durationMs: Date.now() - started,
      errorMessage: 'Windows-MCP is offline.'
    };
  }

  try {
    let result: unknown;
    if (action.actionType === 'click') {
      result = await activeConnection.callTool('Click', {
        loc: action.loc,
        label: action.label,
        button: action.button || 'left',
        clicks: action.clicks ?? 1
      });
    } else if (action.actionType === 'type') {
      result = await activeConnection.callTool('Type', {
        text: action.text || '',
        loc: action.loc,
        label: action.label,
        clear: action.clear ?? false,
        press_enter: action.pressEnter ?? false
      });
    } else if (action.actionType === 'scroll') {
      result = await activeConnection.callTool('Scroll', {
        loc: action.loc,
        label: action.label,
        direction: action.scrollDirection || 'down'
      });
    } else if (action.actionType === 'wait') {
      result = await activeConnection.callTool('Wait', {
        duration: action.waitDurationSeconds ?? 1
      });
    }

    return {
      success: true,
      actionSummary: `Desktop action ${action.actionType} executed successfully.`,
      details: result,
      durationMs: Date.now() - started
    };
  } catch (err: any) {
    return {
      success: false,
      actionSummary: `Desktop action ${action.actionType} failed`,
      errorMessage: err?.message || String(err),
      durationMs: Date.now() - started
    };
  }
}

/**
 * Wait for condition using Windows-MCP WaitFor tool
 */
export async function waitForDesktopCondition(
  condition: string,
  timeoutMs: number = 10000
): Promise<boolean> {
  if (!activeConnection || !activeConnection.isConnected) {
    return false;
  }
  try {
    await activeConnection.callTool('WaitFor', {
      condition: 'text_exists',
      text: condition,
      timeout: Math.min(timeoutMs / 1000, 30)
    });
    return true;
  } catch (_) {
    return false;
  }
}
