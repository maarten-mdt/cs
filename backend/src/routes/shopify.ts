import { Router, Request, Response } from "express";
import {
  getOrder,
  getOrdersByEmail,
  searchProducts,
} from "../services/shopify.js";

export const shopifyRouter = Router();

shopifyRouter.get("/orders/:id", async (req: Request, res: Response) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(order);
  } catch (err) {
    console.error("Shopify order error:", err);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

shopifyRouter.get("/orders", async (req: Request, res: Response) => {
  try {
    const email = req.query.email as string;
    if (!email) {
      res.status(400).json({ error: "email query param required" });
      return;
    }
    const orders = await getOrdersByEmail(email);
    res.json(orders);
  } catch (err) {
    console.error("Shopify orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

shopifyRouter.get("/products", async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || "";
    const products = await searchProducts(query);
    res.json(products);
  } catch (err) {
    console.error("Shopify products error:", err);
    res.status(500).json({ error: "Failed to search products" });
  }
});
