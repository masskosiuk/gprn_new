import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Query,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { DigitalProductsService } from "./digital-products.service.js";
import type { CookieRequest } from "./http.types.js";

interface DownloadReply {
  header(name: string, value: string): DownloadReply;
  send(body: Buffer): unknown;
}

@ApiTags("digital-products")
@Controller("digital-products")
export class DigitalProductsController {
  constructor(
    private readonly auth: AuthService,
    private readonly products: DigitalProductsService,
  ) {}

  @Get("demo/:author")
  demo(@Param("author") author: string) {
    return this.products.demo(author);
  }

  @Get()
  catalog(@Query() query: Record<string, string | undefined>) {
    return this.products.catalog(query);
  }

  @Post()
  async create(@Req() request: CookieRequest, @Body() body: unknown) {
    return this.products.save(
      await this.auth.requireUserFromRequest(request),
      body,
    );
  }

  @Get("purchases")
  async purchases(@Req() request: CookieRequest) {
    return this.products.purchases(
      await this.auth.requireUserFromRequest(request),
    );
  }

  @Patch(":id")
  async update(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.products.save(
      await this.auth.requireUserFromRequest(request),
      body,
      id,
    );
  }

  @Delete(":id")
  async archive(@Req() request: CookieRequest, @Param("id") id: string) {
    return this.products.archive(
      await this.auth.requireUserFromRequest(request),
      id,
    );
  }

  @Post(":id/purchase")
  async purchase(@Req() request: CookieRequest, @Param("id") id: string) {
    return this.products.purchase(
      await this.auth.requireUserFromRequest(request),
      id,
    );
  }

  @Get(":id/files/:fileId")
  async download(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res() reply: DownloadReply,
  ) {
    const { file, buffer } = await this.products.download(
      await this.auth.requireUserFromRequest(request),
      id,
      fileId,
    );
    reply
      .header("Cache-Control", "private, no-store")
      .header("Content-Type", "application/octet-stream")
      .header("X-Content-Type-Options", "nosniff")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
    return reply.send(buffer);
  }
}
