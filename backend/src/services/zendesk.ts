/**
 * Zendesk Help Center sync: all articles, paginate via next_page.
 * Uses ZENDESK_SUBDOMAIN (prefix only, e.g. "mdt"), ZENDESK_EMAIL, ZENDESK_API_TOKEN.
 * Exact API errors are surfaced in source.errorMessage.
 */

import * as cheerio from "cheerio";
import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { chunkText, insertKnowledgeChunks } from "./knowledgeChunks.js";

const FETCH_TIMEOUT_MS = 15000;
const MAX_ARTICLES = 10_000;

function getBaseUrl(): string {
  const sub = process.env.ZENDESK_SUBDOMAIN?.trim();
  if (!sub) throw new Error("ZENDESK_SUBDOMAIN is required (subdomain only, e.g. mdt)");
  const clean = sub.replace(/\.zendesk\.com$/i, "").trim();
  return `https://${clean}.zendesk.com`;
}

function getAuthHeader(): string {
  const email = process.env.ZENDESK_EMAIL?.trim();
  const token = process.env.ZENDESK_API_TOKEN?.trim();
  if (!email || !token) throw new Error("ZENDESK_EMAIL and ZENDESK_API_TOKEN are required");
  const cred = Buffer.from(`${email}/token:${token}`).toString("base64");
  return `Basic ${cred}`;
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  const text = $("body").text() ?? $.text();
  return text.replace(/\s+/g, " ").trim();
}

export async function syncZendeskArticles(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "ZENDESK") {
    throw new Error("Source not found or not a Zendesk source");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const baseUrl = getBaseUrl();
  const auth = getAuthHeader();

  let nextUrl: string | null = `${baseUrl}/api/v2/help_center/articles.json?per_page=100`;
  const articles: { html_url: string; title: string; body: string }[] = [];

  try {
    while (nextUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(nextUrl, {
        signal: controller.signal,
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
      });
      clearTimeout(timeout);
      const body = await res.text();
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${body || res.statusText}. ZENDESK_SUBDOMAIN must be prefix only (e.g. "mdt" not "mdt.zendesk.com").`
        );
      }
      const json = JSON.parse(body) as {
        articles?: { html_url?: string; title?: string; body?: string }[];
        next_page?: string | null;
      };
      const list = json.articles ?? [];
      for (const a of list) {
        if (a.html_url && (a.title != null || a.body != null)) {
          articles.push({
            html_url: a.html_url,
            title: a.title ?? "",
            body: a.body ?? "",
          });
        }
      }
      nextUrl = json.next_page ?? null;
      if (articles.length >= MAX_ARTICLES) break;
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : String(err);
    const fullMessage =
      message.includes("fetch") || message.includes("abort") || message.includes("ECONNREFUSED")
        ? `Zendesk API unreachable. ZENDESK_SUBDOMAIN must be prefix only (e.g. "mdt" not "mdt.zendesk.com"). Raw error: ${message}`
        : message;
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: fullMessage },
    });
    return;
  }

  const items: { content: string; url: string; title: string }[] = [];
  for (const a of articles) {
    const text = stripHtml(a.body);
    if (text.length < 100) continue;
    const chunks = chunkText(text);
    for (const ch of chunks) {
      items.push({ content: ch.content, url: a.html_url, title: a.title });
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
