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
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { CommunityService } from "./community.service.js";
import type { CookieRequest } from "./http.types.js";

@ApiTags("community")
@Controller("community")
export class CommunityController {
  constructor(
    private readonly auth: AuthService,
    private readonly community: CommunityService,
  ) {}

  @Get("posts") list(@Query() query: Record<string, string | undefined>) {
    return this.community.list(query);
  }
  @Get("highlights") highlights() {
    return this.community.highlights();
  }
  @Get("posts/:id") one(@Param("id") id: string) {
    return this.community.one(id);
  }
  @Post("contact/:username") async contact(
    @Req() request: CookieRequest,
    @Param("username") username: string,
    @Body() body: unknown,
  ) {
    return this.community.contact(
      await this.auth.requireUserFromRequest(request),
      username,
      body,
    );
  }
  @Get("mine") async mine(@Req() request: CookieRequest) {
    return this.community.mine(await this.auth.requireUserFromRequest(request));
  }
  @Post("posts") async create(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.community.create(
      await this.auth.requireUserFromRequest(request),
      body,
    );
  }
  @Patch("posts/:id") async update(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.update(
      await this.auth.requireUserFromRequest(request),
      id,
      body,
    );
  }
  @Delete("posts/:id") async remove(
    @Req() request: CookieRequest,
    @Param("id") id: string,
  ) {
    return this.community.remove(
      await this.auth.requireUserFromRequest(request),
      id,
    );
  }
  @Get("moderation") async moderation(@Req() request: CookieRequest) {
    return this.community.moderation(
      await this.auth.requireUserFromRequest(request),
    );
  }
  @Patch("moderation/:id") async moderate(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.moderate(
      await this.auth.requireUserFromRequest(request),
      id,
      body,
    );
  }
  @Get("inquiries") async inquiries(@Req() request: CookieRequest) {
    return this.community.inquiries(
      await this.auth.requireUserFromRequest(request),
    );
  }
  @Post("inquiries") async inquire(
    @Req() request: CookieRequest,
    @Body() body: unknown,
  ) {
    return this.community.inquire(
      await this.auth.requireUserFromRequest(request),
      body,
    );
  }
  @Get("admin/inquiries") async adminInquiries(
    @Req() request: CookieRequest,
    @Query("kind") kind?: string,
  ) {
    return this.community.inquiries(
      await this.auth.requireUserFromRequest(request),
      true,
      kind,
    );
  }
  @Patch("admin/inquiries/:id") async reply(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.reply(
      await this.auth.requireUserFromRequest(request),
      id,
      body,
    );
  }
  @Patch("admin/pro/:id") async pro(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.setPro(
      await this.auth.requireUserFromRequest(request),
      id,
      body,
    );
  }
  @Get("inquiries/:id/image") async image(
    @Req() request: CookieRequest,
    @Param("id") id: string,
    @Res()
    response: {
      header(name: string, value: string): unknown;
      send(body: Buffer): unknown;
    },
  ) {
    const image = await this.community.inquiryImage(
      await this.auth.requireUserFromRequest(request),
      id,
    );
    response.header("Content-Type", "image/webp");
    response.header("Cache-Control", "private, no-store");
    response.header("X-Content-Type-Options", "nosniff");
    return response.send(image);
  }
  @Get("comments/:kind/:id") comments(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Query("page") page?: string,
  ) {
    return this.community.comments(kind, id, page);
  }
  @Post("comments/:kind/:id") async comment(
    @Req() request: CookieRequest,
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.comment(
      await this.auth.requireUserFromRequest(request),
      kind,
      id,
      body,
    );
  }
  @Delete("comments/:id") async deleteComment(
    @Req() request: CookieRequest,
    @Param("id") id: string,
  ) {
    return this.community.deleteComment(
      await this.auth.requireUserFromRequest(request),
      id,
    );
  }
  @Post("comments/:id/translation") translateComment(
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.community.translateComment(id, body);
  }
}
