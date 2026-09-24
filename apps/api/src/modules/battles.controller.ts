import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from "@nestjs/common";
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
    private readonly battlesService: BattlesService,
  ) {}

  @Get("open")
  async open(@Req() request: CookieRequest) {
    const { user } = await this.authService.me(request);
    return this.battlesService.listOpen(user?.id);
  }

  @Post("join")
  async join(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "battle:vote");

    return this.battlesService.join(user, body);
  }

  @Post(":battleId/vote")
  async vote(
    @Req() request: CookieRequest,
    @Param("battleId") battleId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "battle:vote");

    return this.battlesService.vote(user, battleId, body, request);
  }

  @Delete(":battleId/participation")
  async withdraw(
    @Req() request: CookieRequest,
    @Param("battleId") battleId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.battlesService.withdraw(user, battleId);
  }
}
