import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { routes } from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const frontendUrl = process.env.FRONTEND_URL;
const publicUrl = process.env.PUBLIC_URL;
const corsOrigins: string[] = [frontendUrl, publicUrl].filter(
  (u): u is string => !!u
);

app.use(helmet());
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : true }));
app.use(morgan("combined"));
app.use(express.json());

app.use("/", routes);

// Public home page and chat script
const publicPath = path.join(__dirname, "../../public");
app.use(express.static(publicPath));

// Admin dashboard (frontend build)
const adminPath = path.join(__dirname, "../../frontend/dist");
app.use("/admin", express.static(adminPath));
app.get("/admin/*", (_req, res) => {
  res.sendFile(path.join(adminPath, "index.html"));
});

app.listen(PORT, () => {
  console.log(`MDT Support API running on port ${PORT}`);
});
