import passport from "passport";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./prisma.js";
import type { Role } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, "../../../.env");
const cwdEnv = path.resolve(process.cwd(), "../.env");
loadEnv({ path: rootEnv });
loadEnv({ path: cwdEnv });

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "mdttac.com";

function setupGoogleStrategy(): void {
  const clientID = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientID || !clientSecret) {
    console.warn("Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing). Admin login will be disabled.");
    return;
  }
  import("passport-google-oauth20")
    .then(({ Strategy: GoogleStrategy }) => {
      passport.use(
        new GoogleStrategy(
          {
            clientID,
            clientSecret,
            callbackURL:
              process.env.AUTH_CALLBACK_URL ||
              (process.env.PUBLIC_URL || "http://localhost:3000") + "/auth/google/callback",
          },
          async (_accessToken, _refreshToken, profile, done) => {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(null, false, { message: "No email from Google" });
            }
            const domain = email.split("@")[1]?.toLowerCase();
            if (domain !== allowedDomain.toLowerCase()) {
              return done(null, false, { message: "Domain not allowed" });
            }
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
              return done(null, {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                role: user.role,
              });
            } catch (err) {
              return done(err as Error);
            }
          }
        )
      );
    })
    .catch((err) => {
      console.warn("Google OAuth strategy failed to load:", err instanceof Error ? err.message : err);
      console.warn("Admin login will be disabled.");
    });
}

setupGoogleStrategy();

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: string }).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) {
      done(null, {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      });
    } else {
      done(null, null);
    }
  } catch (err) {
    done(err);
  }
});
