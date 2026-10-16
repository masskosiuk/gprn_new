import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { PhotoCommerceService } from "./photo-commerce.service.js";

interface DownloadReply {
  header(name: string, value: string): DownloadReply;
  send(body: Buffer): unknown;
}
@Controller("photos")
export class PhotoCommerceController {
  constructor(
    private readonly auth: AuthService,
    private readonly commerce: PhotoCommerceService,
  ) {}
  @Get("purchases")
  @Header("Cache-Control", "private, no-store")
  async purchases(@Req() request: CookieRequest) {
    return this.commerce.purchases(
      await this.auth.requireUserFromRequest(request),
    );
  }
  @Get(":id/commerce")
  @Header("Cache-Control", "private, no-store")
  async get(@Req() request: CookieRequest, @Param("id") id: string) {
    return this.commerce.get(id, (await this.auth.me(request)).user);
  }
  @Patch(":id/commerce")
  async save(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.commerce.save(
      await this.auth.requireUserFromRequest(request),
      id,
      body,
    );
  }
  @Post(":id/purchase")
  async buy(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.auth.requireUserFromRequest(request);
    const photo = await this.commerce.get(id, user);
    if (!photo.sale) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND" });
    return this.commerce.purchase(user, photo.sale.id, body);
  }
  @Get(":id/original")
  async download(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Res() reply: DownloadReply,
  ) {
    const result = await this.commerce.download(
      await this.auth.requireUserFromRequest(request),
      id,
    );
    return reply
      .header("Cache-Control", "private, no-store")
      .header("Content-Type", "application/octet-stream")
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
      )
      .send(result.buffer);
  }
}
