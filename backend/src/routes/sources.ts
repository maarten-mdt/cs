import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getPool } from "../db/client.js";
import { runSync, type SourceType } from "../services/sync/run.js";

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, type, config, last_synced_at, last_sync_status, last_sync_error, created_at 
       FROM data_sources ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List sources error:", err);
    res.status(500).json({ error: "Failed to list sources" });
  }
});

sourcesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { name, type, config } = req.body;
    if (!name || !type) {
      res.status(400).json({ error: "name and type required" });
      return;
    }
    const validTypes: SourceType[] = ["website", "zendesk", "shopify_products", "manual"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: "Invalid type. Use: website, zendesk, shopify_products, manual" });
      return;
    }
    const pool = getPool();
    const id = uuidv4();
    await pool.query(
      `INSERT INTO data_sources (id, name, type, config) VALUES ($1, $2, $3, $4)`,
      [id, name, type, JSON.stringify(config || {})]
    );
    res.status(201).json({ id, name, type, config: config || {} });
  } catch (err) {
    console.error("Create source error:", err);
    res.status(500).json({ error: "Failed to create source" });
  }
});

sourcesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, type, config, last_synced_at, last_sync_status, last_sync_error, created_at 
       FROM data_sources WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get source error:", err);
    res.status(500).json({ error: "Failed to get source" });
  }
});

sourcesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { name, config } = req.body;
    const pool = getPool();
    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(name);
    }
    if (config !== undefined) {
      updates.push(`config = $${i++}`);
      values.push(JSON.stringify(config));
    }
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await pool.query(
      `UPDATE data_sources SET ${updates.join(", ")} WHERE id = $${i}`,
      values
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Update source error:", err);
    res.status(500).json({ error: "Failed to update source" });
  }
});

sourcesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    await pool.query(`DELETE FROM data_sources WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete source error:", err);
    res.status(500).json({ error: "Failed to delete source" });
  }
});

sourcesRouter.post("/:id/sync", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const src = await pool.query(
      `SELECT id, type, config FROM data_sources WHERE id = $1`,
      [req.params.id]
    );
    if (src.rows.length === 0) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    const row = src.rows[0];
    if (row.type === "manual") {
      res.status(400).json({ error: "Manual sources are not synced automatically" });
      return;
    }
    const result = await runSync(
      row.id,
      row.type as SourceType,
      row.config || {}
    );
    res.json(result);
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Sync failed" });
  }
});

sourcesRouter.get("/:id/chunks", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, content, title, url, created_at FROM knowledge_chunks 
       WHERE source_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("List chunks error:", err);
    res.status(500).json({ error: "Failed to list chunks" });
  }
});
