import { Router, Request, Response } from "express";
import { createTicket } from "../services/zendesk.js";

export const zendeskRouter = Router();

zendeskRouter.post("/escalate", async (req: Request, res: Response) => {
  try {
    const { subject, description, requesterEmail, requesterName } = req.body;

    if (!requesterEmail) {
      res.status(400).json({ error: "requesterEmail is required" });
      return;
    }

    const result = await createTicket({
      subject: subject || "Chat escalation - needs human support",
      description: description || "Customer requested to speak with a human.",
      requesterEmail,
      requesterName,
    });

    if (result.error) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ ticketId: result.id, message: "Support ticket created" });
  } catch (err) {
    console.error("Zendesk escalate error:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});
