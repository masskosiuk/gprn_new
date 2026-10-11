import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { InteractionsService } from "./interactions.service.js";
import type { CookieRequest } from "./http.types.js";

@Controller("interactions")
export class InteractionsController {
  constructor(
    private readonly auth: AuthService,
    private readonly interactions: InteractionsService,
  ) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() req: CookieRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.interactions.list(
      await this.auth.requireUserFromRequest(req),
      query,
    );
  }
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() req: CookieRequest,
    @Param("id") id: string,
    @Query("page") page?: string,
  ) {
    return this.interactions.detail(
      await this.auth.requireUserFromRequest(req),
      id,
      page,
    );
  }
  @Post(":id/messages")
  async send(
    @Req() req: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.send(
      await this.auth.requireUserFromRequest(req),
      id,
      body,
    );
  }
  @Patch(":id")
  async update(
    @Req() req: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.interactions.update(
      await this.auth.requireUserFromRequest(req),
      id,
      body,
    );
  }
}
