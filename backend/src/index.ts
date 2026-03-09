import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { routes } from "./routes/index.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import "./lib/passport.js";
import passport from "passport";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const frontendUrl = process.env.FRONTEND_URL;
const publicUrl = process.env.PUBLIC_URL;
const corsOrigins: string[] = [frontendUrl, publicUrl].filter(
  (u): u is string => !!u
);

app.use(helmet());
app.use(cors({ origin: corsOrigins.length > 0 ? corsOrigins : true, credentials: true }));
app.use(morgan("combined"));
app.use(express.json());

const PgSession = connectPgSimple(session);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(
  session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use("/", authRouter);
app.use("/", adminRouter);
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
