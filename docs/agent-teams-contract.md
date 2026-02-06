# Agent Teams Contract (Draft v1)

## Goal
Define a first-class Team Lead + Teammates orchestration model on top of existing CoWork task/agent primitives.

## Scope
- Team definition and membership
- Team run lifecycle
- Shared team task list/checklist
- Execution/events contract between renderer and daemon

## Non-Goals
- Replacing existing `spawn_agent` tools
- Replacing Mission Control board
- Changing workspace-level security policy precedence

## Data Model (Proposed)

### `agent_teams`
```sql
CREATE TABLE agent_teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT,
  lead_agent_role_id TEXT NOT NULL REFERENCES agent_roles(id),
  max_parallel_agents INTEGER NOT NULL DEFAULT 4,
  default_model_preference TEXT,
  default_personality TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_agent_teams_workspace ON agent_teams(workspace_id);
```

### `agent_team_members`
```sql
CREATE TABLE agent_team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES agent_teams(id) ON DELETE CASCADE,
  agent_role_id TEXT NOT NULL REFERENCES agent_roles(id),
  member_order INTEGER NOT NULL DEFAULT 0,
  is_required INTEGER NOT NULL DEFAULT 0,
  role_guidance TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(team_id, agent_role_id)
);
CREATE INDEX idx_team_members_team ON agent_team_members(team_id);
```

### `agent_team_runs`
```sql
CREATE TABLE agent_team_runs (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES agent_teams(id),
  root_task_id TEXT NOT NULL REFERENCES tasks(id),
  status TEXT NOT NULL, -- pending|running|paused|completed|failed|cancelled
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT,
  summary TEXT
);
CREATE INDEX idx_team_runs_team ON agent_team_runs(team_id);
CREATE INDEX idx_team_runs_root_task ON agent_team_runs(root_task_id);
```

### `agent_team_items` (shared checklist)
```sql
CREATE TABLE agent_team_items (
  id TEXT PRIMARY KEY,
  team_run_id TEXT NOT NULL REFERENCES agent_team_runs(id) ON DELETE CASCADE,
  parent_item_id TEXT REFERENCES agent_team_items(id),
  title TEXT NOT NULL,
  description TEXT,
  owner_agent_role_id TEXT REFERENCES agent_roles(id),
  source_task_id TEXT REFERENCES tasks(id),
  status TEXT NOT NULL, -- todo|in_progress|blocked|done|failed
  result_summary TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_team_items_run ON agent_team_items(team_run_id);
CREATE INDEX idx_team_items_source_task ON agent_team_items(source_task_id);
```

## IPC / API Contract (Proposed)

Follow existing naming style in `IPC_CHANNELS`.

### Team CRUD
- `TEAM_LIST` -> `team:list`
- `TEAM_GET` -> `team:get`
- `TEAM_CREATE` -> `team:create`
- `TEAM_UPDATE` -> `team:update`
- `TEAM_DELETE` -> `team:delete`

### Membership
- `TEAM_MEMBER_ADD` -> `teamMember:add`
- `TEAM_MEMBER_LIST` -> `teamMember:list`
- `TEAM_MEMBER_UPDATE` -> `teamMember:update`
- `TEAM_MEMBER_REMOVE` -> `teamMember:remove`
- `TEAM_MEMBER_REORDER` -> `teamMember:reorder`

### Run Lifecycle
- `TEAM_RUN_CREATE` -> `teamRun:create`
- `TEAM_RUN_GET` -> `teamRun:get`
- `TEAM_RUN_LIST` -> `teamRun:list`
- `TEAM_RUN_CANCEL` -> `teamRun:cancel`
- `TEAM_RUN_PAUSE` -> `teamRun:pause`
- `TEAM_RUN_RESUME` -> `teamRun:resume`

### Shared Checklist
- `TEAM_ITEM_LIST` -> `teamItem:list`
- `TEAM_ITEM_CREATE` -> `teamItem:create`
- `TEAM_ITEM_UPDATE` -> `teamItem:update`
- `TEAM_ITEM_DELETE` -> `teamItem:delete`
- `TEAM_ITEM_MOVE` -> `teamItem:move`

### Streaming
- `TEAM_RUN_EVENT` -> `teamRun:event`

## TypeScript Shapes (Proposed)

```ts
type TeamRunStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
type TeamItemStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'failed';

interface AgentTeam {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  leadAgentRoleId: string;
  maxParallelAgents: number;
  defaultModelPreference?: 'same' | 'cheaper' | 'smarter';
  defaultPersonality?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AgentTeamMember {
  id: string;
  teamId: string;
  agentRoleId: string;
  memberOrder: number;
  isRequired: boolean;
  roleGuidance?: string;
  createdAt: number;
}

interface AgentTeamRun {
  id: string;
  teamId: string;
  rootTaskId: string;
  status: TeamRunStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  summary?: string;
}

interface AgentTeamItem {
  id: string;
  teamRunId: string;
  parentItemId?: string;
  title: string;
  description?: string;
  ownerAgentRoleId?: string;
  sourceTaskId?: string;
  status: TeamItemStatus;
  resultSummary?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}
```

## Execution Rules
- Team lead creates/owns the run.
- Team items can be assigned to members; execution uses existing child-task spawn path.
- Child task completion writes `resultSummary` back to both:
  - `tasks.result_summary`
  - `agent_team_items.result_summary` (if linked by `source_task_id`)
- Workspace/context policy manager remains source of truth for approvals and denies.

## Rollout Plan
1. Correctness baseline (already started): persist child summaries + enforce `retainMemory`.
2. Add Team tables + repositories + migrations.
3. Add Team IPC handlers and preload APIs.
4. Add Team run orchestrator in daemon (mapping team items <-> tasks).
5. Add renderer Team Builder + Team Run monitor.
