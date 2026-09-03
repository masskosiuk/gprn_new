import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("future")
@Controller()
export class FutureController {
  @Get("marketplace")
  marketplace() {
    return {
      checkoutStatus: "DISABLED",
      feature: "MARKETPLACE",
      status: "COMING_SOON"
    };
  }

  @Get("experts")
  experts() {
    return {
      feature: "EXPERT_REVIEWS",
      ordersStatus: "DISABLED",
      status: "COMING_SOON"
    };
  }

  @Get("ai/photo-analysis")
  aiPhotoAnalysis() {
    return {
      feature: "AI_PHOTO_ANALYSIS",
      status: "COMING_SOON"
    };
  }
}

