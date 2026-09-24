import { loadRuntimeEnv } from "@gprn/config";
import { prisma } from "@gprn/db";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import type { CookieReply, CookieRequest } from "./http.types.js";
import { isPrismaErrorCode } from "./serialization.js";
import { asRecord, optionalString, requiredString } from "./validation.js";

const scrypt = promisify(scryptCallback);
const sessionCookieName = "gprn_session";
const sessionTtlSeconds = 60 * 60 * 24 * 30;
const authRateLimitWindowMs = 15 * 60 * 1000;
const emailVerificationTtlSeconds = 60 * 60 * 24;
const loginFailureLimit = 8;
const passwordResetAttemptLimit = 5;
const passwordResetTtlSeconds = 60 * 60;
const registerAttemptLimit = 5;
const authRateBuckets = new Map<string, { count: number; resetAt: number }>();
const googleOAuthStateTtlMs = 10 * 60 * 1000;
const googleConnectionType = "AUTH";

interface GoogleOAuthState {
  readonly expiresAt: number;
  readonly nonce: string;
  readonly returnTo: string;
}

interface GoogleProfile {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
  readonly providerAccountId: string;
}

interface RegisterInput {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly username?: string;
}

interface LoginInput {
  readonly email: string;
  readonly password: string;
}

interface AuthTokenRecord {
  readonly expiresAt: Date;
  readonly token: string;
}

interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly status: string;
  readonly profile: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string;
    readonly bio: string | null;
    readonly avatarAssetKey: string | null;
    readonly websiteUrl: string | null;
    readonly availableForHire: boolean;
    readonly tier: string;
  } | null;
  readonly roles: readonly {
    readonly role: {
      readonly key: string;
    };
  }[];
  readonly ratings?: readonly {
    readonly scope: string;
    readonly scopeKey: string;
    readonly rating: number;
    readonly battles: number;
    readonly wins: number;
    readonly losses: number;
  }[];
}

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly profile: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string;
    readonly bio: string | null;
    readonly avatarAssetKey: string | null;
    readonly websiteUrl: string | null;
    readonly availableForHire: boolean;
    readonly tier: string;
  } | null;
  readonly ratings: readonly {
    readonly battles: number;
    readonly losses: number;
    readonly rating: number;
    readonly scope: string;
    readonly scopeKey: string;
    readonly wins: number;
  }[];
  readonly roles: readonly string[];
  readonly status: string;
}

@Injectable()
export class AuthService {
  private readonly env = loadRuntimeEnv();

  async register(
    body: unknown,
    request: CookieRequest,
    reply: CookieReply,
  ): Promise<{ user: CurrentUser }> {
    const input = parseRegisterInput(body);
    consumeAuthAttempt(
      createAuthRateKey("register", request),
      registerAttemptLimit,
    );
    const passwordHash = await hashPassword(input.password);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            profile: {
              create: {
                displayName: input.displayName,
                tier: "VIEWER",
                username: await this.createUniqueUsername(
                  input.username ?? input.displayName,
                ),
              },
            },
          },
        });

        const userRole = await tx.role.upsert({
          create: {
            key: "USER",
          },
          update: {},
          where: {
            key: "USER",
          },
        });

        await tx.userRole.create({
          data: {
            roleId: userRole.id,
            userId: createdUser.id,
          },
        });

        await tx.rating.create({
          data: {
            rating: 1500,
            scope: "GLOBAL",
            scopeKey: "global",
            userId: createdUser.id,
          },
        });

        const activeSeason = await tx.season.findFirst({
          orderBy: {
            startsAt: "asc",
          },
          where: {
            status: "ACTIVE",
          },
        });

        if (activeSeason) {
          await tx.seasonParticipant.upsert({
            create: {
              seasonId: activeSeason.id,
              userId: createdUser.id,
            },
            update: {},
            where: {
              seasonId_userId: {
                seasonId: activeSeason.id,
                userId: createdUser.id,
              },
            },
          });
        }

        await tx.analyticsEvent.createMany({
          data: [
            {
              eventName: "user_registered",
              userId: createdUser.id,
            },
            {
              eventName: "profile_created",
              userId: createdUser.id,
            },
          ],
        });

        return tx.user.findUniqueOrThrow({
          include: userInclude,
          where: {
            id: createdUser.id,
          },
        });
      });

      await this.createSessionCookie(user.id, reply);

      return {
        user: serializeUser(user),
      };
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "AUTH_EMAIL_OR_USERNAME_EXISTS",
          message: "Email or username is already registered.",
        });
      }

      throw error;
    }
  }

  async login(
    body: unknown,
    request: CookieRequest,
    reply: CookieReply,
  ): Promise<{ user: CurrentUser }> {
    const input = parseLoginInput(body);
    const rateKey = createAuthRateKey("login", request, input.email);

    assertAuthRateLimit(rateKey, loginFailureLimit);

    const user = await prisma.user.findUnique({
      include: userInclude,
      where: {
        email: input.email,
      },
    });

    if (
      !user?.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      recordAuthAttempt(rateKey);

      throw new UnauthorizedException({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      });
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        code: "AUTH_USER_NOT_ACTIVE",
        message: "This account is not active.",
      });
    }

    clearAuthRateLimit(rateKey);
    await this.createSessionCookie(user.id, reply);

    return {
      user: serializeUser(user),
    };
  }

  async requestEmailVerification(request: CookieRequest): Promise<{
    delivery:
      "ALREADY_VERIFIED" | "EMAIL_ADAPTER_NOT_IMPLEMENTED" | "EMAIL_DISABLED";
    devToken?: string;
    expiresAt?: string;
    ok: true;
  }> {
    const user = await this.requireUserFromRequest(request);

    if (user.emailVerified) {
      return {
        delivery: "ALREADY_VERIFIED",
        ok: true,
      };
    }

    const authToken = await createAuthToken(
      user.id,
      "EMAIL_VERIFICATION",
      emailVerificationTtlSeconds,
    );

    return createTokenDeliveryResponse(authToken);
  }

  async verifyEmail(body: unknown): Promise<{ user: CurrentUser }> {
    const token = requiredString(asRecord(body), "token");
    const authToken = await consumeAuthToken("EMAIL_VERIFICATION", token);

    const user = await prisma.user.update({
      data: {
        emailVerifiedAt: authToken.user.emailVerifiedAt ?? new Date(),
      },
      include: userInclude,
      where: {
        id: authToken.userId,
      },
    });

    await prisma.analyticsEvent.create({
      data: {
        eventName: "email_verified",
        userId: user.id,
      },
    });

    return {
      user: serializeUser(user),
    };
  }

  async requestPasswordReset(
    body: unknown,
    request: CookieRequest,
  ): Promise<{
    delivery: "EMAIL_ADAPTER_NOT_IMPLEMENTED" | "EMAIL_DISABLED";
    devToken?: string;
    expiresAt?: string;
    ok: true;
  }> {
    const email = normalizeEmail(requiredString(asRecord(body), "email"));
    consumeAuthAttempt(
      createAuthRateKey("password-reset", request, email),
      passwordResetAttemptLimit,
    );

    const user = await prisma.user.findUnique({
      select: {
        id: true,
        status: true,
      },
      where: {
        email,
      },
    });

    if (!user || user.status !== "ACTIVE") {
      return createTokenDeliveryResponse(null);
    }

    const authToken = await createAuthToken(
      user.id,
      "PASSWORD_RESET",
      passwordResetTtlSeconds,
    );

    return createTokenDeliveryResponse(authToken);
  }

  async resetPassword(body: unknown): Promise<{ ok: true }> {
    const record = asRecord(body);
    const password = requiredString(record, "password");
    const token = requiredString(record, "token");

    if (password.length < 8) {
      throw new BadRequestException({
        code: "AUTH_WEAK_PASSWORD",
        message: "Password must contain at least 8 characters.",
      });
    }

    const authToken = await consumeAuthToken("PASSWORD_RESET", token);
    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        data: {
          passwordHash,
        },
        where: {
          id: authToken.userId,
        },
      }),
      prisma.session.updateMany({
        data: {
          revokedAt: new Date(),
        },
        where: {
          userId: authToken.userId,
          revokedAt: null,
        },
      }),
      prisma.analyticsEvent.create({
        data: {
          eventName: "password_reset_completed",
          userId: authToken.userId,
        },
      }),
    ]);

    return {
      ok: true,
    };
  }

  async logout(
    request: CookieRequest,
    reply: CookieReply,
  ): Promise<{ ok: true }> {
    const token = request.cookies?.[sessionCookieName];

    if (token) {
      await prisma.session.updateMany({
        data: {
          revokedAt: new Date(),
        },
        where: {
          tokenHash: hashOpaqueToken(token),
          revokedAt: null,
        },
      });
    }

    reply.clearCookie(sessionCookieName, cookieOptions());

    return {
      ok: true,
    };
  }

  async me(request: CookieRequest): Promise<{ user: CurrentUser | null }> {
    const user = await this.getUserFromRequest(request);

    return {
      user,
    };
  }

  async requireUserFromRequest(request: CookieRequest): Promise<CurrentUser> {
    const user = await this.getUserFromRequest(request);

    if (!user) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
      });
    }

    return user;
  }

  getAuthProviders(): {
    providers: readonly {
      readonly id: string;
      readonly label: string;
      readonly status: "AVAILABLE" | "COMING_SOON" | "NEEDS_CONFIGURATION";
    }[];
  } {
    return {
      providers: [
        {
          id: "email",
          label: "Email",
          status: "AVAILABLE",
        },
        {
          id: "google",
          label: "Google",
          status:
            this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET
              ? "AVAILABLE"
              : "NEEDS_CONFIGURATION",
        },
        {
          id: "apple",
          label: "Apple",
          status: "COMING_SOON",
        },
      ],
    };
  }

  createGoogleAuthorizationUrl(returnTo: string | undefined): string {
    const { clientId } = this.requireGoogleConfig();
    const state = this.signGoogleState({
      expiresAt: Date.now() + googleOAuthStateTtlMs,
      nonce: randomBytes(16).toString("base64url"),
      returnTo: normalizeAuthReturnTo(returnTo),
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      access_type: "online",
      client_id: clientId,
      include_granted_scopes: "true",
      prompt: "select_account",
      redirect_uri: this.googleCallbackUrl(),
      response_type: "code",
      scope: "openid email profile",
      state,
    }).toString();
    return url.toString();
  }

  createGoogleCancelledUrl(): string {
    return createAuthReturnUrl(this.env.APP_URL, "/ru", "google_cancelled");
  }

  async completeGoogleAuthentication(
    code: string,
    signedState: string,
    reply: CookieReply,
  ): Promise<string> {
    const state = this.verifyGoogleState(signedState);

    try {
      const profile = await this.fetchGoogleProfile(code);
      if (!profile.emailVerified) {
        return createAuthReturnUrl(
          this.env.APP_URL,
          state.returnTo,
          "google_email_unverified",
        );
      }

      const username = await this.createUniqueUsername(profile.name);
      const user = await prisma.$transaction(async (tx) => {
        const connected = await tx.externalConnection.findUnique({
          include: { user: { include: userInclude } },
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId: profile.providerAccountId,
            },
          },
        });

        if (connected) return connected.user;

        let account = await tx.user.findUnique({
          include: userInclude,
          where: { email: profile.email },
        });
        if (!account) {
          const created = await tx.user.create({
            data: {
              email: profile.email,
              emailVerifiedAt: new Date(),
              profile: {
                create: {
                  displayName: profile.name,
                  tier: "VIEWER",
                  username,
                },
              },
            },
          });
          const role = await tx.role.upsert({
            create: { key: "USER" },
            update: {},
            where: { key: "USER" },
          });
          await tx.userRole.create({
            data: { roleId: role.id, userId: created.id },
          });
          await tx.rating.create({
            data: {
              rating: 1500,
              scope: "GLOBAL",
              scopeKey: "global",
              userId: created.id,
            },
          });
          const activeSeason = await tx.season.findFirst({
            orderBy: { startsAt: "asc" },
            where: { status: "ACTIVE" },
          });
          if (activeSeason) {
            await tx.seasonParticipant.create({
              data: { seasonId: activeSeason.id, userId: created.id },
            });
          }
          await tx.analyticsEvent.createMany({
            data: [
              { eventName: "user_registered_google", userId: created.id },
              { eventName: "profile_created", userId: created.id },
            ],
          });
          account = await tx.user.findUniqueOrThrow({
            include: userInclude,
            where: { id: created.id },
          });
        } else if (!account.emailVerifiedAt) {
          account = await tx.user.update({
            data: { emailVerifiedAt: new Date() },
            include: userInclude,
            where: { id: account.id },
          });
        }

        if (account.status !== "ACTIVE") {
          throw new UnauthorizedException({
            code: "AUTH_USER_NOT_ACTIVE",
            message: "This account is not active.",
          });
        }

        await tx.externalConnection.create({
          data: {
            connectionType: googleConnectionType,
            provider: "google",
            providerAccountId: profile.providerAccountId,
            scopes: ["openid", "email", "profile"],
            userId: account.id,
          },
        });
        return account;
      });

      if (user.status !== "ACTIVE") {
        return createAuthReturnUrl(
          this.env.APP_URL,
          state.returnTo,
          "google_account_inactive",
        );
      }
      await this.createSessionCookie(user.id, reply);
      return createAuthReturnUrl(
        this.env.APP_URL,
        state.returnTo,
        "google_success",
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        return createAuthReturnUrl(
          this.env.APP_URL,
          state.returnTo,
          "google_account_inactive",
        );
      }
      return createAuthReturnUrl(
        this.env.APP_URL,
        state.returnTo,
        "google_failed",
      );
    }
  }

  private requireGoogleConfig(): { clientId: string; clientSecret: string } {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET) {
      throw new ServiceUnavailableException({
        code: "GOOGLE_AUTH_NOT_CONFIGURED",
        message: "Google OAuth credentials are not configured.",
      });
    }
    return {
      clientId: this.env.GOOGLE_CLIENT_ID,
      clientSecret: this.env.GOOGLE_CLIENT_SECRET,
    };
  }

  private googleCallbackUrl(): string {
    return `${this.env.API_URL.replace(/\/$/, "")}/api/v1/auth/google/callback`;
  }

  private signGoogleState(state: GoogleOAuthState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
    const signature = createHmac("sha256", this.env.SESSION_SECRET)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }

  private verifyGoogleState(signedState: string): GoogleOAuthState {
    const [payload, signature] = signedState.split(".");
    if (!payload || !signature) throw invalidGoogleState();
    const expected = createHmac("sha256", this.env.SESSION_SECRET)
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw invalidGoogleState();
    }
    try {
      const state = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as GoogleOAuthState;
      if (
        !state.nonce ||
        !state.returnTo ||
        !Number.isFinite(state.expiresAt) ||
        state.expiresAt < Date.now()
      ) {
        throw invalidGoogleState();
      }
      return state;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw invalidGoogleState();
    }
  }

  private async fetchGoogleProfile(code: string): Promise<GoogleProfile> {
    const config = this.requireGoogleConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.googleCallbackUrl(),
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const token = (await tokenResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!tokenResponse.ok || typeof token.access_token !== "string") {
      throw new ServiceUnavailableException({
        code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
        message: "Google rejected the authorization code.",
      });
    }
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const profile = (await profileResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      !profileResponse.ok ||
      typeof profile.sub !== "string" ||
      typeof profile.email !== "string"
    ) {
      throw new ServiceUnavailableException({
        code: "GOOGLE_PROFILE_FAILED",
        message: "Google account data could not be read.",
      });
    }
    return {
      email: normalizeEmail(profile.email),
      emailVerified: profile.email_verified === true,
      name:
        typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : (profile.email.split("@")[0] ?? "Photographer"),
      providerAccountId: profile.sub,
    };
  }

  private async getUserFromRequest(
    request: CookieRequest,
  ): Promise<CurrentUser | null> {
    const token = request.cookies?.[sessionCookieName];

    if (!token) {
      return null;
    }

    const session = await prisma.session.findFirst({
      include: {
        user: {
          include: userInclude,
        },
      },
      where: {
        expiresAt: {
          gt: new Date(),
        },
        revokedAt: null,
        tokenHash: hashOpaqueToken(token),
      },
    });

    if (!session || session.user.status !== "ACTIVE") {
      return null;
    }

    await prisma.session.update({
      data: {
        lastSeenAt: new Date(),
      },
      where: {
        id: session.id,
      },
    });

    return serializeUser(session.user);
  }

  private async createSessionCookie(
    userId: string,
    reply: CookieReply,
  ): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();

    await prisma.session.create({
      data: {
        expiresAt: new Date(now + sessionTtlSeconds * 1000),
        tokenHash: hashOpaqueToken(token),
        userId,
      },
    });

    reply.setCookie(sessionCookieName, token, {
      ...cookieOptions(),
      maxAge: sessionTtlSeconds,
    });
  }

  private async createUniqueUsername(input: string): Promise<string> {
    const base = slugify(input) || "photographer";
    let username = base.slice(0, 32);
    let suffix = 2;

    while (await prisma.profile.findUnique({ where: { username } })) {
      username = `${base.slice(0, 26)}-${suffix}`;
      suffix += 1;
    }

    return username;
  }
}

export const userInclude = {
  profile: true,
  ratings: true,
  roles: {
    include: {
      role: true,
    },
  },
} as const;

function parseRegisterInput(body: unknown): RegisterInput {
  const record = asRecord(body);
  const email = normalizeEmail(requiredString(record, "email"));
  const password = requiredString(record, "password");
  const displayName = requiredString(record, "displayName");
  const username = optionalString(record, "username");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException({
      code: "AUTH_INVALID_EMAIL",
      message: "Email is invalid.",
    });
  }

  if (password.length < 8) {
    throw new BadRequestException({
      code: "AUTH_WEAK_PASSWORD",
      message: "Password must contain at least 8 characters.",
    });
  }

  if (displayName.length < 2) {
    throw new BadRequestException({
      code: "PROFILE_INVALID_DISPLAY_NAME",
      message: "Display name must contain at least 2 characters.",
    });
  }

  return {
    displayName,
    email,
    password,
    username,
  };
}

function parseLoginInput(body: unknown): LoginInput {
  const record = asRecord(body);

  return {
    email: normalizeEmail(requiredString(record, "email")),
    password: requiredString(record, "password"),
  };
}

function serializeUser(user: UserRecord): CurrentUser {
  return {
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    id: user.id,
    profile: user.profile
      ? {
          avatarAssetKey: user.profile.avatarAssetKey,
          bio: user.profile.bio,
          displayName: user.profile.displayName,
          id: user.profile.id,
          username: user.profile.username,
          availableForHire: user.profile.availableForHire,
          tier: user.profile.tier,
          websiteUrl: user.profile.websiteUrl,
        }
      : null,
    ratings:
      user.ratings?.map((rating) => ({
        battles: rating.battles,
        losses: rating.losses,
        rating: rating.rating,
        scope: rating.scope,
        scopeKey: rating.scopeKey,
        wins: rating.wins,
      })) ?? [],
    roles: user.roles.map(({ role }) => role.key),
    status: user.status,
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [scheme, salt, hash] = storedHash.split("$");

  if (scheme !== "scrypt" || !salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeAuthReturnTo(returnTo: string | undefined): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/ru";
  }
  return returnTo.slice(0, 500);
}

function createAuthReturnUrl(
  appUrl: string,
  returnTo: string,
  outcome: string,
): string {
  const url = new URL(returnTo, `${appUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("auth", outcome);
  return url.toString();
}

function invalidGoogleState(): BadRequestException {
  return new BadRequestException({
    code: "GOOGLE_OAUTH_STATE_INVALID",
    message: "Google OAuth state is invalid or expired.",
  });
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cookieOptions(): Record<string, unknown> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

function assertAuthRateLimit(key: string, limit: number): void {
  const now = Date.now();
  const bucket = authRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    return;
  }

  if (bucket.count >= limit) {
    throw new HttpException(
      {
        code: "AUTH_RATE_LIMITED",
        message: "Too many authentication attempts. Please try again later.",
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function consumeAuthAttempt(key: string, limit: number): void {
  assertAuthRateLimit(key, limit);
  recordAuthAttempt(key);
}

function recordAuthAttempt(key: string): void {
  const now = Date.now();
  const bucket = authRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    authRateBuckets.set(key, {
      count: 1,
      resetAt: now + authRateLimitWindowMs,
    });
    return;
  }

  bucket.count += 1;
}

function clearAuthRateLimit(key: string): void {
  authRateBuckets.delete(key);
}

function createAuthRateKey(
  action: string,
  request: CookieRequest,
  subject = "global",
): string {
  return `${action}:${getClientIp(request)}:${subject}`;
}

function getClientIp(request: CookieRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  if (firstForwarded) {
    return firstForwarded.split(",")[0]?.trim() || "unknown";
  }

  return request.ip ?? "unknown";
}

async function createAuthToken(
  userId: string,
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  ttlSeconds: number,
): Promise<AuthTokenRecord> {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await prisma.$transaction([
    prisma.authToken.updateMany({
      data: {
        revokedAt: now,
      },
      where: {
        expiresAt: {
          gt: now,
        },
        purpose,
        revokedAt: null,
        usedAt: null,
        userId,
      },
    }),
    prisma.authToken.create({
      data: {
        expiresAt,
        purpose,
        tokenHash: hashOpaqueToken(token),
        userId,
      },
    }),
  ]);

  return {
    expiresAt,
    token,
  };
}

async function consumeAuthToken(
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  token: string,
): Promise<{
  readonly user: UserRecord;
  readonly userId: string;
}> {
  const authToken = await prisma.authToken.findUnique({
    include: {
      user: {
        include: userInclude,
      },
    },
    where: {
      tokenHash: hashOpaqueToken(token),
    },
  });

  if (
    !authToken ||
    authToken.purpose !== purpose ||
    authToken.revokedAt ||
    authToken.usedAt ||
    authToken.expiresAt <= new Date() ||
    authToken.user.status !== "ACTIVE"
  ) {
    throw new BadRequestException({
      code: "AUTH_TOKEN_INVALID",
      message: "This authentication token is invalid or expired.",
    });
  }

  await prisma.authToken.update({
    data: {
      usedAt: new Date(),
    },
    where: {
      id: authToken.id,
    },
  });

  return {
    user: authToken.user,
    userId: authToken.userId,
  };
}

function createTokenDeliveryResponse(authToken: AuthTokenRecord | null): {
  readonly delivery: "EMAIL_ADAPTER_NOT_IMPLEMENTED" | "EMAIL_DISABLED";
  readonly devToken?: string;
  readonly expiresAt?: string;
  readonly ok: true;
} {
  const delivery =
    process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "disabled"
      ? "EMAIL_ADAPTER_NOT_IMPLEMENTED"
      : "EMAIL_DISABLED";

  return {
    delivery,
    devToken: shouldExposeDevAuthToken() ? authToken?.token : undefined,
    expiresAt: authToken?.expiresAt.toISOString(),
    ok: true,
  };
}

function shouldExposeDevAuthToken(): boolean {
  return (
    process.env.APP_ENV !== "production" &&
    process.env.NODE_ENV !== "production"
  );
}
