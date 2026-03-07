import { Router, Request, Response } from "express";
import { getPool } from "../db/client.js";

export const customersRouter = Router();

customersRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT c.id, c.email, c.name, c.address, c.merged_into_email, c.last_seen_at, c.metadata, c.created_at, c.updated_at,
              (SELECT COUNT(*)::int FROM conversations WHERE customer_email = c.email) AS conversation_count
       FROM customers c
       WHERE c.merged_into_email IS NULL
       ORDER BY c.last_seen_at DESC NULLS LAST, c.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List customers error:", err);
    res.status(500).json({ error: "Failed to list customers" });
  }
});

customersRouter.get("/:email", async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const pool = getPool();
    const result = await pool.query(
      `SELECT c.id, c.email, c.name, c.address, c.merged_into_email, c.last_seen_at, c.metadata, c.created_at, c.updated_at,
              (SELECT COUNT(*)::int FROM conversations WHERE customer_email = c.email) AS conversation_count
       FROM customers c
       WHERE c.email = $1 AND c.merged_into_email IS NULL`,
      [email]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get customer error:", err);
    res.status(500).json({ error: "Failed to get customer" });
  }
});

customersRouter.post("/merge", async (req: Request, res: Response) => {
  try {
    const { primaryEmail, duplicateEmail } = req.body;
    if (!primaryEmail || !duplicateEmail || typeof primaryEmail !== "string" || typeof duplicateEmail !== "string") {
      res.status(400).json({ error: "primaryEmail and duplicateEmail are required" });
      return;
    }
    const primary = primaryEmail.trim().toLowerCase();
    const duplicate = duplicateEmail.trim().toLowerCase();
    if (primary === duplicate) {
      res.status(400).json({ error: "primaryEmail and duplicateEmail must be different" });
      return;
    }

    const pool = getPool();

    const primaryRow = await pool.query(
      `SELECT id FROM customers WHERE email = $1 AND merged_into_email IS NULL`,
      [primary]
    );
    if (primaryRow.rows.length === 0) {
      res.status(404).json({ error: "Primary customer not found" });
      return;
    }

    const duplicateRow = await pool.query(
      `SELECT id FROM customers WHERE email = $1 AND merged_into_email IS NULL`,
      [duplicate]
    );
    if (duplicateRow.rows.length === 0) {
      res.status(404).json({ error: "Duplicate customer not found or already merged" });
      return;
    }

    await pool.query(
      `UPDATE conversations SET customer_email = $1, updated_at = NOW() WHERE customer_email = $2`,
      [primary, duplicate]
    );
    await pool.query(
      `UPDATE customers SET merged_into_email = $1, updated_at = NOW() WHERE email = $2`,
      [primary, duplicate]
    );

    res.json({ ok: true, primaryEmail: primary, merged: duplicate });
  } catch (err) {
    console.error("Merge customers error:", err);
    res.status(500).json({ error: "Failed to merge customers" });
  }
});
