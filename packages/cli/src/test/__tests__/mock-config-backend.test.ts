import { describe, test, expect } from "bun:test";
import { createMockConfigBackend } from "../mock-config-backend.ts";

describe("createMockConfigBackend", () => {
  test("readConfig returns defaults for an unseeded workspace", async () => {
    const { config } = createMockConfigBackend();
    expect(await config.readConfig("/ws")).toEqual({ version: "1.0", apps: [] });
  });

  test("writeConfig then readConfig round-trips", async () => {
    const { config } = createMockConfigBackend();
    await config.writeConfig("/ws", { apps: ["frontend"] });
    expect(await config.readConfig("/ws")).toEqual({ version: "1.0", apps: ["frontend"] });
  });

  test("writeConfig merges with existing config rather than replacing it", async () => {
    const { config } = createMockConfigBackend();
    await config.writeConfig("/ws", { apps: ["a"], orgUrl: "https://github.com/org" });
    await config.writeConfig("/ws", { apps: ["a", "b"] });
    expect(await config.readConfig("/ws")).toEqual({
      version: "1.0",
      apps: ["a", "b"],
      orgUrl: "https://github.com/org",
    });
  });

  test("state is isolated per workspace root", async () => {
    const { config } = createMockConfigBackend();
    await config.writeConfig("/ws-a", { apps: ["a"] });
    await config.writeConfig("/ws-b", { apps: ["b"] });
    expect(await config.readConfig("/ws-a")).toEqual({ version: "1.0", apps: ["a"] });
    expect(await config.readConfig("/ws-b")).toEqual({ version: "1.0", apps: ["b"] });
  });

  test("getState reflects the current in-memory config", async () => {
    const { config, getState } = createMockConfigBackend();
    expect(getState("/ws")).toBeUndefined();
    await config.writeConfig("/ws", { apps: ["frontend"] });
    expect(getState("/ws")).toEqual({ version: "1.0", apps: ["frontend"] });
  });

  test("seedState pre-populates config for a workspace root", async () => {
    const { config, seedState } = createMockConfigBackend();
    seedState("/ws", { apps: ["preexisting"], orgUrl: "https://github.com/org" });
    expect(await config.readConfig("/ws")).toEqual({
      version: "1.0",
      apps: ["preexisting"],
      orgUrl: "https://github.com/org",
    });
  });

  test("calls records every method invocation", async () => {
    const { config, calls } = createMockConfigBackend();
    await config.readConfig("/ws");
    await config.writeConfig("/ws", { apps: ["a"] });
    expect(calls).toEqual([
      { method: "readConfig", args: ["/ws"] },
      { method: "writeConfig", args: ["/ws", { apps: ["a"] }] },
    ]);
  });
});
