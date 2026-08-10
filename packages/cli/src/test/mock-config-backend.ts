import type { ConfigBackend } from "../utils/config-backend.ts";
import type { JadeConfig } from "../utils/config.ts";

const DEFAULT_CONFIG: JadeConfig = {
  version: "1.0",
  apps: [],
};

/**
 * Mock ConfigBackend that simulates jade.json reads/writes with in-memory state,
 * keyed by workspace root, instead of touching real disk.
 *
 * Usage in tests:
 *
 *   const { config } = createMockConfigBackend();
 *   const cmd = makeAddCommand(git, fs, config);
 *   await cmd.run!({ args: { ... } } as any);
 *   expect(getState("/path/to/workspace")).toBeDefined();
 */
export interface MockConfigBackend {
  config: ConfigBackend;
  /** Get in-memory config for a workspace root (returns undefined if never read/written) */
  getState(workspaceRoot: string): JadeConfig | undefined;
  /** Pre-seed config for a workspace root (useful for tests that expect an existing jade.json) */
  seedState(workspaceRoot: string, config: Partial<JadeConfig>): void;
  /** Calls recorded on the backend (for assertion purposes) */
  calls: { method: string; args: unknown[] }[];
}

export function createMockConfigBackend(): MockConfigBackend {
  const states = new Map<string, JadeConfig>();
  const calls: { method: string; args: unknown[] }[] = [];

  function record(method: string, ...args: unknown[]) {
    calls.push({ method, args });
  }

  const config: ConfigBackend = {
    /**
     * Return the in-memory config for this workspace root, or the same
     * defaults readConfig() falls back to when no jade.json exists yet.
     */
    async readConfig(workspaceRoot: string): Promise<JadeConfig> {
      record("readConfig", workspaceRoot);
      const existing = states.get(workspaceRoot);
      return existing ? { ...existing } : { ...DEFAULT_CONFIG };
    },

    /**
     * Merge the patch into the existing (or default) config and store it,
     * matching utils/config.ts's writeConfig merge semantics exactly.
     */
    async writeConfig(workspaceRoot: string, patch: Partial<JadeConfig>): Promise<void> {
      record("writeConfig", workspaceRoot, patch);
      const existing = states.get(workspaceRoot) ?? { ...DEFAULT_CONFIG };
      states.set(workspaceRoot, { ...existing, ...patch });
    },
  };

  return {
    config,
    getState: (workspaceRoot) => states.get(workspaceRoot),
    seedState(workspaceRoot, overrides = {}) {
      states.set(workspaceRoot, { ...DEFAULT_CONFIG, ...overrides });
    },
    calls,
  };
}
