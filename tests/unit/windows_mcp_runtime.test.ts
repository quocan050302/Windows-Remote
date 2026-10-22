import test from 'node:test';
import * as assert from 'node:assert';
import { 
  WindowsMcpRuntimeService, 
  SAFE_ALLOWED_MCP_TOOLS,
  resolveDesktopTarget 
} from '../../packages/windows-mcp-adapter/src/windows_mcp_adapter.js';

test('Windows-MCP Runtime - Reports accurate disconnected status without fake metadata', async () => {
  const service = new WindowsMcpRuntimeService();
  const status = await service.getWindowsMcpStatus();

  assert.strictEqual(status.isConnected, false);
  assert.strictEqual(status.transport, 'none');
  assert.strictEqual(status.toolsCount, 0);
  assert.deepStrictEqual(status.discoveredTools, []);
  assert.strictEqual(status.humanTakeoverActive, false);
});

test('Windows-MCP Runtime - captureDesktopSnapshot returns no fake screenshot when offline', async () => {
  const service = new WindowsMcpRuntimeService();
  const snapshot = await service.captureDesktopSnapshot();

  assert.strictEqual(snapshot.screenshotBase64, undefined);
  assert.deepStrictEqual(snapshot.uiElements, []);
  assert.deepStrictEqual(snapshot.windows, []);
  assert.ok(snapshot.timestamp);
});

test('Windows-MCP Runtime - Human takeover state transitions accurately', async () => {
  const service = new WindowsMcpRuntimeService();
  
  const res1 = await service.handleHumanTakeover(true);
  assert.strictEqual(res1.humanTakeoverActive, true);
  
  const status1 = await service.getWindowsMcpStatus();
  assert.strictEqual(status1.humanTakeoverActive, true);

  const res2 = await service.handleHumanTakeover(false);
  assert.strictEqual(res2.humanTakeoverActive, false);
});

test('Windows-MCP Security - High-risk system tools are excluded from whitelist', () => {
  const forbidden = ['Shell', 'PowerShell', 'Registry', 'FileSystem', 'Process', 'ExecuteCommand'];
  
  for (const tool of forbidden) {
    assert.strictEqual(
      SAFE_ALLOWED_MCP_TOOLS.includes(tool),
      false,
      `High-risk tool '${tool}' must be excluded from SAFE_ALLOWED_MCP_TOOLS`
    );
  }

  assert.ok(SAFE_ALLOWED_MCP_TOOLS.includes('Screenshot'));
  assert.ok(SAFE_ALLOWED_MCP_TOOLS.includes('Snapshot'));
  assert.ok(SAFE_ALLOWED_MCP_TOOLS.includes('Click'));
  assert.ok(SAFE_ALLOWED_MCP_TOOLS.includes('Type'));
});

test('Windows-MCP Target Resolution - Resolves target element coordinates correctly', () => {
  const mockSnapshot = {
    timestamp: new Date().toISOString(),
    uiElements: [
      {
        id: 'btn_1',
        label: 101,
        name: 'Submit Order',
        controlType: 'Button',
        isEnabled: true,
        isFocused: false,
        boundingBox: [100, 200, 300, 250] as [number, number, number, number] // left, top, right, bottom -> center: (200, 225)
      }
    ],
    windows: [],
    displayMetadata: []
  };

  const resByLabel = resolveDesktopTarget(mockSnapshot, { labelId: 101 });
  assert.strictEqual(resByLabel.resolved, true);
  assert.deepStrictEqual(resByLabel.coordinates, [200, 225]);

  const resByName = resolveDesktopTarget(mockSnapshot, { elementName: 'submit order' });
  assert.strictEqual(resByName.resolved, true);
  assert.deepStrictEqual(resByName.coordinates, [200, 225]);

  const resMissing = resolveDesktopTarget(mockSnapshot, { elementName: 'NonExistent' });
  assert.strictEqual(resMissing.resolved, false);
});
