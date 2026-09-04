import { Body, Controller, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AnalyticsService } from "./analytics.service.js";
import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly authService: AuthService
  ) {}

  @Post("events")
  async track(@Req() request: CookieRequest, @Body() body: unknown) {
    const { user } = await this.authService.me(request);
    return this.analyticsService.track(user, body);
  }
}
