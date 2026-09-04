import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieRequest } from "./http.types.js";
import { PhotosService } from "./photos.service.js";

@ApiTags("photos")
@Controller("photos")
export class PhotosController {
  constructor(
    private readonly authService: AuthService,
    private readonly photosService: PhotosService
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

  @Post(":photoId/publish")
  async publish(@Req() request: CookieRequest, @Param("photoId") photoId: string, @Body() body: unknown) {
    const user = await this.authService.requireUserFromRequest(request);

    return this.photosService.publish(user, photoId, body);
  }
}

