/**
 * Google Drive folder sync: list files with pageToken, recurse subfolders (max depth 15).
 * Auth: GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_ACCESS_TOKEN.
 * Source.url holds the root folder ID.
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { chunkText, insertKnowledgeChunks } from "./knowledgeChunks.js";

const DRIVE_LIST_URL = "https://www.googleapis.com/drive/v3/files";
const MAX_DEPTH = 15;
const PAGE_SIZE = 200;
const FETCH_TIMEOUT_MS = 20000;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PLAIN_MIME = "text/plain";

async function getAccessToken(): Promise<string> {
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  if (token) return token;
  const jsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!jsonStr) {
    throw new Error("GOOGLE_DRIVE_ACCESS_TOKEN or GOOGLE_SERVICE_ACCOUNT_JSON is required");
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
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const creds = await client.authorize();
  if (!creds?.access_token) throw new Error("Failed to get Google Drive access token");
  return creds.access_token;
}

async function fetchDrive(
  url: string,
  token: string
): Promise<{ body: unknown; nextPageToken?: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  clearTimeout(timeout);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive API HTTP ${res.status}: ${text || res.statusText}`);
  }
  const body = (await res.json()) as { files?: unknown[]; nextPageToken?: string | null };
  return { body, nextPageToken: body.nextPageToken };
}

async function listFilesInFolder(
  folderId: string,
  token: string,
  pageToken?: string | null
): Promise<{ files: { id: string; name: string; mimeType: string }[]; nextPageToken: string | null }> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents`,
    pageSize: String(PAGE_SIZE),
    fields: "nextPageToken, files(id, name, mimeType)",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const url = `${DRIVE_LIST_URL}?${params.toString()}`;
  const { body, nextPageToken } = await fetchDrive(url, token);
  const files = (body as { files?: { id: string; name: string; mimeType: string }[] }).files ?? [];
  return { files, nextPageToken: nextPageToken ?? null };
}

async function downloadFile(id: string, token: string): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    signal: controller.signal,
    headers: { Authorization: `Bearer ${token}` },
  });
  clearTimeout(timeout);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive download HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.arrayBuffer();
}

async function extractTextFromBuffer(
  buffer: ArrayBuffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  if (mimeType === PLAIN_MIME || fileName.toLowerCase().endsWith(".txt")) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  if (mimeType === PDF_MIME || fileName.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return (result?.text ?? "").trim();
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === DOCX_MIME || fileName.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return (result?.value ?? "").trim();
  }
  return "";
}

async function listAllFilesRecursive(
  folderId: string,
  token: string,
  depth: number
): Promise<{ id: string; name: string; mimeType: string }[]> {
  if (depth > MAX_DEPTH) return [];
  const files: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | null = null;
  do {
    const { files: page, nextPageToken } = await listFilesInFolder(folderId, token, pageToken);
    for (const f of page) {
      if (f.mimeType === FOLDER_MIME) {
        const nested = await listAllFilesRecursive(f.id, token, depth + 1);
        files.push(...nested);
      } else {
        files.push(f);
      }
    }
    pageToken = nextPageToken;
  } while (pageToken);
  return files;
}

export async function syncGoogleDriveFolder(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "GOOGLE_DRIVE") {
    throw new Error("Source not found or not a Google Drive source");
  }
  const folderId = source.url?.trim();
  if (!folderId) {
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: "No folder ID set. Set source URL to the Drive folder ID." },
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

  const allFiles: { id: string; name: string; mimeType: string }[] = [];
  try {
    const topLevel = await listAllFilesRecursive(folderId, token, 0);
    allFiles.push(...topLevel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: msg },
    });
    return;
  }

  const items: { content: string; url: string | null; title: string }[] = [];
  for (const file of allFiles) {
    if (file.mimeType === FOLDER_MIME) continue;
    const supported =
      file.mimeType === PDF_MIME ||
      file.mimeType === DOCX_MIME ||
      file.mimeType === PLAIN_MIME ||
      /\.(pdf|docx|txt)$/i.test(file.name);
    if (!supported) continue;
    try {
      const buffer = await downloadFile(file.id, token);
      const text = await extractTextFromBuffer(buffer, file.mimeType, file.name);
      if (text.length < 50) continue;
      const chunks = chunkText(text);
      const fileUrl = `https://drive.google.com/file/d/${file.id}/view`;
      for (const ch of chunks) {
        items.push({ content: ch.content, url: fileUrl, title: file.name });
      }
    } catch (e) {
      console.warn(`[googledrive] Skip ${file.name}:`, (e as Error).message);
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
