#!/usr/bin/env bun

import { generate } from "../src/generate";
import path from "path";
import { ZodError } from "zod";
import fs from "fs/promises";

const OUTPUT_FILE = process.env.OUTPUT_FILE || "api.json";

const ALLOWED_PROVIDER_PREFIXES = [
  "alibaba",
  "deepseek",
  "jiaorong",
  "minimax",
  "moonshotai",
  "opencode",
  "xiaomi",
  "zai",
  "zhipuai",
];

try {
  const allProviders = await generate(
    path.join(import.meta.dirname, "..", "..", "..", "providers"),
  );

  const providers: Record<string, any> = {};
  for (const [id, data] of Object.entries(allProviders)) {
    if (ALLOWED_PROVIDER_PREFIXES.some((prefix) => id.startsWith(prefix))) {
      providers[id] = data;
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(providers, null, 2));

  console.log(`Successfully generated ${OUTPUT_FILE}`);
  const providerCount = Object.keys(providers).length;
  let modelCount = 0;
  for (const provider of Object.values(providers)) {
    modelCount += Object.keys((provider as any).models || {}).length;
  }
  console.log(`Total: ${providerCount} providers, ${modelCount} models`);
} catch (e: any) {
  if (e instanceof ZodError) {
    console.error("Validation error:", e.errors);
    console.error("When parsing:", e.cause);
    process.exit(1);
  }
  throw e;
}
