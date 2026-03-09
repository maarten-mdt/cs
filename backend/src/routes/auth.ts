import { Router, Request, Response } from "express";
import passport from "passport";
import { prisma } from "../lib/prisma.js";
import type { User as PrismaUser } from "@prisma/client";

export const authRouter = Router();

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
}

authRouter.get("/auth/google", async (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/admin/login?error=config`);
  }
  try {
    const { registerGoogleStrategy } = await import("../lib/passport-google.js");
    await registerGoogleStrategy();
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  } catch (e) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/admin/login?error=config`);
  }
});

authRouter.get("/auth/google/callback", async (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/admin/login?error=config`);
  }
  try {
    const { registerGoogleStrategy } = await import("../lib/passport-google.js");
    await registerGoogleStrategy();
    passport.authenticate("google", { session: true, failureRedirect: "/auth/failed" })(req, res, next);
  } catch (e) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/admin/login?error=config`);
  }
}, async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/admin/`);
});

authRouter.get("/auth/failed", (_req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/admin/login?error=domain`);
});

authRouter.get("/auth/me", (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const u = req.user as SessionUser;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
  });
});

authRouter.post("/auth/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: "Logout failed" });
      return;
    }
    res.status(200).json({ ok: true });
  });
});
