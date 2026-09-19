import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { PlatformService } from "./platform.service.js";

@ApiTags("future")
@Controller()
export class FutureController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("marketplace")
  marketplace() {
    return this.platformService.listMarketplace();
  }

  @Get("experts")
  experts() {
    return this.platformService.listReviewProviders();
  }

  @Get("ai/photo-analysis")
  aiPhotoAnalysis() {
    return {
      feature: "AI_PHOTO_ANALYSIS",
      status: "COMING_SOON"
    };
  }
}
