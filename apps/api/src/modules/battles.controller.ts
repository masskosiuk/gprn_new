import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import { requirePermission } from "./authorization.js";
import { BattlesService } from "./battles.service.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("battles")
@Controller("battles")
export class BattlesController {
  constructor(
    private readonly authService: AuthService,
    private readonly battlesService: BattlesService
  ) {}

  @Get("open")
  open() {
    return this.battlesService.listOpen();
  }

  @Post("join")
  async join(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "battle:vote");

    return this.battlesService.join(user, body);
  }

  @Post(":battleId/vote")
  async vote(@Req() request: CookieRequest, @Param("battleId") battleId: string, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "battle:vote");

    return this.battlesService.vote(user, battleId, body, request);
  }
}
