/**
 * Config: AppConfig DB with fallback to process.env.
 * On startup, AppConfig values are loaded into env overlay; PUT connections update DB and overlay.
 */

import { prisma } from "./prisma.js";

const overlay = new Map<string, string>();

export function getConfig(key: string): string | undefined {
  return overlay.get(key) ?? process.env[key];
}

export function setConfigOverlay(key: string, value: string): void {
  overlay.set(key, value);
  if (value) process.env[key] = value;
}

export async function loadConfigFromDb(): Promise<void> {
  const rows = await prisma.appConfig.findMany();
  for (const row of rows) {
    overlay.set(row.key, row.value);
    process.env[row.key] = row.value;
  }
}

export async function saveConfig(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value, updatedAt: new Date() },
    update: { value, updatedAt: new Date() },
  });
  setConfigOverlay(key, value);
}

export async function getConfigFromDb(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}
