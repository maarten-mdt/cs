/**
 * Lazy Google OAuth strategy. Only loaded when user hits /auth/google.
 * Never imported at startup so server always starts.
 */
import passport from "passport";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";
import type { Role } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
loadEnv({ path: path.resolve(process.cwd(), "../.env") });

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "mdttac.com";

let registered = false;

export async function registerGoogleStrategy(): Promise<void> {
  if (registered) return;
  const clientID = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientID || !clientSecret) throw new Error("Google OAuth not configured");
  const { Strategy: GoogleStrategy } = await import("passport-google-oauth20");
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL:
          process.env.AUTH_CALLBACK_URL ||
          (process.env.PUBLIC_URL || "http://localhost:3000") + "/auth/google/callback",
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, false, { message: "No email from Google" });
        const domain = email.split("@")[1]?.toLowerCase();
        if (domain !== allowedDomain.toLowerCase()) return done(null, false, { message: "Domain not allowed" });
        try {
          const user = await prisma.user.upsert({
            where: { email },
            update: {
              name: profile.displayName || null,
              avatarUrl: profile.photos?.[0]?.value || null,
              lastLoginAt: new Date(),
            },
            create: {
              email,
              name: profile.displayName || null,
              avatarUrl: profile.photos?.[0]?.value || null,
              role: "SUPPORT" as Role,
              lastLoginAt: new Date(),
            },
          });
          done(null, { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role });
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
  registered = true;
}
