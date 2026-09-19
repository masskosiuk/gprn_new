import { Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { PrivacyService } from "./privacy.service.js";

@ApiTags("privacy")
@Controller("privacy")
export class PrivacyController {
  constructor(
    private readonly authService: AuthService,
    private readonly privacyService: PrivacyService
  ) {}

  @Get("export")
  async exportMine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.privacyService.exportMine(user);
  }

  @Post("account-deletion")
  async requestDeletion(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.privacyService.requestDeletion(user);
  }

  @Get("connections")
  async listConnections(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.privacyService.listConnections(user);
  }

  @Delete("connections/:connectionId")
  async disconnect(@Req() request: CookieRequest, @Param("connectionId") connectionId: string) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.privacyService.disconnect(user, connectionId);
  }
}
