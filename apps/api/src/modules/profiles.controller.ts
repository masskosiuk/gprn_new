import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import { requirePermission } from "./authorization.js";
import type { CookieRequest } from "./http.types.js";
import { ProfilesService } from "./profiles.service.js";

@ApiTags("profiles")
@Controller("profiles")
export class ProfilesController {
  constructor(
    private readonly authService: AuthService,
    private readonly profilesService: ProfilesService
  ) {}

  @Get("me")
  async mine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.profilesService.getMine(user);
  }

  @Patch("me")
  async updateMine(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "profile:manage_own");
    return this.profilesService.updateMine(user, body);
  }

  @Get(":username")
  getPublic(@Param("username") username: string) {
    return this.profilesService.getPublic(username.toLowerCase());
  }
}
