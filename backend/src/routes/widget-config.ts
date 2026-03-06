import { Router, Request, Response } from "express";
import { getPool } from "../db/client.js";

export const widgetConfigRouter = Router();

widgetConfigRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT greeting, suggested_questions FROM widget_config WHERE id = 1 LIMIT 1`
    );
    const row = result.rows[0];
    if (!row) {
      res.json({
        greeting: "Hi! How can I help you today?",
        suggestedQuestions: ["Where is my order?", "Product compatibility", "Return policy"],
      });
      return;
    }
    res.json({
      greeting: row.greeting || "Hi! How can I help you today?",
      suggestedQuestions: Array.isArray(row.suggested_questions)
        ? row.suggested_questions
        : ["Where is my order?", "Product compatibility", "Return policy"],
    });
  } catch (err) {
    console.error("Get widget config error:", err);
    res.status(500).json({ error: "Failed to get config" });
  }
});

widgetConfigRouter.put("/", async (req: Request, res: Response) => {
  try {
    const { greeting, suggestedQuestions } = req.body;
    const pool = getPool();
    if (greeting != null) {
      await pool.query(`UPDATE widget_config SET greeting = $1, updated_at = NOW() WHERE id = 1`, [
        String(greeting),
      ]);
    }
    if (Array.isArray(suggestedQuestions)) {
      await pool.query(
        `UPDATE widget_config SET suggested_questions = $1::jsonb, updated_at = NOW() WHERE id = 1`,
        [JSON.stringify(suggestedQuestions)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Update widget config error:", err);
    res.status(500).json({ error: "Failed to update config" });
  }
});
