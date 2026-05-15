# Hermes Kanban Pi Extension — Architecture

**Version:** 1.1.0  
**Status:** Revised  
**Date:** 2026-05-15  

---

## 1. Overview

The extension bridges **pi agent** with the **Hermes multi-agent Kanban board** for cross-platform task coordination. This document covers the internal architecture, data flow, and design decisions.

---

## 2. System Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              pi agent                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     hermes-kanban Extension                            │  │
│  │                                                                       │  │
│  │  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐    │  │
│  │  │  Session    │    │  KanbanService  │    │  ToolRegistry      │    │  │
│  │  │  Lifecycle  │───▶│  (Facade)      │───▶│  (pi.registerTool) │    │  │
│  │  └─────────────┘    └────────┬────────┘    └────────────────────┘    │  │
│  │                               │                                      │  │
│  │         ┌────────────────────┼────────────────────┐                 │  │
│  │         ▼                    ▼                    ▼                 │  │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │  │
│  │  │ ReadRepo     │   │ WriteRepo    │   │ BoardCache   │           │  │
│  │  │ (SQLite)     │   │ (CLI)        │   │ (Memory)     │           │  │
│  │  └──────┬───────┘   └──────┬───────┘   └──────────────┘           │  │
│  └─────────┼───────────────────┼─────────────────────────────────────────┘  │
└────────────┼───────────────────┼─────────────────────────────────────────────┘
             │                   │
             ▼                   ▼
    ┌────────────────┐  ┌────────────────┐
    │  SQLite DB     │  │ hermes CLI     │
    │  (reads)       │  │ (writes)       │
    └────────────────┘  └────────────────┘
```

### 2.2 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              READ PATH                                       │
│  Tool → KanbanService → ReadRepo → SQLite → Task[] → KanbanService → Tool  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              WRITE PATH                                      │
│  Tool → KanbanService → WriteRepo → Preflight Read → CLI → Verify → Tool   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **KanbanService facade** | Centralizes DB + CLI access; tools don't know backend |
| **ReadRepo / WriteRepo split** | Clear separation; reads use SQLite, writes use CLI |
| **Preflight validation** | Read-before-write for better UX (validate, then write) |
| **Board-aware connection** | Each board gets its own connection; cached by board name |
| **Session lifecycle hooks** | Connect on start, close on shutdown; survives /reload |

---

## 3. Module Structure

```
src/
├── index.ts                 # Extension entry point + lifecycle hooks
├── types/index.ts           # Shared TypeScript interfaces
│
├── service/
│   ├── KanbanService.ts     # Facade: orchestrates reads + writes
│   ├── ReadRepo.ts          # SQLite read operations
│   └── WriteRepo.ts         # CLI write operations
│
├── db/
│   ├── connection.ts        # Connection pool (per-board)
│   └── queries.ts           # Raw SQL query helpers
│
├── cli/
│   ├── runner.ts            # CLI subprocess runner (execFile, not exec)
│   ├── args.ts              # Safe argument builder
│   └── parser.ts            # CLI output parsing
│
├── tools/                   # One file per tool
│   ├── list.ts
│   ├── board.ts
│   ├── show.ts
│   ├── create.ts
│   ├── complete.ts
│   ├── block.ts
│   ├── comment.ts
│   ├── link.ts
│   ├── diagnostics.ts
│   └── stats.ts
│
├── commands/                # /slash commands
│   ├── board.ts
│   └── stats.ts
│
└── utils/
    ├── errors.ts            # Structured error types
    ├── truncate.ts          # Output truncation (50KB/2000 lines)
    └── board-resolve.ts     # Board path resolution
```

---

## 4. Component Details

### 4.1 KanbanService (Facade)

```typescript
// service/KanbanService.ts

export class KanbanService {
  private readRepo: ReadRepo;
  private writeRepo: WriteRepo;
  private board: string;

  constructor(board: string = "default") {
    this.board = board;
    this.readRepo = new ReadRepo(board);
    this.writeRepo = new WriteRepo(board);
  }

  // --- Read operations (via SQLite) ---
  listTasks(options: ListOptions): TaskSummary[] { ... }
  getBoard(): BoardResult { ... }
  getTask(id: string): TaskDetail | null { ... }
  getStats(): BoardStats { ... }
  getDiagnostics(options?: DiagnosticsOptions): DiagnosticsResult { ... }

  // --- Write operations (via CLI with preflight) ---
  async createTask(params: CreateParams): Promise<Result> { ... }
  async completeTask(params: CompleteParams): Promise<Result> { ... }
  async blockTask(params: BlockParams): Promise<Result> { ... }
  async addComment(params: CommentParams): Promise<Result> { ... }
  async linkTasks(params: LinkParams): Promise<Result> { ... }
}
```

**Why a facade:** Tools call `kanban.listTasks()` without knowing it hits SQLite. If we add HTTP fallback later, only the facade changes.

### 4.2 ReadRepo (SQLite Read Operations)

```typescript
// service/ReadRepo.ts

export class ReadRepo {
  private conn: Database;

  constructor(board: string) {
    this.conn = getConnection(board);  // Per-board connection
  }

  listTasks(options: ListOptions): TaskSummary[] { ... }
  getTask(id: string): Task | null { ... }
  getTaskLinks(id: string): TaskLinks { ... }
  getComments(id: string): TaskComment[] { ... }
  getEvents(id: string, limit: number): TaskEvent[] { ... }
  getRuns(id: string): TaskRun[] { ... }
  getStats(): BoardStats { ... }
  getDiagnostics(): DiagnosticsResult { ... }

  // Preflight validations (called by WriteRepo before CLI)
  taskExists(id: string): boolean { ... }
  assigneeExists(profile: string): boolean { ... }
  wouldCreateCycle(parentId: string, childId: string): boolean { ... }
}
```

### 4.3 WriteRepo (CLI Write Operations)

```typescript
// service/WriteRepo.ts

export class WriteRepo {
  private readRepo: ReadRepo;
  private cli: CliRunner;

  constructor(readRepo: ReadRepo) {
    this.readRepo = readRepo;
    this.cli = new CliRunner();
  }

  async createTask(params: CreateParams): Promise<Result> {
    // 1. Validate assignee exists
    if (!this.readRepo.assigneeExists(params.assignee)) {
      return { ok: false, error: `Assignee '${params.assignee}' not found` };
    }

    // 2. Check idempotency key
    if (params.idempotencyKey) {
      const existing = this.readRepo.getByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        return { ok: true, taskId: existing.id, reused: true };
      }
    }

    // 3. Run CLI
    const result = await this.cli.run(["kanban", "create", ...]);

    // 4. Verify result
    if (result.ok) {
      const taskId = parseTaskIdFromOutput(result.output);
      if (!this.readRepo.taskExists(taskId)) {
        return { ok: false, error: "Task created but not found in DB" };
      }
    }

    return result;
  }

  async linkTasks(params: LinkParams): Promise<Result> {
    // 1. Preflight: check for cycles
    if (this.readRepo.wouldCreateCycle(params.parentId, params.childId)) {
      return { ok: false, error: "Link would create a dependency cycle" };
    }

    // 2. Run CLI
    return this.cli.run(["kanban", "link", "--parent", params.parentId, "--child", params.childId]);
  }
}
```

### 4.4 CliRunner (Hardened)

```typescript
// cli/runner.ts

export class CliRunner {
  private hermesPath: string | null = null;

  constructor() {
    this.hermesPath = this.resolveHermes();
  }

  private resolveHermes(): string | null {
    // Actually validate the path exists
    const paths = [
      "hermes",  // PATH lookup
      "/usr/local/bin/hermes",
      "/usr/bin/hermes",
      path.join(os.homedir(), ".local", "bin", "hermes"),
    ];

    for (const p of paths) {
      try {
        const { stdout } = await execAsync("which", [p]);
        if (stdout.trim()) return stdout.trim();
      } catch {
        continue;
      }
    }
    return null;
  }

  async run(args: string[], options?: RunOptions): Promise<CliResult> {
    if (!this.hermesPath) {
      return { ok: false, error: "hermes CLI not found in PATH" };
    }

    // Use execFile, NOT exec — avoids shell injection
    try {
      const { stdout, stderr } = await execFileAsync(
        this.hermesPath,
        args,
        { timeout: options?.timeout ?? 30000 }
      );

      return { ok: true, output: stdout, stderr };
    } catch (err) {
      return parseCliError(err);
    }
  }
}
```

### 4.5 Session Lifecycle

```typescript
// index.ts

let service: KanbanService | null = null;

export default async function hermesKanbanExtension(pi: ExtensionAPI): Promise<void> {
  // Initialize service on session start
  pi.on("session_start", async () => {
    const board = resolveBoard();  // From env or default
    service = new KanbanService(board);
    console.log(`[hermes-kanban] Connected to board: ${board}`);
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    service = null;
    closeAllConnections();  // Close per-board connections
    console.log("[hermes-kanban] Disconnected");
  });

  // Handle /reload — shutdown + restart
  pi.on("session_before_switch", async () => {
    service = null;
    closeAllConnections();
  });

  // Register tools...
  registerKanbanListTool(pi, () => service);
  // etc.
}
```

### 4.6 Error Architecture

```typescript
// utils/errors.ts

export class KanbanError extends Error {
  constructor(
    message: string,
    public code: KanbanErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "KanbanError";
  }
}

export enum KanbanErrorCode {
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  ASSIGNEE_NOT_FOUND = "ASSIGNEE_NOT_FOUND",
  CLI_NOT_FOUND = "CLI_NOT_FOUND",
  CLI_ERROR = "CLI_ERROR",
  DB_ERROR = "DB_ERROR",
  CYCLE_DETECTED = "CYCLE_DETECTED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  HALLUCINATED_CARDS = "HALLUCINATED_CARDS",
}

// Structured error response format (Hermes-compatible)
export function toErrorResult(error: KanbanError): ToolResult {
  return {
    ok: false,
    error: error.message,
    code: error.code,
    ...error.context,
  };
}
```

### 4.7 Output Truncation

```typescript
// utils/truncate.ts

const MAX_BYTES = 50 * 1024;      // 50 KB
const MAX_LINES = 2000;

export function truncateOutput(text: string): string {
  // Truncate by bytes
  if (text.length > MAX_BYTES) {
    text = text.slice(0, MAX_BYTES) + "\n... (truncated)";
  }

  // Truncate by lines
  const lines = text.split("\n");
  if (lines.length > MAX_LINES) {
    lines.splice(MAX_LINES);
    lines.push(`... (${MAX_LINES} line limit reached)`);
  }

  return lines.join("\n");
}
```

---

## 5. Connection Management

### 5.1 Per-Board Connection Pool

```typescript
// db/connection.ts

const connections = new Map<string, Database>();

export function getConnection(board: string = "default"): Database {
  if (connections.has(board)) {
    return connections.get(board)!;
  }

  const dbPath = resolveKanbanDbPath(board);
  const db = new Database(dbPath, { readonly: true });
  // No WAL pragma on readonly — unnecessary and may fail

  connections.set(board, db);
  return db;
}

export function closeConnection(board: string): void {
  const db = connections.get(board);
  if (db) {
    db.close();
    connections.delete(board);
  }
}

export function closeAllConnections(): void {
  for (const [board, db] of connections) {
    db.close();
  }
  connections.clear();
}
```

### 5.2 Board Resolution

```typescript
// utils/board-resolve.ts

export function resolveBoard(): string {
  // Priority: CLI param > env var > current file > default
  return (
    process.env.HERMES_KANBAN_BOARD ||
    readCurrentBoardFile() ||
    "default"
  );
}
```

---

## 6. Tool Registration Pattern

```typescript
// Each tool receives a service getter, not the service directly
export function registerKanbanListTool(
  pi: ExtensionAPI,
  getService: () => KanbanService | null
): void {
  pi.registerTool({
    name: "kanban_list",
    // ... metadata ...
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const service = getService();
      if (!service) {
        return toErrorResult(new KanbanError(
          "Kanban service not initialized. Start a session first.",
          KanbanErrorCode.DB_ERROR
        ));
      }

      try {
        const result = service.listTasks(params);
        return formatListResult(result);
      } catch (err) {
        return handleError(err);
      }
    },
  });
}
```

---

## 7. Read/Write Preflight Strategy

| Operation | Preflight Check | Why |
|-----------|-----------------|-----|
| `create` | Assignee exists | Fail fast with clear message |
| `create` | Idempotency key | Return existing if found |
| `complete` | Task exists + not terminal | Avoid CLI error cascade |
| `block` | Task exists + not blocked | Idempotent unblock |
| `link` | Both tasks exist + no cycle | Prevent invalid state |
| `comment` | Task exists | Contextual error |

---

## 8. Configuration

### 8.1 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HERMES_HOME` | Hermes root | `~/.hermes` |
| `HERMES_KANBAN_BOARD` | Board to use | `"default"` |
| `HERMES_KANBAN_TASK` | Current task (for workers) | - |

### 8.2 Board Paths

```
HERMES_HOME/
├── kanban.db              # Default board
└── kanban/
    └── boards/
        └── <slug>/
            └── kanban.db  # Named boards
```

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Shell injection | Use `execFile` not `exec` with arg arrays |
| SQL injection | All queries use parameterized statements |
| Path traversal | Board slugs validated (lowercase, alphanumerics, hyphens) |
| Phantom tasks | Preflight validation checks existence before write |

---

## 10. Performance

| Metric | Target | Implementation |
|--------|--------|----------------|
| Read query | < 50ms | SQLite with indexes |
| CLI startup | < 100ms | Reuse connection, not spawn |
| Extension load | < 500ms | Lazy service init |
| Output size | < 50KB | Truncation enforced |

---

## 11. Extension vs. Standalone Tool

This is a **pi extension**, not a standalone CLI tool. Key implications:

| Aspect | Extension Behavior |
|--------|-------------------|
| Load | Auto-discovered from `~/.pi/agent/extensions/` |
| Lifecycle | Managed by pi (start/shutdown/reload) |
| Config | Via pi settings, not Hermes config |
| Error display | Via `ctx.ui.notify()` + tool result |

---

## 12. Future Considerations

| Feature | Complexity | Notes |
|---------|------------|-------|
| HTTP fallback | Medium | Dashboard API when SQLite fails |
| WebSocket events | High | Subscribe to live updates |
| Multi-board transactions | High | Complex across SQLite DBs |
| Caching layer | Low | BoardCache for hot data |
