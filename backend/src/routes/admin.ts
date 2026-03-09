import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";

export const adminRouter = Router();

adminRouter.use(requireAuth());

adminRouter.get("/conversations", (_req, res) => {
  res.json([]);
});
