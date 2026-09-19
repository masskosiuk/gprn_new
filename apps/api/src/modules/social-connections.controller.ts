import { Controller, Delete, Get, Param, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieReply, CookieRequest } from "./http.types.js";
import { parseSocialProvider, SocialConnectionsService } from "./social-connections.service.js";

interface RedirectReply extends CookieReply {
  redirect(url: string): RedirectReply;
}

@ApiTags("social-connections")
@Controller("social-connections")
export class SocialConnectionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly socialConnectionsService: SocialConnectionsService
  ) {}

  @Get("providers")
  providers() {
    return this.socialConnectionsService.getProviders();
  }

  @Get()
  async mine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.socialConnectionsService.listMine(user);
  }

  @Get(":provider/start")
  async start(
    @Req() request: CookieRequest,
    @Res() reply: RedirectReply,
    @Param("provider") providerValue: string,
    @Query("returnTo") returnTo?: string
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    const provider = parseSocialProvider(providerValue);
    return reply.redirect(this.socialConnectionsService.createAuthorizationUrl(user, provider, returnTo));
  }

  @Get(":provider/callback")
  async callback(
    @Req() request: CookieRequest,
    @Res() reply: RedirectReply,
    @Param("provider") providerValue: string,
    @Query("code") code?: string,
    @Query("state") state?: string
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    const provider = parseSocialProvider(providerValue);
    if (!code || !state) {
      return reply.redirect(this.socialConnectionsService.createCancelledUrl(provider));
    }
    const destination = await this.socialConnectionsService.completeConnection(user, provider, code, state);
    return reply.redirect(destination);
  }

  @Delete(":provider")
  async disconnect(@Req() request: CookieRequest, @Param("provider") providerValue: string) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.socialConnectionsService.disconnect(user, parseSocialProvider(providerValue));
  }
}
