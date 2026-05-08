#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import init from "./src/commands/init.ts";
import add from "./src/commands/add.ts";
import remove from "./src/commands/remove.ts";
import workspace from "./src/commands/workspace.ts";
import checkout from "./src/commands/checkout.ts";
import status from "./src/commands/status.ts";
import update from "./src/commands/update.ts";
import skills from "./src/commands/skills.ts";
import env from "./src/commands/env.ts";

const main = defineCommand({
  meta: {
    name: "jade",
    version: "0.1.2",
    description: "Workspace manager for multi-app development",
  },
  subCommands: {
    init,
    add,
    remove,
    workspace,
    checkout,
    status,
    update,
    skills,
    env,
  },
});

runMain(main);