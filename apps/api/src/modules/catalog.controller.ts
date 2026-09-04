import { Controller, Get } from "@nestjs/common";
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

  @Get("seasons/current")
  currentSeason() {
    return this.catalogService.getCurrentSeason();
  }
}

