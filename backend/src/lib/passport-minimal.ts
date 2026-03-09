/**
 * Passport setup without any OAuth strategies.
 * Used when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set so we never load passport-google-oauth20.
 */
import passport from "passport";
import { prisma } from "./prisma.js";

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
