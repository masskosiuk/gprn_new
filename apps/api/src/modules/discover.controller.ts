import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { DiscoverService } from "./discover.service.js";

@ApiTags("discover")
@Controller("discover")
export class DiscoverController {
  constructor(private readonly discoverService: DiscoverService) {}

  @Get()
  overview(
    @Query("mediaType") mediaType?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.discoverService.getOverview(mediaType, query);
  }
}
