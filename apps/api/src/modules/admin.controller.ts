import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
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
    private readonly authService: AuthService
  ) {}

  @Get("overview")
  async overview(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "user:admin");
    return this.adminService.overview();
  }

  @Get("moderation")
  async moderationQueue(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.moderationQueue();
  }

  @Patch("reports/:reportId")
  async updateReport(@Req() request: CookieRequest, @Param("reportId") reportId: string, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.updateReport(user, reportId, body);
  }

  @Patch("disputes/:disputeId")
  async updateDispute(@Req() request: CookieRequest, @Param("disputeId") disputeId: string, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:moderate");
    return this.adminService.updateDispute(user, disputeId, body);
  }

  @Patch("photos/:photoId/moderation")
  async moderatePhoto(@Req() request: CookieRequest, @Param("photoId") photoId: string, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "photo:manage_any");
    return this.adminService.moderatePhoto(user, photoId, body);
  }
}
