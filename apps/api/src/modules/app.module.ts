import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsService } from "./analytics.service.js";
import { BattlesController } from "./battles.controller.js";
import { BattlesService } from "./battles.service.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { ChallengesController } from "./challenges.controller.js";
import { ChallengesService } from "./challenges.service.js";
import { DiscoverController } from "./discover.controller.js";
import { DiscoverService } from "./discover.service.js";
import { FeatureFlagsController } from "./feature-flags.controller.js";
import { FutureController } from "./future.controller.js";
import { HealthController } from "./health.controller.js";
import { LeaderboardsController } from "./leaderboards.controller.js";
import { LeaderboardsService } from "./leaderboards.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { PhotosController } from "./photos.controller.js";
import { PhotosService } from "./photos.service.js";
import { PrivacyController } from "./privacy.controller.js";
import { PrivacyService } from "./privacy.service.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesService } from "./profiles.service.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";
import { SeasonsController } from "./seasons.controller.js";

@Module({
  controllers: [
    AdminController,
    AnalyticsController,
    AuthController,
    BattlesController,
    CatalogController,
    ChallengesController,
    DiscoverController,
    FeatureFlagsController,
    FutureController,
    HealthController,
    LeaderboardsController,
    NotificationsController,
    PhotosController,
    PrivacyController,
    ProfilesController,
    ReportsController,
    SeasonsController
  ],
  providers: [
    AdminService,
    AnalyticsService,
    AuthService,
    BattlesService,
    CatalogService,
    ChallengesService,
    DiscoverService,
    LeaderboardsService,
    NotificationsService,
    PhotosService,
    PrivacyService,
    ProfilesService,
    ReportsService
  ]
})
export class AppModule {}
