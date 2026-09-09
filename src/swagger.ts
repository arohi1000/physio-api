import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const API_PREFIX = 'api/v1';
const SWAGGER_PATH = 'api/docs';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Physio Clinic API')
    .setDescription(
      'Booking, patient records and clinic administration for the physiotherapy clinic. ' +
        'This specification is the contract the website and CRM generate their types from.',
    )
    .setVersion('1.0.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app));
}
