/**
 * Injectable config backend interface.
 * Commands accept a ConfigBackend and default to the real implementation.
 * Tests can pass a mock backend to simulate jade.json reads/writes without touching disk.
 */
import { readConfig, writeConfig, type JadeConfig } from "./config.ts";

export interface ConfigBackend {
  readConfig(workspaceRoot: string): Promise<JadeConfig>;
  writeConfig(workspaceRoot: string, config: Partial<JadeConfig>): Promise<void>;
}

/**
 * Real config backend — delegates to the actual jade.json read/write utilities.
 * This is the default used by all commands in production.
 */
export const realConfigBackend: ConfigBackend = {
  readConfig,
  writeConfig,
};
