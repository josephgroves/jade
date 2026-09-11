import { getConfigPath } from "./workspace.ts";
import type { ConfigBackend } from "./config-backend.ts";

export interface AppEntry {
  name: string;
  defaultBranch?: string;
}

export type AppItem = string | AppEntry;

export interface JadeConfig {
  version: string;
  apps: AppItem[];
  orgUrl?: string;
}

export function getAppName(entry: AppItem): string {
  return typeof entry === "string" ? entry : entry.name;
}

export function getAppNames(config: JadeConfig): string[] {
  return config.apps.map(getAppName);
}

export function getAppDefaultBranch(config: JadeConfig, appName: string): string | undefined {
  const entry = config.apps.find(
    (a) => (typeof a === "string" ? a : a.name) === appName
  );
  return entry && typeof entry === "object" ? entry.defaultBranch : undefined;
}

const DEFAULT_CONFIG: JadeConfig = {
  version: "1.0",
  apps: [],
};

/**
 * Read jade.json config from workspace root
 */
export async function readConfig(workspaceRoot: string): Promise<JadeConfig> {
  const configPath = getConfigPath(workspaceRoot);

  if (!await Bun.file(configPath).exists()) {
    return { ...DEFAULT_CONFIG };
  }

  const file = Bun.file(configPath);
  const content = await file.json();
  return { ...DEFAULT_CONFIG, ...content };
}

/**
 * Write jade.json config to workspace root
 */
export async function writeConfig(
  workspaceRoot: string,
  config: Partial<JadeConfig>
): Promise<void> {
  const configPath = getConfigPath(workspaceRoot);
  const existingConfig = await readConfig(workspaceRoot);
  const newConfig = { ...existingConfig, ...config };

  await Bun.write(configPath, JSON.stringify(newConfig, null, 2) + "\n");
}

/**
 * Add an app to the config
 */
export async function addAppToConfig(
  config: ConfigBackend,
  workspaceRoot: string,
  appName: string,
  defaultBranch?: string
): Promise<void> {
  const jadeConfig = await config.readConfig(workspaceRoot);
  const names = getAppNames(jadeConfig);
  if (!names.includes(appName)) {
    const entry: AppItem = defaultBranch ? { name: appName, defaultBranch } : appName;
    jadeConfig.apps.push(entry);
    await config.writeConfig(workspaceRoot, jadeConfig);
  }
}

/**
 * Remove an app from the config
 */
export async function removeAppFromConfig(
  config: ConfigBackend,
  workspaceRoot: string,
  appName: string
): Promise<void> {
  const jadeConfig = await config.readConfig(workspaceRoot);
  jadeConfig.apps = jadeConfig.apps.filter((app) => getAppName(app) !== appName);
  await config.writeConfig(workspaceRoot, jadeConfig);
}
