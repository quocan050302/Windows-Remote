# Windows-MCP Integration & Process Management Specification
**Integration Target:** CursorTouch/Windows-MCP (v0.8.8 reference)  
**Adapter Module:** `packages/windows-mcp-adapter`

---

## 1. Process Management

The `WindowsMcpProcessManager` supervises the Python Windows-MCP server as a dedicated subprocess:

- **Launch Command**:
  ```bash
  uv run --python 3.14 --project <windows-mcp-dir> windows-mcp serve \
    --transport stdio \
    --tools Screenshot,Snapshot,DisplayInventory,ControlStatus,Click,Type,Scroll,Move,Shortcut,Wait,WaitFor \
    --control-policy relaxed \
    --control-idle-timeout 10.0
  ```
- **Environment Flags**:
  - `ANONYMIZED_TELEMETRY=false`: Disables all outbound telemetry to third-party endpoints.
  - `PYTHONIOENCODING=utf-8`: Ensures consistent Unicode processing without cp1252 truncation.
- **Connection Transport**:
  - Uses `@modelcontextprotocol/sdk` Client over standard input/output (`StdioClientTransport`).

---

## 2. Tool Whitelist vs Blacklist

To protect the host operating system from unintended modification, the adapter strictly enforces the tool allowlist:

```typescript
export const SAFE_WINDOWS_MCP_TOOLS = [
  'Snapshot',
  'Screenshot',
  'DisplayInventory',
  'ControlStatus',
  'Click',
  'Type',
  'Scroll',
  'Move',
  'Shortcut',
  'Wait',
  'WaitFor'
] as const;

export const BLOCKED_WINDOWS_MCP_TOOLS = [
  'Shell',
  'PowerShell',
  'Registry',
  'FileSystem',
  'Process'
] as const;
```

---

## 3. Core Functions Contract

1. `connectWindowsMcp(config: WindowsMcpConfig): Promise<McpConnection>`:
   - Spawns the subprocess, creates the client transport, performs handshake, verifies tool discovery, and returns the active connection.
2. `captureDesktopSnapshot(options: SnapshotOptions): Promise<DesktopSnapshot>`:
   - Captures active window metadata, interactive bounding boxes, and optional downscaled screenshot.
3. `resolveDesktopTarget(snapshot: DesktopSnapshot, descriptor: TargetDescriptor): TargetResolution`:
   - Matches element labels, accessibility names, or coordinates.
4. `executeDesktopAction(action: DesktopAction, context: ActionContext): Promise<ActionResult>`:
   - Evaluates Permission Guard, verifies takeover state, executes the tool, and registers audit logs.
5. `waitForDesktopCondition(condition: WaitCondition, timeoutMs: number): Promise<boolean>`:
   - Delegates condition evaluation to the server's `WaitFor` tool with a guaranteed upper-bound timeout.
