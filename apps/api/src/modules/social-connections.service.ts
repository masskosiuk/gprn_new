import { loadRuntimeEnv, type RuntimeEnv } from "@gprn/config";
import { prisma, type Prisma } from "@gprn/db";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { CurrentUser } from "./auth.service.js";
import { isPrismaErrorCode } from "./serialization.js";

export type SocialProviderId = "facebook" | "instagram";

type ProviderStatus = "AVAILABLE" | "NEEDS_CONFIGURATION" | "NOT_SUPPORTED";

interface OAuthState {
  readonly expiresAt: number;
  readonly nonce: string;
  readonly provider: SocialProviderId;
  readonly returnTo: string;
  readonly userId: string;
}

interface OAuthToken {
  readonly accessToken: string;
  readonly expiresAt?: Date;
  readonly refreshToken?: string;
  readonly scopes: readonly string[];
}

interface SocialProfile {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly profileUrl: string;
  readonly providerAccountId: string;
  readonly username: string;
}

const providerDefinitions: readonly {
  readonly id: "adobe" | "artstation" | "behance" | SocialProviderId;
  readonly reason: "ADOBE_PROFILE_UNAVAILABLE" | "OFFICIAL_API_UNAVAILABLE" | "PROFESSIONAL_ACCOUNT_REQUIRED" | null;
}[] = [
  { id: "instagram", reason: "PROFESSIONAL_ACCOUNT_REQUIRED" },
  { id: "facebook", reason: null },
  { id: "artstation", reason: "OFFICIAL_API_UNAVAILABLE" },
  { id: "adobe", reason: "ADOBE_PROFILE_UNAVAILABLE" },
  { id: "behance", reason: "OFFICIAL_API_UNAVAILABLE" }
];

const connectionType = "SOCIAL_PROFILE";
const stateTtlMs = 10 * 60 * 1000;

@Injectable()
export class SocialConnectionsService {
  private readonly env = loadRuntimeEnv();

  getProviders() {
    return {
      providers: providerDefinitions.map((provider) => ({
        id: provider.id,
        reason: provider.reason,
        status: this.getProviderStatus(provider.id)
      }))
    };
  }

  async listMine(user: CurrentUser) {
    const [connections, profile] = await Promise.all([
      prisma.externalConnection.findMany({
        select: { createdAt: true, id: true, provider: true },
        where: { connectionType, disconnectedAt: null, userId: user.id }
      }),
      prisma.profile.findUnique({ select: { socialLinks: true }, where: { userId: user.id } })
    ]);
    const socialLinks = asJsonRecord(profile?.socialLinks);

    return {
      providers: providerDefinitions.map((provider) => {
        const connection = connections.find((candidate) => candidate.provider === provider.id);
        const socialLink = asJsonRecord(socialLinks[provider.id]);

        return {
          connectedAt: connection?.createdAt.toISOString() ?? null,
          connectionId: connection?.id ?? null,
          id: provider.id,
          profile: connection
            ? {
                avatarUrl: readString(socialLink.avatarUrl),
                displayName: readString(socialLink.displayName),
                url: readString(socialLink.url),
                username: readString(socialLink.username)
              }
            : null,
          reason: provider.reason,
          status: this.getProviderStatus(provider.id)
        };
      })
    };
  }

  createAuthorizationUrl(user: CurrentUser, provider: SocialProviderId, returnTo: string | undefined): string {
    const config = this.requireProviderConfig(provider);
    const callbackUrl = this.getCallbackUrl(provider);
    const state = this.signState({
      expiresAt: Date.now() + stateTtlMs,
      nonce: randomBytes(16).toString("base64url"),
      provider,
      returnTo: normalizeReturnTo(returnTo),
      userId: user.id
    });

    if (provider === "facebook") {
      const url = new URL(`https://www.facebook.com/${this.env.META_GRAPH_API_VERSION}/dialog/oauth`);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: "public_profile",
        state
      }).toString();
      return url.toString();
    }

    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      response_type: "code",
      scope: "instagram_business_basic",
      state
    }).toString();
    return url.toString();
  }

  createCancelledUrl(provider: SocialProviderId): string {
    return createReturnUrl(this.env.APP_URL, "/ru/profile", { provider, social: "cancelled" });
  }

  async completeConnection(
    user: CurrentUser,
    provider: SocialProviderId,
    code: string,
    signedState: string
  ): Promise<string> {
    const state = this.verifyState(signedState);
    if (state.provider !== provider || state.userId !== user.id) {
      throw new BadRequestException({ code: "SOCIAL_OAUTH_STATE_INVALID", message: "OAuth state does not match." });
    }

    try {
      const token = await this.exchangeCode(provider, code);
      const socialProfile = await this.fetchSocialProfile(provider, token.accessToken);
      await this.saveConnection(user, provider, token, socialProfile);
      return createReturnUrl(this.env.APP_URL, state.returnTo, { provider, social: "connected" });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      return createReturnUrl(this.env.APP_URL, state.returnTo, { provider, social: "failed" });
    }
  }

  async disconnect(user: CurrentUser, provider: SocialProviderId) {
    const profile = await prisma.profile.findUnique({ select: { socialLinks: true }, where: { userId: user.id } });
    const socialLinks = asJsonRecord(profile?.socialLinks);
    delete socialLinks[provider];

    const [connection] = await prisma.$transaction([
      prisma.externalConnection.updateMany({
        data: {
          disconnectedAt: new Date(),
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          tokenExpiresAt: null
        },
        where: { connectionType, disconnectedAt: null, provider, userId: user.id }
      }),
      prisma.profile.update({ data: { socialLinks: socialLinks as Prisma.InputJsonObject }, where: { userId: user.id } })
    ]);

    return { disconnected: connection.count > 0, provider };
  }

  private getProviderStatus(provider: string): ProviderStatus {
    if (provider !== "facebook" && provider !== "instagram") return "NOT_SUPPORTED";
    const config = this.getProviderConfig(provider);
    return config ? "AVAILABLE" : "NEEDS_CONFIGURATION";
  }

  private getProviderConfig(provider: SocialProviderId): { clientId: string; clientSecret: string } | null {
    const clientId = provider === "facebook" ? this.env.FACEBOOK_CLIENT_ID : this.env.INSTAGRAM_CLIENT_ID;
    const clientSecret =
      provider === "facebook" ? this.env.FACEBOOK_CLIENT_SECRET : this.env.INSTAGRAM_CLIENT_SECRET;
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }

  private requireProviderConfig(provider: SocialProviderId): { clientId: string; clientSecret: string } {
    const config = this.getProviderConfig(provider);
    if (!config) {
      throw new ServiceUnavailableException({
        code: "SOCIAL_PROVIDER_NOT_CONFIGURED",
        message: `${provider} OAuth credentials are not configured.`
      });
    }
    return config;
  }

  private getCallbackUrl(provider: SocialProviderId): string {
    return `${this.env.API_URL.replace(/\/$/, "")}/api/v1/social-connections/${provider}/callback`;
  }

  private signState(state: OAuthState): string {
    const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
    const signature = createHmac("sha256", this.env.SESSION_SECRET).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private verifyState(signedState: string): OAuthState {
    const [payload, signature] = signedState.split(".");
    if (!payload || !signature) throw invalidState();

    const expected = createHmac("sha256", this.env.SESSION_SECRET).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalidState();

    try {
      const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
      if (
        !state.userId ||
        !state.nonce ||
        !isSocialProvider(state.provider) ||
        !Number.isFinite(state.expiresAt) ||
        state.expiresAt < Date.now()
      ) {
        throw invalidState();
      }
      return state;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw invalidState();
    }
  }

  private async exchangeCode(provider: SocialProviderId, code: string): Promise<OAuthToken> {
    const config = this.requireProviderConfig(provider);
    const callbackUrl = this.getCallbackUrl(provider);

    if (provider === "facebook") {
      const tokenUrl = new URL(`https://graph.facebook.com/${this.env.META_GRAPH_API_VERSION}/oauth/access_token`);
      tokenUrl.search = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: callbackUrl
      }).toString();
      const response = await fetchJson(tokenUrl, { method: "GET" });
      const accessToken = requireResponseString(response, "access_token");
      const expiresIn = readNumber(response.expires_in);
      return {
        accessToken,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        scopes: ["public_profile"]
      };
    }

    const form = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl
    });
    const shortTokenResponse = await fetchJson(new URL("https://api.instagram.com/oauth/access_token"), {
      body: form,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });
    const shortAccessToken = requireResponseString(shortTokenResponse, "access_token");

    const longTokenUrl = new URL(
      `https://graph.instagram.com/${this.env.META_GRAPH_API_VERSION}/access_token`
    );
    longTokenUrl.search = new URLSearchParams({
      access_token: shortAccessToken,
      client_secret: config.clientSecret,
      grant_type: "ig_exchange_token"
    }).toString();

    try {
      const longTokenResponse = await fetchJson(longTokenUrl, { method: "GET" });
      const expiresIn = readNumber(longTokenResponse.expires_in);
      return {
        accessToken: requireResponseString(longTokenResponse, "access_token"),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
        scopes: ["instagram_business_basic"]
      };
    } catch {
      return { accessToken: shortAccessToken, scopes: ["instagram_business_basic"] };
    }
  }

  private async fetchSocialProfile(provider: SocialProviderId, accessToken: string): Promise<SocialProfile> {
    if (provider === "facebook") {
      const url = new URL(`https://graph.facebook.com/${this.env.META_GRAPH_API_VERSION}/me`);
      url.search = new URLSearchParams({ access_token: accessToken, fields: "id,name,picture.type(large)" }).toString();
      const response = await fetchJson(url, { method: "GET" });
      const id = requireResponseString(response, "id");
      const picture = asJsonRecord(asJsonRecord(response.picture).data);
      return {
        avatarUrl: readString(picture.url),
        displayName: requireResponseString(response, "name"),
        profileUrl: `https://www.facebook.com/profile.php?id=${encodeURIComponent(id)}`,
        providerAccountId: id,
        username: id
      };
    }

    const url = new URL(`https://graph.instagram.com/${this.env.META_GRAPH_API_VERSION}/me`);
    url.search = new URLSearchParams({
      access_token: accessToken,
      fields: "user_id,username,account_type,profile_picture_url"
    }).toString();
    const response = await fetchJson(url, { method: "GET" });
    const username = requireResponseString(response, "username");
    return {
      avatarUrl: readString(response.profile_picture_url),
      displayName: username,
      profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`,
      providerAccountId: readString(response.user_id) ?? requireResponseString(response, "id"),
      username
    };
  }

  private async saveConnection(
    user: CurrentUser,
    provider: SocialProviderId,
    token: OAuthToken,
    socialProfile: SocialProfile
  ): Promise<void> {
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    const socialLinks = asJsonRecord(profile.socialLinks);
    socialLinks[provider] = {
      avatarUrl: socialProfile.avatarUrl,
      displayName: socialProfile.displayName,
      url: socialProfile.profileUrl,
      username: socialProfile.username
    };

    try {
      await prisma.$transaction([
        prisma.externalConnection.upsert({
          create: {
            connectionType,
            encryptedAccessToken: encryptToken(token.accessToken, this.env),
            encryptedRefreshToken: token.refreshToken ? encryptToken(token.refreshToken, this.env) : null,
            provider,
            providerAccountId: socialProfile.providerAccountId,
            scopes: [...token.scopes],
            tokenExpiresAt: token.expiresAt,
            userId: user.id
          },
          update: {
            disconnectedAt: null,
            encryptedAccessToken: encryptToken(token.accessToken, this.env),
            encryptedRefreshToken: token.refreshToken ? encryptToken(token.refreshToken, this.env) : null,
            providerAccountId: socialProfile.providerAccountId,
            scopes: [...token.scopes],
            tokenExpiresAt: token.expiresAt
          },
          where: { userId_provider_connectionType: { connectionType, provider, userId: user.id } }
        }),
        prisma.profile.update({
          data: { socialLinks: socialLinks as Prisma.InputJsonObject },
          where: { userId: user.id }
        })
      ]);
    } catch (error) {
      if (isPrismaErrorCode(error, "P2002")) {
        throw new ConflictException({
          code: "SOCIAL_ACCOUNT_ALREADY_CONNECTED",
          message: "This social account is already connected to another user."
        });
      }
      throw error;
    }
  }
}

export function parseSocialProvider(value: string): SocialProviderId {
  if (!isSocialProvider(value)) {
    throw new BadRequestException({ code: "SOCIAL_PROVIDER_INVALID", message: "Social provider is not supported." });
  }
  return value;
}

function isSocialProvider(value: string): value is SocialProviderId {
  return value === "facebook" || value === "instagram";
}

function normalizeReturnTo(value: string | undefined): string {
  if (value && /^\/[a-z]{2}\/profile$/.test(value)) return value;
  return "/ru/profile";
}

function createReturnUrl(appUrl: string, returnTo: string, parameters: Record<string, string>): string {
  const url = new URL(returnTo, `${appUrl.replace(/\/$/, "")}/`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

function invalidState(): BadRequestException {
  return new BadRequestException({ code: "SOCIAL_OAUTH_STATE_INVALID", message: "OAuth state is invalid or expired." });
}

function encryptToken(value: string, env: RuntimeEnv): string {
  const key = createHash("sha256").update(env.ENCRYPTION_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

async function fetchJson(url: URL, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    throw new ServiceUnavailableException({
      code: "SOCIAL_PROVIDER_REQUEST_FAILED",
      message: "The social provider rejected the request.",
      providerStatus: response.status
    });
  }
  return asJsonRecord(body);
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function requireResponseString(record: Record<string, unknown>, key: string): string {
  const value = readString(record[key]);
  if (!value) {
    throw new ServiceUnavailableException({
      code: "SOCIAL_PROVIDER_RESPONSE_INVALID",
      message: `The social provider response is missing ${key}.`
    });
  }
  return value;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
