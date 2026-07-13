import { describe, expect, test } from "bun:test";
import { parseOpenWorkspaces } from "../herdr.ts";

describe("parseOpenWorkspaces", () => {
  test("keys workspaces by label with id and focus", () => {
    // Shape captured from a live `herdr workspace list` (herdr 0.7).
    const stdout = JSON.stringify({
      id: "cli:workspace:list",
      result: {
        type: "workspace_list",
        workspaces: [
          { label: "jade", workspace_id: "wA", focused: true, number: 1 },
          { label: "coreui-module", workspace_id: "wK", focused: false, number: 2 },
        ],
      },
    });

    const map = parseOpenWorkspaces(stdout);

    expect(map.size).toBe(2);
    expect(map.get("jade")).toEqual({ label: "jade", workspaceId: "wA", focused: true });
    expect(map.get("coreui-module")).toEqual({
      label: "coreui-module",
      workspaceId: "wK",
      focused: false,
    });
  });

  test("defaults focused to false when absent", () => {
    const stdout = JSON.stringify({ result: { workspaces: [{ label: "feat-x", workspace_id: "wZ" }] } });
    expect(parseOpenWorkspaces(stdout).get("feat-x")?.focused).toBe(false);
  });

  test("skips entries missing a label or id", () => {
    const stdout = JSON.stringify({
      result: {
        workspaces: [
          { label: "ok", workspace_id: "w1" },
          { workspace_id: "w2" }, // no label
          { label: "no-id" }, // no id
        ],
      },
    });

    const map = parseOpenWorkspaces(stdout);
    expect([...map.keys()]).toEqual(["ok"]);
  });

  test("returns an empty map for malformed or unexpected output", () => {
    expect(parseOpenWorkspaces("not json").size).toBe(0);
    expect(parseOpenWorkspaces("{}").size).toBe(0);
    expect(parseOpenWorkspaces(JSON.stringify({ result: {} })).size).toBe(0);
  });
});
