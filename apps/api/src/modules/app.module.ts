import { Module } from "@nestjs/common";

import { FeatureFlagsController } from "./feature-flags.controller.js";
import { HealthController } from "./health.controller.js";

@Module({
  controllers: [FeatureFlagsController, HealthController]
})
export class AppModule {}

