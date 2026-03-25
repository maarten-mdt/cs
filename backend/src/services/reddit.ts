/**
 * Reddit scraper: search subreddits for MDT-related posts, extract Q&A content,
 * and store as KnowledgeChunks for RAG.
 */

import { prisma } from "../lib/prisma.js";
import { SyncStatus } from "@prisma/client";
import { insertKnowledgeChunks, type KnowledgeChunkItem } from "./knowledgeChunks.js";

const REDDIT_USER_AGENT = "MDTSupportBot/1.0 (by MDT Sporting Goods; educational/support use)";
const RATE_LIMIT_MS = 2000;
const MAX_POSTS_PER_SUB = 100;
const MIN_COMMENT_SCORE = 2;
const MAX_COMMENTS_PER_POST = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchRedditJson(url: string): Promise<unknown> {
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}raw_json=1`;
  const res = await fetch(fullUrl, {
    headers: { "User-Agent": REDDIT_USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Reddit API HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  permalink: string;
  score: number;
  num_comments: number;
  url: string;
}

interface RedditComment {
  body: string;
  score: number;
  author: string;
}

function parseSearchResults(json: unknown): RedditPost[] {
  const data = json as { data?: { children?: { data: RedditPost }[] } };
  return (data?.data?.children ?? []).map((c) => c.data);
}

function parseComments(json: unknown): RedditComment[] {
  const listings = json as { data?: { children?: { kind: string; data: RedditComment }[] } }[];
  if (!Array.isArray(listings) || listings.length < 2) return [];
  const commentListing = listings[1];
  return (commentListing?.data?.children ?? [])
    .filter((c) => c.kind === "t1" && c.data.body && c.data.score >= MIN_COMMENT_SCORE)
    .map((c) => c.data)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_COMMENTS_PER_POST);
}

function buildChunkContent(post: RedditPost, comments: RedditComment[]): string {
  const parts: string[] = [];
  parts.push(`Q: ${post.title}`);
  if (post.selftext?.trim()) {
    parts.push(post.selftext.trim().slice(0, 1500));
  }
  if (comments.length > 0) {
    parts.push("\nCommunity answers:");
    for (const c of comments) {
      parts.push(`- ${c.body.trim().slice(0, 500)} (score: ${c.score})`);
    }
  }
  return parts.join("\n");
}

/**
 * Parse subreddit list from URL field. Accepts:
 * "r/longrange,r/precisionrifles" or "longrange,precisionrifles" or "r/longrange r/precisionrifles"
 */
function parseSubreddits(urlField: string): string[] {
  return urlField
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^r\//, ""))
    .filter(Boolean);
}

export async function syncRedditSource(sourceId: string): Promise<void> {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "REDDIT") {
    throw new Error("Source not found or not a Reddit source");
  }
  if (!source.url?.trim()) {
    throw new Error("Reddit source requires subreddit list in URL field (e.g. r/longrange,r/precisionrifles)");
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: SyncStatus.SYNCING, errorMessage: null },
  });

  const subreddits = parseSubreddits(source.url);
  if (subreddits.length === 0) {
    throw new Error("No valid subreddits found in URL field");
  }

  const items: KnowledgeChunkItem[] = [];

  try {
    for (const sub of subreddits) {
      console.log(`[reddit] Searching r/${sub} for MDT posts...`);

      // Search for MDT-related posts
      const searchUrl = `https://www.reddit.com/r/${encodeURIComponent(sub)}/search.json?q=MDT+OR+%22modular+driven%22&restrict_sr=on&sort=new&limit=${MAX_POSTS_PER_SUB}`;
      const searchJson = await fetchRedditJson(searchUrl);
      await sleep(RATE_LIMIT_MS);

      const posts = parseSearchResults(searchJson);
      console.log(`[reddit] Found ${posts.length} posts in r/${sub}`);

      for (const post of posts) {
        // Skip low-quality posts
        if (post.score < 1 && post.num_comments < 1) continue;

        // Fetch comments for posts with discussion
        let comments: RedditComment[] = [];
        if (post.num_comments > 0) {
          try {
            const commentsUrl = `https://www.reddit.com${post.permalink}.json?limit=${MAX_COMMENTS_PER_POST}&sort=top`;
            const commentsJson = await fetchRedditJson(commentsUrl);
            comments = parseComments(commentsJson);
            await sleep(RATE_LIMIT_MS);
          } catch (e) {
            console.warn(`[reddit] Failed to fetch comments for ${post.id}:`, (e as Error).message);
          }
        }

        const content = buildChunkContent(post, comments);
        if (content.length < 50) continue;

        items.push({
          content,
          url: `https://www.reddit.com${post.permalink}`,
          title: `[r/${sub}] ${post.title}`,
        });
      }
    }

    if (items.length === 0) {
      console.log("[reddit] No MDT-related posts found across subreddits");
    }

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
    console.log(`[reddit] Synced ${items.length} posts from ${subreddits.length} subreddits`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reddit] Sync failed:", message);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: SyncStatus.FAILED, errorMessage: message },
    });
  }
}
