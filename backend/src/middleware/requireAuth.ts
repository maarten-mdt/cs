import { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";

export function requireAuth(roles?: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (roles && roles.length > 0) {
      const userRole = (req.user as { role?: string }).role;
      if (!userRole || !roles.includes(userRole as Role)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    next();
  };
}
