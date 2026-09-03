import { prisma } from "@gprn/db";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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
  async register(
    body: unknown,
    request: CookieRequest,
    reply: CookieReply
  ): Promise<{ user: CurrentUser }> {
    const input = parseRegisterInput(body);
    consumeAuthAttempt(createAuthRateKey("register", request), registerAttemptLimit);
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
                username: await this.createUniqueUsername(input.username ?? input.displayName)
              }
            }
          }
        });

        const userRole = await tx.role.upsert({
          create: {
            key: "USER"
          },
          update: {},
          where: {
            key: "USER"
          }
        });

        await tx.userRole.create({
          data: {
            roleId: userRole.id,
            userId: createdUser.id
          }
        });

        await tx.rating.create({
          data: {
            rating: 1500,
            scope: "GLOBAL",
            scopeKey: "global",
            userId: createdUser.id
          }
        });

        const activeSeason = await tx.season.findFirst({
          orderBy: {
            startsAt: "asc"
          },
          where: {
            status: "ACTIVE"
          }
        });

        if (activeSeason) {
          await tx.seasonParticipant.upsert({
            create: {
              seasonId: activeSeason.id,
              userId: createdUser.id
            },
            update: {},
            where: {
              seasonId_userId: {
                seasonId: activeSeason.id,
                userId: createdUser.id
              }
            }
          });
        }

        await tx.analyticsEvent.createMany({
          data: [
            {
              eventName: "user_registered",
              userId: createdUser.id
            },
            {
              eventName: "profile_created",
              userId: createdUser.id
            }
          ]
        });

        return tx.user.findUniqueOrThrow({
          include: userInclude,
          where: {
            id: createdUser.id
          }
        });
      });

      await this.createSessionCookie(user.id, reply);

      return {
        user: serializeUser(user)
      };
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "AUTH_EMAIL_OR_USERNAME_EXISTS",
          message: "Email or username is already registered."
        });
      }

      throw error;
    }
  }

  async login(
    body: unknown,
    request: CookieRequest,
    reply: CookieReply
  ): Promise<{ user: CurrentUser }> {
    const input = parseLoginInput(body);
    const rateKey = createAuthRateKey("login", request, input.email);

    assertAuthRateLimit(rateKey, loginFailureLimit);

    const user = await prisma.user.findUnique({
      include: userInclude,
      where: {
        email: input.email
      }
    });

    if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
      recordAuthAttempt(rateKey);

      throw new UnauthorizedException({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid email or password."
      });
    }

    if (user.status !== "ACTIVE") {
      throw new UnauthorizedException({
        code: "AUTH_USER_NOT_ACTIVE",
        message: "This account is not active."
      });
    }

    clearAuthRateLimit(rateKey);
    await this.createSessionCookie(user.id, reply);

    return {
      user: serializeUser(user)
    };
  }

  async requestEmailVerification(request: CookieRequest): Promise<{
    delivery: "ALREADY_VERIFIED" | "EMAIL_ADAPTER_NOT_IMPLEMENTED" | "EMAIL_DISABLED";
    devToken?: string;
    expiresAt?: string;
    ok: true;
  }> {
    const user = await this.requireUserFromRequest(request);

    if (user.emailVerified) {
      return {
        delivery: "ALREADY_VERIFIED",
        ok: true
      };
    }

    const authToken = await createAuthToken(user.id, "EMAIL_VERIFICATION", emailVerificationTtlSeconds);

    return createTokenDeliveryResponse(authToken);
  }

  async verifyEmail(body: unknown): Promise<{ user: CurrentUser }> {
    const token = requiredString(asRecord(body), "token");
    const authToken = await consumeAuthToken("EMAIL_VERIFICATION", token);

    const user = await prisma.user.update({
      data: {
        emailVerifiedAt: authToken.user.emailVerifiedAt ?? new Date()
      },
      include: userInclude,
      where: {
        id: authToken.userId
      }
    });

    await prisma.analyticsEvent.create({
      data: {
        eventName: "email_verified",
        userId: user.id
      }
    });

    return {
      user: serializeUser(user)
    };
  }

  async requestPasswordReset(
    body: unknown,
    request: CookieRequest
  ): Promise<{
    delivery: "EMAIL_ADAPTER_NOT_IMPLEMENTED" | "EMAIL_DISABLED";
    devToken?: string;
    expiresAt?: string;
    ok: true;
  }> {
    const email = normalizeEmail(requiredString(asRecord(body), "email"));
    consumeAuthAttempt(createAuthRateKey("password-reset", request, email), passwordResetAttemptLimit);

    const user = await prisma.user.findUnique({
      select: {
        id: true,
        status: true
      },
      where: {
        email
      }
    });

    if (!user || user.status !== "ACTIVE") {
      return createTokenDeliveryResponse(null);
    }

    const authToken = await createAuthToken(user.id, "PASSWORD_RESET", passwordResetTtlSeconds);

    return createTokenDeliveryResponse(authToken);
  }

  async resetPassword(body: unknown): Promise<{ ok: true }> {
    const record = asRecord(body);
    const password = requiredString(record, "password");
    const token = requiredString(record, "token");

    if (password.length < 8) {
      throw new BadRequestException({
        code: "AUTH_WEAK_PASSWORD",
        message: "Password must contain at least 8 characters."
      });
    }

    const authToken = await consumeAuthToken("PASSWORD_RESET", token);
    const passwordHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.user.update({
        data: {
          passwordHash
        },
        where: {
          id: authToken.userId
        }
      }),
      prisma.session.updateMany({
        data: {
          revokedAt: new Date()
        },
        where: {
          userId: authToken.userId,
          revokedAt: null
        }
      }),
      prisma.analyticsEvent.create({
        data: {
          eventName: "password_reset_completed",
          userId: authToken.userId
        }
      })
    ]);

    return {
      ok: true
    };
  }

  async logout(request: CookieRequest, reply: CookieReply): Promise<{ ok: true }> {
    const token = request.cookies?.[sessionCookieName];

    if (token) {
      await prisma.session.updateMany({
        data: {
          revokedAt: new Date()
        },
        where: {
          tokenHash: hashOpaqueToken(token),
          revokedAt: null
        }
      });
    }

    reply.clearCookie(sessionCookieName, cookieOptions());

    return {
      ok: true
    };
  }

  async me(request: CookieRequest): Promise<{ user: CurrentUser | null }> {
    const user = await this.getUserFromRequest(request);

    return {
      user
    };
  }

  async requireUserFromRequest(request: CookieRequest): Promise<CurrentUser> {
    const user = await this.getUserFromRequest(request);

    if (!user) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "Authentication is required."
      });
    }

    return user;
  }

  getAuthProviders(): {
    providers: readonly {
      readonly id: string;
      readonly label: string;
      readonly status: "AVAILABLE" | "COMING_SOON";
    }[];
  } {
    return {
      providers: [
        {
          id: "email",
          label: "Email",
          status: "AVAILABLE"
        },
        {
          id: "google",
          label: "Google",
          status: "COMING_SOON"
        },
        {
          id: "apple",
          label: "Apple",
          status: "COMING_SOON"
        }
      ]
    };
  }

  private async getUserFromRequest(request: CookieRequest): Promise<CurrentUser | null> {
    const token = request.cookies?.[sessionCookieName];

    if (!token) {
      return null;
    }

    const session = await prisma.session.findFirst({
      include: {
        user: {
          include: userInclude
        }
      },
      where: {
        expiresAt: {
          gt: new Date()
        },
        revokedAt: null,
        tokenHash: hashOpaqueToken(token)
      }
    });

    if (!session || session.user.status !== "ACTIVE") {
      return null;
    }

    await prisma.session.update({
      data: {
        lastSeenAt: new Date()
      },
      where: {
        id: session.id
      }
    });

    return serializeUser(session.user);
  }

  private async createSessionCookie(userId: string, reply: CookieReply): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();

    await prisma.session.create({
      data: {
        expiresAt: new Date(now + sessionTtlSeconds * 1000),
        tokenHash: hashOpaqueToken(token),
        userId
      }
    });

    reply.setCookie(sessionCookieName, token, {
      ...cookieOptions(),
      maxAge: sessionTtlSeconds
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
      role: true
    }
  }
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
      message: "Email is invalid."
    });
  }

  if (password.length < 8) {
    throw new BadRequestException({
      code: "AUTH_WEAK_PASSWORD",
      message: "Password must contain at least 8 characters."
    });
  }

  if (displayName.length < 2) {
    throw new BadRequestException({
      code: "PROFILE_INVALID_DISPLAY_NAME",
      message: "Display name must contain at least 2 characters."
    });
  }

  return {
    displayName,
    email,
    password,
    username
  };
}

function parseLoginInput(body: unknown): LoginInput {
  const record = asRecord(body);

  return {
    email: normalizeEmail(requiredString(record, "email")),
    password: requiredString(record, "password")
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
          websiteUrl: user.profile.websiteUrl
        }
      : null,
    ratings:
      user.ratings?.map((rating) => ({
        battles: rating.battles,
        losses: rating.losses,
        rating: rating.rating,
        scope: rating.scope,
        scopeKey: rating.scopeKey,
        wins: rating.wins
      })) ?? [],
    roles: user.roles.map(({ role }) => role.key),
    status: user.status
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
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
    secure: process.env.NODE_ENV === "production"
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
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
      },
      HttpStatus.TOO_MANY_REQUESTS
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
      resetAt: now + authRateLimitWindowMs
    });
    return;
  }

  bucket.count += 1;
}

function clearAuthRateLimit(key: string): void {
  authRateBuckets.delete(key);
}

function createAuthRateKey(action: string, request: CookieRequest, subject = "global"): string {
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
  ttlSeconds: number
): Promise<AuthTokenRecord> {
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await prisma.$transaction([
    prisma.authToken.updateMany({
      data: {
        revokedAt: now
      },
      where: {
        expiresAt: {
          gt: now
        },
        purpose,
        revokedAt: null,
        usedAt: null,
        userId
      }
    }),
    prisma.authToken.create({
      data: {
        expiresAt,
        purpose,
        tokenHash: hashOpaqueToken(token),
        userId
      }
    })
  ]);

  return {
    expiresAt,
    token
  };
}

async function consumeAuthToken(
  purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET",
  token: string
): Promise<{
  readonly user: UserRecord;
  readonly userId: string;
}> {
  const authToken = await prisma.authToken.findUnique({
    include: {
      user: {
        include: userInclude
      }
    },
    where: {
      tokenHash: hashOpaqueToken(token)
    }
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
      message: "This authentication token is invalid or expired."
    });
  }

  await prisma.authToken.update({
    data: {
      usedAt: new Date()
    },
    where: {
      id: authToken.id
    }
  });

  return {
    user: authToken.user,
    userId: authToken.userId
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
    ok: true
  };
}

function shouldExposeDevAuthToken(): boolean {
  return process.env.APP_ENV !== "production" && process.env.NODE_ENV !== "production";
}
