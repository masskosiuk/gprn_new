import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AuthService } from "./auth.service.js";
import type { CookieReply, CookieRequest } from "./http.types.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(
    @Body() body: unknown,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: CookieReply
  ) {
    return this.authService.register(body, request, reply);
  }

  @Post("login")
  @HttpCode(200)
  login(
    @Body() body: unknown,
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) reply: CookieReply
  ) {
    return this.authService.login(body, request, reply);
  }

  @Post("request-email-verification")
  @HttpCode(200)
  requestEmailVerification(@Req() request: CookieRequest) {
    return this.authService.requestEmailVerification(request);
  }

  @Post("verify-email")
  @HttpCode(200)
  verifyEmail(@Body() body: unknown) {
    return this.authService.verifyEmail(body);
  }

  @Post("request-password-reset")
  @HttpCode(200)
  requestPasswordReset(@Body() body: unknown, @Req() request: CookieRequest) {
    return this.authService.requestPasswordReset(body, request);
  }

  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
  }

  @Post("logout")
  @HttpCode(200)
  logout(@Req() request: CookieRequest, @Res({ passthrough: true }) reply: CookieReply) {
    return this.authService.logout(request, reply);
  }

  @Get("me")
  me(@Req() request: CookieRequest) {
    return this.authService.me(request);
  }

  @Get("providers")
  providers() {
    return this.authService.getAuthProviders();
  }
}
