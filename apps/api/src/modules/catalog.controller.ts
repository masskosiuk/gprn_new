import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CatalogService } from "./catalog.service.js";

@ApiTags("catalog")
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("categories")
  categories() {
    return this.catalogService.listCategories();
  }

  @Get("locations")
  locations(@Query("search") search = "", @Query("language") language = "en") {
    return this.catalogService.searchLocations(search, language);
  }

  @Get("seasons/current")
  currentSeason() {
    return this.catalogService.getCurrentSeason();
  }
}
