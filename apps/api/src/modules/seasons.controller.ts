import { Controller, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import { ChallengesService } from "./challenges.service.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("seasons")
@Controller("seasons")
export class SeasonsController {
  constructor(
    private readonly authService: AuthService,
    private readonly challengesService: ChallengesService
  ) {}

  @Post("current/join")
  async joinCurrent(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.challengesService.joinCurrentSeason(user);
  }
}
