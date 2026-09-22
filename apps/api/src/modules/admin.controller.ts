import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AdminService } from "./admin.service.js";
import { AuthService } from "./auth.service.js";
import { requirePermission } from "./authorization.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {}

  @Get("overview")
  async overview(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.overview();
  }

  @Get("users")
  async users(@Req() request: CookieRequest, @Query() query: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.users(query);
  }

  @Get("moderation")
  async moderationQueue(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.moderationQueue();
  }

  @Patch("reports/:reportId")
  async updateReport(
    @Req() request: CookieRequest,
    @Param("reportId") reportId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.updateReport(user, reportId, body);
  }

  @Patch("disputes/:disputeId")
  async updateDispute(
    @Req() request: CookieRequest,
    @Param("disputeId") disputeId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.updateDispute(user, disputeId, body);
  }

  @Patch("photos/:photoId/moderation")
  async moderatePhoto(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "photo:manage_any");
    return this.adminService.moderatePhoto(user, photoId, body);
  }

  @Get("audit-logs")
  async auditLogs(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.auditLogs();
  }

  @Get("payments")
  async payments(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.paymentHistory();
  }

  @Post("wallets/:userId/adjust")
  async adjustWallet(
    @Req() request: CookieRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.adjustWallet(user, userId, body);
  }

  @Patch("users/:userId")
  async updateUser(
    @Req() request: CookieRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.updateUser(user, userId, body);
  }

  @Patch("ratings/:ratingId")
  async updateRating(
    @Req() request: CookieRequest,
    @Param("ratingId") ratingId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.updateRating(user, ratingId, body);
  }

  @Patch("promotions/:promotionId")
  async updatePromotion(
    @Req() request: CookieRequest,
    @Param("promotionId") promotionId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.updatePromotion(user, promotionId, body);
  }

  @Delete("photos/:photoId")
  async deletePhoto(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "photo:manage_any");
    return this.adminService.deletePhoto(user, photoId, body);
  }

  @Delete("users/:userId")
  async deleteUser(
    @Req() request: CookieRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.deleteUser(user, userId, body);
  }
}
