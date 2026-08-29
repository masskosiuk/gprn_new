import "dotenv/config";
import "reflect-metadata";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { loadRuntimeEnv } from "@gprn/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./modules/app.module.js";

async function bootstrap(): Promise<void> {
  const env = loadRuntimeEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  await app.register(helmet);
  await app.register(cookie, {
    secret: env.SESSION_SECRET
  });
  await app.register(cors, {
    credentials: true,
    origin: [env.APP_URL]
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true
    })
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("GPRN API")
      .setDescription("API-first backend for web and future mobile clients.")
      .setVersion("0.1.0")
      .build()
  );
  SwaggerModule.setup("api/docs", app, document);

  await app.listen({ host: "0.0.0.0", port: 4000 });
}

void bootstrap();

