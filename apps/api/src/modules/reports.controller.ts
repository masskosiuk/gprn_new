import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import { requirePermission } from "./authorization.js";
import type { CookieRequest } from "./http.types.js";
import { ReportsService } from "./reports.service.js";

@ApiTags("reports")
@Controller("reports")
export class ReportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly reportsService: ReportsService
  ) {}

  @Get("mine")
  async listMine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:create");
    return this.reportsService.listMine(user);
  }

  @Post()
  async create(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:create");
    return this.reportsService.create(user, body);
  }

  @Post("copyright-disputes")
  async createCopyrightDispute(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "report:create");
    return this.reportsService.createCopyrightDispute(user, body);
  }
}
