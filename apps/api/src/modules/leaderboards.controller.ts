import { Controller, Get, Header } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { LeaderboardsService } from "./leaderboards.service.js";

@ApiTags("leaderboards")
@Controller("leaderboards")
export class LeaderboardsController {
  constructor(private readonly leaderboardsService: LeaderboardsService) {}

  @Get("global")
  @Header("Cache-Control", "no-store")
  global() {
    return this.leaderboardsService.global();
  }
}
