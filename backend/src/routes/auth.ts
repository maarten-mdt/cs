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

authRouter.get("/auth/google", (req, res, next) => {
  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

authRouter.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: true, failureRedirect: "/auth/failed" }),
  async (req: Request, res: Response) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/admin/`);
  }
);

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
