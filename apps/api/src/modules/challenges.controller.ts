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
import { ChallengesService } from "./challenges.service.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("challenges")
@Controller("challenges")
export class ChallengesController {
  constructor(
    private readonly authService: AuthService,
    private readonly challengesService: ChallengesService,
  ) {}

  @Get()
  list() {
    return this.challengesService.list();
  }

  @Get("mine")
  async mine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.challengesService.mine(user);
  }

  @Post(":challengeId/submit")
  async submit(
    @Req() request: CookieRequest,
    @Param("challengeId") challengeId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.challengesService.submit(user, challengeId, body);
  }

  @Delete(":challengeId/submission")
  async withdraw(
    @Req() request: CookieRequest,
    @Param("challengeId") challengeId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.challengesService.withdraw(user, challengeId);
  }
}
