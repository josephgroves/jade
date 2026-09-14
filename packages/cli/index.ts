#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import init from "./src/commands/init.ts";
import add from "./src/commands/add.ts";
import remove from "./src/commands/remove.ts";
import workspace from "./src/commands/workspace.ts";
import checkout from "./src/commands/checkout.ts";
import status from "./src/commands/status.ts";
import open from "./src/commands/open.ts";
import update from "./src/commands/update.ts";
import skills from "./src/commands/skills.ts";
import env from "./src/commands/env.ts";
import brand from "./src/commands/brand.ts";

const main = defineCommand({
  meta: {
    name: "jade",
    version: "0.2.0",
    description: "Workspace manager for multi-app development",
  },
  subCommands: {
    init,
    add,
    remove,
    workspace,
    checkout,
    status,
    open,
    update,
    skills,
    env,
    brand,
  },
});

runMain(main);