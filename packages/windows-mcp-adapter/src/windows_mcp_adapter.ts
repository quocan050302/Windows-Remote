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

  public getProcess(): ChildProcess | null {
    return this.childProcess;
  }
}

export interface WindowsMcpStatusInfo {
  isConnected: boolean;
  transport: 'stdio' | 'none';
  discoveredTools: string[];
  toolsCount: number;
  lastConnectedAt?: string;
  error?: string;
  humanTakeoverActive: boolean;
  controlStatus: {
    hasControl: boolean;
    policy: string;
    idleTimeoutSeconds: number;
  };
}

export class WindowsMcpRuntimeService {
  private processManager: WindowsMcpProcessManager | null = null;
  private connection: McpConnection | null = null;
  private humanTakeoverActive: boolean = false;
  private lastConnectedAt?: string;
  private lastError?: string;
  private controlPolicy: string = 'relaxed';
  private idleTimeout: number = 10.0;

  constructor(private config: WindowsMcpConfig = {}) {
    this.controlPolicy = config.controlPolicy || 'relaxed';
    this.idleTimeout = config.idleTimeoutSeconds ?? 10.0;
  }

  public async connectWindowsMcp(config?: WindowsMcpConfig): Promise<McpConnection> {
    if (config) {
      this.config = { ...this.config, ...config };
      this.controlPolicy = this.config.controlPolicy || this.controlPolicy;
      this.idleTimeout = this.config.idleTimeoutSeconds ?? this.idleTimeout;
    }

    try {
      this.processManager = new WindowsMcpProcessManager(this.config);
      this.connection = await this.processManager.connect();
      this.lastConnectedAt = new Date().toISOString();
      this.lastError = undefined;
      return this.connection;
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      this.connection = null;
      throw err;
    }
  }

  public async disconnectWindowsMcp(): Promise<void> {
    if (this.processManager) {
      await this.processManager.disconnect().catch(() => {});
      this.processManager = null;
    }
    this.connection = null;
  }

  public async getWindowsMcpStatus(): Promise<WindowsMcpStatusInfo> {
    const isConnected = Boolean(this.connection && this.connection.isConnected);
    let hasControl = false;

    if (isConnected) {
      try {
        const ctrl = await this.getControlStatus();
        hasControl = ctrl.hasControl;
      } catch (_) {}
    }

    return {
      isConnected,
      transport: isConnected ? 'stdio' : 'none',
      discoveredTools: this.connection?.discoveredTools || [],
      toolsCount: this.connection?.discoveredTools.length || 0,
      lastConnectedAt: this.lastConnectedAt,
      error: this.lastError,
      humanTakeoverActive: this.humanTakeoverActive,
      controlStatus: {
        hasControl,
        policy: this.controlPolicy,
        idleTimeoutSeconds: this.idleTimeout
      }
    };
  }

  public async captureDesktopSnapshot(
    options: DesktopSnapshotOptions = {}
  ): Promise<DesktopSnapshot> {
    const timestamp = new Date().toISOString();

    if (!this.connection || !this.connection.isConnected) {
      return {
        timestamp,
        activeWindow: undefined,
        windows: [],
        uiElements: [],
        displayMetadata: [],
        screenshotBase64: undefined
      };
    }

    try {
      const rawResult: any = await this.connection.callTool('Snapshot', {
        use_vision: Boolean(options.includeVision),
        use_ui_tree: Boolean(options.includeUiTree ?? true),
        use_annotation: Boolean(options.useAnnotation ?? false),
        display: options.displayIndices,
        region: options.region
      });

      let screenshotBase64: string | undefined;
      let activeWindow: { title: string; processId: number } | undefined;
      let uiElements: any[] = [];
      let displayMetadata: any[] = [];

      // Parse standard MCP structured tool response
      if (rawResult && Array.isArray(rawResult.content)) {
        for (const part of rawResult.content) {
          if (part.type === 'image' && part.data) {
            screenshotBase64 = part.data;
          } else if (part.type === 'text' && part.text) {
            try {
              const parsed = JSON.parse(part.text);
              if (parsed.activeWindow) activeWindow = parsed.activeWindow;
              if (Array.isArray(parsed.uiElements)) uiElements = parsed.uiElements;
              if (Array.isArray(parsed.displays)) displayMetadata = parsed.displays;
            } catch (_) {
              // Text representation summary
            }
          }
        }
      } else if (typeof rawResult === 'string') {
        screenshotBase64 = rawResult;
      }

      return {
        timestamp,
        activeWindow,
        windows: [],
        uiElements,
        displayMetadata,
        screenshotBase64
      };
    } catch (error: any) {
      throw new Error(`captureDesktopSnapshot failed: ${error?.message || error}`);
    }
  }

  public async getControlStatus(): Promise<{ hasControl: boolean; idleTimeoutSeconds: number; policy: string }> {
    if (!this.connection || !this.connection.isConnected) {
      return {
        hasControl: false,
        idleTimeoutSeconds: this.idleTimeout,
        policy: this.controlPolicy
      };
    }

    try {
      const raw: any = await this.connection.callTool('ControlStatus', {});
      let hasControl = false;
      if (raw && Array.isArray(raw.content)) {
        const textPart = raw.content.find((c: any) => c.type === 'text');
        if (textPart && textPart.text) {
          try {
            const data = JSON.parse(textPart.text);
            hasControl = Boolean(data.has_control ?? data.hasControl);
          } catch (_) {}
        }
      }
      return {
        hasControl,
        idleTimeoutSeconds: this.idleTimeout,
        policy: this.controlPolicy
      };
    } catch (_) {
      return {
        hasControl: !this.humanTakeoverActive,
        idleTimeoutSeconds: this.idleTimeout,
        policy: this.controlPolicy
      };
    }
  }

  public async handleHumanTakeover(active: boolean): Promise<{ humanTakeoverActive: boolean }> {
    this.humanTakeoverActive = active;
    if (active && this.connection && this.connection.isConnected) {
      // In relaxed or take_over policy, human user interaction automatically takes over
    }
    return { humanTakeoverActive: this.humanTakeoverActive };
  }
}

export const defaultMcpRuntimeService = new WindowsMcpRuntimeService();

let activeProcessManager: WindowsMcpProcessManager | null = null;
let activeConnection: McpConnection | null = null;

/**
 * Connect to Windows-MCP
 */
export async function connectWindowsMcp(config: WindowsMcpConfig = {}): Promise<McpConnection> {
  activeConnection = await defaultMcpRuntimeService.connectWindowsMcp(config);
  return activeConnection;
}

/**
 * Disconnect from Windows-MCP
 */
export async function disconnectWindowsMcp(): Promise<void> {
  await defaultMcpRuntimeService.disconnectWindowsMcp();
  activeConnection = null;
}

/**
 * Get Windows-MCP Status
 */
export async function getWindowsMcpStatus(): Promise<WindowsMcpStatusInfo> {
  return defaultMcpRuntimeService.getWindowsMcpStatus();
}

/**
 * Capture Desktop Snapshot
 */
export async function captureDesktopSnapshot(
  options: DesktopSnapshotOptions = {}
): Promise<DesktopSnapshot> {
  return defaultMcpRuntimeService.captureDesktopSnapshot(options);
}

/**
 * Get Control Status
 */
export async function getControlStatus(): Promise<{ hasControl: boolean; idleTimeoutSeconds: number; policy: string }> {
  return defaultMcpRuntimeService.getControlStatus();
}

/**
 * Handle Human Takeover
 */
export async function handleHumanTakeover(active: boolean): Promise<{ humanTakeoverActive: boolean }> {
  return defaultMcpRuntimeService.handleHumanTakeover(active);
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
