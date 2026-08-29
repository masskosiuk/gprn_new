import { loadRuntimeEnv } from "@gprn/config";
import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("feature-flags")
@Controller("feature-flags")
export class FeatureFlagsController {
  @Get()
  listFeatureFlags(): Record<string, boolean> {
    const env = loadRuntimeEnv();

    return {
      ADVANCED_PROVENANCE_ENABLED: env.ADVANCED_PROVENANCE_ENABLED,
      AI_ENABLED: env.AI_ENABLED,
      EXPERT_REVIEWS_ENABLED: env.EXPERT_REVIEWS_ENABLED,
      MARKETPLACE_ENABLED: env.MARKETPLACE_ENABLED,
      PAYMENTS_ENABLED: env.PAYMENTS_ENABLED
    };
  }
}

