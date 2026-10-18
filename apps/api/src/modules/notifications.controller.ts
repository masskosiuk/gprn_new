import { Controller, Get, Header, Param, Patch, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async listMine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.notificationsService.listMine(user);
  }

  @Patch("read-all")
  async markAllRead(@Req() request: CookieRequest) {
    return this.notificationsService.markAllRead(
      await this.authService.requireUserFromRequest(request),
    );
  }

  @Patch(":notificationId/read")
  async markRead(
    @Req() request: CookieRequest,
    @Param("notificationId") notificationId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.notificationsService.markRead(user, notificationId);
  }
}
