import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, Request, Response, NextFunction } from "express";

interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

declare module "express-session" {
  interface SessionData {
    passport: { user: UserProfile };
  }
}

// Track whether auth is enabled (set during setupAuth)
let authEnabled = false;
export function isAuthEnabled() { return authEnabled; }

/**
 * Configure Google OAuth + session middleware on the Express app.
 * Requires env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET
 * Optional: ALLOWED_EMAILS (comma-separated whitelist)
 */
export function setupAuth(app: Express) {
  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET || "at-edge-dev-secret-change-me";
  const baseUrl = process.env.BASE_URL || "http://localhost:3001";

  if (!clientID || !clientSecret) {
    console.log("  Auth: DISABLED (set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to enable)");
    return;
  }

  authEnabled = true;

  // Parse allowed emails whitelist
  const allowedEmails = process.env.ALLOWED_EMAILS
    ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim().toLowerCase())
    : [];

  // Session config
  app.set("trust proxy", 1); // Trust Railway's reverse proxy for secure cookies
  app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "lax",
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Google OAuth strategy
  passport.use(new GoogleStrategy(
    {
      clientID,
      clientSecret,
      callbackURL: `${baseUrl}/auth/google/callback`,
    },
    (_accessToken, _refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value || "";
      const user: UserProfile = {
        id: profile.id,
        email,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value,
      };

      // Check email whitelist if configured
      if (allowedEmails.length > 0 && !allowedEmails.includes(email.toLowerCase())) {
        return done(null, false, { message: "Email not authorized" });
      }

      return done(null, user);
    }
  ));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user: UserProfile, done) => done(null, user));

  // Auth routes
  app.get("/auth/google", (req, res, next) => {
    // Save the page the user was trying to reach
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "/";
    (req.session as any).returnTo = returnTo;
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/auth/failed" }),
    (req, res) => {
      const returnTo = (req.session as any).returnTo || "/";
      delete (req.session as any).returnTo;
      res.redirect(returnTo);
    }
  );

  app.get("/auth/failed", (_req, res) => {
    res.status(403).send(`
      <html><body style="background:#0B0D10;color:#E8E9EB;font-family:Inter,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h1 style="font-size:24px;margin-bottom:8px">Access Denied</h1>
          <p style="color:#9BA1A8">Your Google account is not authorized for ReserveIQ.</p>
          <a href="/auth/google" style="color:#547C81;margin-top:16px;display:inline-block">Try another account</a>
        </div>
      </body></html>
    `);
  });

  app.get("/auth/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json({ authenticated: true, user: req.user });
    } else {
      res.json({ authenticated: false });
    }
  });

  console.log(`  Auth: Google OAuth enabled`);
  if (allowedEmails.length > 0) {
    console.log(`  Auth: Whitelist — ${allowedEmails.join(", ")}`);
  }
}

/**
 * Middleware that requires authentication for all /api/* routes.
 * No-op when Google OAuth is not configured (dev mode).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // If auth isn't configured, allow everything (dev mode)
  if (!authEnabled) return next();

  // Skip auth for auth routes, health check, and static files
  if (
    req.path.startsWith("/auth/") ||
    req.path === "/api/health" ||
    req.path === "/api/auth/user" ||
    !req.path.startsWith("/api/")
  ) {
    return next();
  }

  if (req.isAuthenticated()) {
    return next();
  }

  res.status(401).json({ error: "Authentication required" });
}
