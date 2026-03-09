/**
 * Rate limit: 20 requests per minute per IP for /api/chat/* (message, session, escalate, etc.).
 * Returns 429 { error: 'Too many requests' } when exceeded.
 */

import { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

const store = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

export function rateLimitChat(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();
  let entry = store.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
    next();
    return;
  }
  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  next();
}
