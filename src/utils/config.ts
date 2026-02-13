import { getConfigPath } from "./workspace.ts";

export interface JadeConfig {
  version: string;
  apps: string[];
  orgUrl?: string;
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
export async function addAppToConfig(workspaceRoot: string, appName: string): Promise<void> {
  const config = await readConfig(workspaceRoot);
  if (!config.apps.includes(appName)) {
    config.apps.push(appName);
    await writeConfig(workspaceRoot, config);
  }
}

/**
 * Remove an app from the config
 */
export async function removeAppFromConfig(
  workspaceRoot: string,
  appName: string
): Promise<void> {
  const config = await readConfig(workspaceRoot);
  config.apps = config.apps.filter((app) => app !== appName);
  await writeConfig(workspaceRoot, config);
}
