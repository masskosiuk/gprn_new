import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Get()
  getHealth(): { service: string; status: "ok" } {
    return {
      service: "gprn-api",
      status: "ok"
    };
  }
}

