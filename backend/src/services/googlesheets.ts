/**
 * Google Sheets sync: fetch spreadsheet by ID, all sheets, convert to text chunks.
 * Auth: GOOGLE_SERVICE_ACCOUNT_JSON (same as Drive) or GOOGLE_SHEETS_ACCESS_TOKEN.
 * Source.url holds the spreadsheet URL or ID (e.g. https://docs.google.com/spreadsheets/d/ID/edit or just ID).
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { chunkText, insertKnowledgeChunks } from "./knowledgeChunks.js";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const FETCH_TIMEOUT_MS = 20000;

function extractSpreadsheetId(urlOrId: string): string {
  const s = urlOrId.trim();
  const match = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(s)) return s;
  throw new Error("Invalid spreadsheet URL or ID. Use a Google Sheets URL or the spreadsheet ID.");
}

async function getAccessToken(): Promise<string> {
  const token = process.env.GOOGLE_SHEETS_ACCESS_TOKEN?.trim();
  if (token) return token;
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!jsonStr) {
    throw new Error("GOOGLE_SHEETS_ACCESS_TOKEN or GOOGLE_SERVICE_ACCOUNT_JSON required for Google Sheets");
  }
  let key: { client_email?: string; private_key?: string };
  try {
    key = JSON.parse(jsonStr) as { client_email?: string; private_key?: string };
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }
  if (!key.client_email || !key.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
  }
  const { JWT } = await import("google-auth-library");
  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const creds = await client.authorize();
  if (!creds?.access_token) throw new Error("Failed to get Google Sheets access token");
  return creds.access_token;
}

async function fetchSheets(
  path: string,
  token: string
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(`${SHEETS_BASE}/${path}`, {
    signal: controller.signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  clearTimeout(timeout);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Sheets API HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function syncGoogleSheets(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "GOOGLE_SHEETS") {
    throw new Error("Source not found or not a Google Sheets source");
  }
  const urlOrId = source.url?.trim();
  if (!urlOrId) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: "No spreadsheet URL or ID. Set source URL." },
    });
    return;
  }

  let spreadsheetId: string;
  try {
    spreadsheetId = extractSpreadsheetId(urlOrId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: msg },
    });
    return;
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: msg },
    });
    return;
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

  let sheetTitles: string[] = [];
  try {
    const meta = (await fetchSheets(`${spreadsheetId}?fields=sheets.properties`, token)) as {
      sheets?: { properties?: { title?: string } }[];
    };
    sheetTitles = (meta.sheets ?? []).map((s) => s.properties?.title ?? "Sheet").filter(Boolean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: msg },
    });
    return;
  }

  if (sheetTitles.length === 0) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.SYNCED, chunkCount: 0, lastSyncedAt: new Date(), errorMessage: null },
    });
    return;
  }

  const items: { content: string; url: string; title: string }[] = [];

  for (const title of sheetTitles) {
    try {
      const escaped = title.replace(/'/g, "''");
      const range = encodeURIComponent(`'${escaped}'!A:ZZ`);
      const data = (await fetchSheets(
        `${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE`,
        token
      )) as { values?: unknown[][] };
      const rows = data.values ?? [];
      if (rows.length === 0) continue;
      const text = rows
        .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "").trim()).join("\t") : ""))
        .join("\n");
      if (text.length < 20) continue;
      const chunks = chunkText(text);
      for (const ch of chunks) {
        items.push({ content: ch.content, url: sheetUrl, title });
      }
    } catch (e) {
      console.warn(`[googlesheets] Skip sheet "${title}":`, (e as Error).message);
    }
  }

  try {
    await insertKnowledgeChunks(sourceId, items);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: SyncStatus.SYNCED,
        chunkCount: items.length,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: message },
    });
  }
}
