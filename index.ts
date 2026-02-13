#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import init from "./src/commands/init.ts";
import add from "./src/commands/add.ts";
import worktree from "./src/commands/worktree.ts";
import checkout from "./src/commands/checkout.ts";
import status from "./src/commands/status.ts";

const main = defineCommand({
  meta: {
    name: "jade",
    version: "0.1.1",
    description: "Worktree workspace manager for multi-app development",
  },
  subCommands: {
    init,
    add,
    worktree,
    checkout,
    status,
  },
});

runMain(main);