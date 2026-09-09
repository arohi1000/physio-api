import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { API_PREFIX, buildOpenApiDocument } from '../src/swagger';

const OUTPUT_PATH = resolve(__dirname, '..', 'openapi.json');

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix(API_PREFIX);

  const document = buildOpenApiDocument(app);
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  process.stdout.write(`OpenAPI specification written to ${OUTPUT_PATH}\n`);
}

void generate();
