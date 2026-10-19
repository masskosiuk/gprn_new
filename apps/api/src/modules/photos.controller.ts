import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import { requirePermission } from "./authorization.js";
import type { CookieRequest } from "./http.types.js";
import { PhotosService } from "./photos.service.js";
import { moveGalleryPhoto } from "./gallery-order.js";

@ApiTags("photos")
@Controller("photos")
export class PhotosController {
  constructor(
    private readonly authService: AuthService,
    private readonly photosService: PhotosService,
  ) {}

  @Get("import-sources")
  importSources() {
    return this.photosService.getImportSources();
  }

  @Get("mine")
  async mine(@Req() request: CookieRequest) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.photosService.listMine(user);
  }

  @Post("add-from-device")
  async addFromDevice(@Req() request: CookieRequest, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.photosService.addFromDevice(user, body);
  }

  @Get(":photoId/public")
  @Header("Cache-Control", "no-store")
  publicPhoto(@Param("photoId") photoId: string) {
    return this.photosService.publicPhoto(photoId);
  }

  @Patch("gallery-order")
  async reorder(@Req() request: CookieRequest, @Body() body: unknown) {
    return moveGalleryPhoto(
      await this.authService.requireUserFromRequest(request),
      body,
    );
  }

  @Post(":photoId/publish")
  async publish(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.photosService.publish(user, photoId, body);
  }

  @Delete(":photoId")
  async remove(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    requirePermission(user, "photo:delete_own");

    return this.photosService.remove(user, photoId);
  }

  @Patch(":photoId/title")
  async rename(
    @Req() request: CookieRequest,
    @Param("photoId") photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.photosService.rename(user, photoId, body);
  }

  @Patch(":photoId/category")
  async changeCategory(
    @Req() request: CookieRequest,
    @Param("photoId", new ParseUUIDPipe()) photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.photosService.changeCategory(user, photoId, body);
  }

  @Patch(":photoId/location")
  async changeLocation(
    @Req() request: CookieRequest,
    @Param("photoId", new ParseUUIDPipe()) photoId: string,
    @Body() body: unknown,
  ) {
    const user = await this.authService.requireUserFromRequest(request);
    return this.photosService.changeLocation(user, photoId, body);
  }
}
