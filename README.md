# Test IO Agent Studio

> **Production-Oriented Autonomous & Supervised AI Testing System**  
> Powered by Windows-MCP, Playwright Browser Automation, and Multi-Provider AI Reasoning.

[![Tests](https://img.shields.io/badge/tests-10%2F10%20passing-brightgreen)](tests/)
[![TypeScript](https://img.shields.io/badge/typescript-strict%20mode-blue)](tsconfig.json)
[![Platform](https://img.shields.io/badge/platform-Windows%2011%20%7C%20Cross--Platform-informational)](docs/ARCHITECTURE.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📖 Overview

**Test IO Agent Studio** is an autonomous desktop QA environment designed for professional software testing workflows. It empowers QA engineers to import task briefs, analyze test scopes, generate structured test plans, execute deterministic browser interactions via Playwright, observe UI states, identify candidate bugs, capture SHA-256 integrity-verified evidence, and draft Test IO-compliant bug reports.

---

## 🏗️ System Architecture

```text
test-io-agent-studio/
├── apps/
│   ├── desktop/                 # Electron + React + Tailwind + Vite desktop app
│   └── demo-testing-lab/        # Standalone local test website with 10 intentional bugs
├── packages/
│   ├── shared/                  # Common TypeScript types, DTOs, schemas
│   ├── storage/                 # SQLite schema, migrations, repositories (node:sqlite)
│   ├── policy-engine/           # PermissionGuard, domain policies, audit logger
│   ├── ai-providers/            # Multi-provider LLM abstraction (Gemini, Claude, Local)
│   ├── windows-mcp-adapter/     # Windows-MCP child process manager & client
│   ├── browser-adapter/         # Playwright session manager & web actions
│   ├── test-intelligence/       # QA engines: Exploratory, Test Case, Regression, etc.
│   ├── evidence/                # Evidence capture, SHA-256 verification & redaction
│   ├── report-engine/           # Bug report generator & validator
│   └── agent-core/              # Orchestrator, Task State Machine, Execution loop
├── tests/                       # Unit, integration, and E2E acceptance tests
└── docs/                        # Specifications, compliance, and research documents
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v22.14.0+` (or v20 LTS)
- **Package Manager**: `pnpm` (v12+) or `npm` (v10+)
- **Python Runtime (for Windows-MCP)**: Python `3.14+` and `uv`

### Installation
```bash
# Clone the repository
git clone https://github.com/quocan050302/Windows-Remote.git
cd Windows-Remote

# Install dependencies across all monorepo packages
pnpm install
# or: npm install

# Install Playwright browser binaries
npx playwright install chromium
```

---

## 🏃 Running the Application

### 1. Start Demo Testing Lab (Local Staging Target)
```bash
pnpm dev:demo
# or: npm run dev:demo
# Runs on http://127.0.0.1:4173 with 10 intentional toggleable bugs
```

### 2. Start Desktop Studio UI
```bash
pnpm dev:desktop
# or: npm run dev:desktop
# Starts Vite dev server and launches Electron desktop studio
```

### 3. Run Automated Tests
```bash
# Run all unit and integration tests
pnpm test
# or: npm test

# Run the full autonomous E2E acceptance test
pnpm test:e2e
# or: npm run test:e2e

# Run TypeScript strict typecheck
pnpm typecheck
```

### 4. Build Windows Desktop Executable
```bash
pnpm --filter @test-io-agent/desktop run package:win
# Generates release\win-unpacked\Test IO Agent Studio.exe
```

---

## 🛡️ Security, Privacy & Test IO Compliance

1. **Default DENY Policy**: No browser action or desktop input is executed without satisfying an active `AuthorizationRecord`.
2. **Prohibited Tools**: The Windows-MCP tools `Shell`, `PowerShell`, `Registry`, `FileSystem`, and `Process` are strictly blocked.
3. **Platform Boundary**: `tester.test.io` is blocked from autonomous browsing by default. All bug reports are formatted as `DRAFT` for human review and manual submission in compliance with Test IO terms.
4. **Evidence Integrity**: All captured screenshots and logs compute SHA-256 hashes at capture time.

---

## 📚 Documentation Links
- [Architecture Specification](docs/ARCHITECTURE.md)
- [Competitor Analysis: Windows-MCP](docs/research/WINDOWS_MCP_COMPETITOR_ANALYSIS.md)
- [Security Policy & Controls](docs/SECURITY.md)
- [Test IO Compliance Guidelines](docs/TEST_IO_COMPLIANCE.md)
- [Windows-MCP Integration Guide](docs/WINDOWS_MCP_INTEGRATION.md)
- [Testing Guide](docs/TESTING_GUIDE.md)
- [Acceptance Report](docs/ACCEPTANCE_REPORT.md)
- [Known Limitations & Roadmap](docs/KNOWN_LIMITATIONS.md)

---

## 📄 License
This project is licensed under the MIT License.
Windows-MCP reference components are used in accordance with the MIT License (Copyright (c) CursorTouch).
