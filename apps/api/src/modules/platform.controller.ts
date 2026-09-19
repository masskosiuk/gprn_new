import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { PlatformService } from "./platform.service.js";

@ApiTags("platform")
@Controller("platform")
export class PlatformController {
  constructor(
    private readonly authService: AuthService,
    private readonly platformService: PlatformService,
  ) {}

  @Get("dashboard")
  async dashboard(@Req() request: CookieRequest) {
    return this.platformService.dashboard(
      await this.authService.requireUserFromRequest(request),
    );
  }

  @Post("wallet/top-up")
  async topUp(@Req() request: CookieRequest, @Body() body: unknown) {
    return this.platformService.topUp(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Post("service-requests")
  async createServiceRequest(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.platformService.createServiceRequest(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Patch("service-requests/:requestId")
  async updateServiceRequest(
    @Req() request: CookieRequest,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    return this.platformService.updateServiceRequest(
      await this.authService.requireUserFromRequest(request),
      requestId,
      body,
    );
  }

  @Post("service-requests/:requestId/messages")
  async addServiceMessage(
    @Req() request: CookieRequest,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    return this.platformService.addServiceMessage(
      await this.authService.requireUserFromRequest(request),
      requestId,
      body,
    );
  }

  @Post("service-requests/:requestId/rating")
  async rateService(
    @Req() request: CookieRequest,
    @Param("requestId") requestId: string,
    @Body() body: unknown,
  ) {
    return this.platformService.rateService(
      await this.authService.requireUserFromRequest(request),
      requestId,
      body,
    );
  }

  @Post("donations")
  async donate(@Req() request: CookieRequest, @Body() body: unknown) {
    return this.platformService.donate(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Get("marketplace")
  marketplace() {
    return this.platformService.listMarketplace();
  }

  @Get("review-providers")
  reviewProviders() {
    return this.platformService.listReviewProviders();
  }

  @Post("marketplace/listings")
  async createMarketplaceListing(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.platformService.createMarketplaceListing(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Patch("marketplace/listings/:productId")
  async updateMarketplaceListing(
    @Req() request: CookieRequest,
    @Param("productId") productId: string,
    @Body() body: unknown,
  ) {
    return this.platformService.updateMarketplaceListing(
      await this.authService.requireUserFromRequest(request),
      productId,
      body,
    );
  }

  @Post("marketplace/products/:productId/buy")
  async buyMarketplaceProduct(
    @Req() request: CookieRequest,
    @Param("productId") productId: string,
  ) {
    return this.platformService.buyMarketplaceProduct(
      await this.authService.requireUserFromRequest(request),
      productId,
    );
  }

  @Post("promotions")
  async createPromotion(@Req() request: CookieRequest, @Body() body: unknown) {
    return this.platformService.createPromotion(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Get("promotions")
  listPromotions(@Query("placement") placement?: string) {
    return this.platformService.listPromotions(placement);
  }

  @Get("profiles/:username/moodboards")
  publicMoodboards(@Param("username") username: string) {
    return this.platformService.publicMoodboards(username);
  }

  @Patch("paid-review-settings")
  async updatePaidReviewSettings(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.platformService.updatePaidReviewSettings(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Post("paid-reviews")
  async requestPaidReview(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.platformService.requestPaidReview(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Post("photos/:photoId/:action")
  async togglePhotoAction(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Param("action") action: string,
  ) {
    if (action !== "like" && action !== "bookmark" && action !== "moodboard") {
      return { code: "ACTION_NOT_SUPPORTED", ok: false };
    }
    return this.platformService.togglePhotoAction(
      await this.authService.requireUserFromRequest(request),
      photoId,
      action,
    );
  }

  @Post("photos/:photoId/review")
  async reviewPhoto(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    return this.platformService.reviewPhoto(
      await this.authService.requireUserFromRequest(request),
      photoId,
      body,
    );
  }
}
