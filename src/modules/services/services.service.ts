import { Injectable, NotFoundException } from '@nestjs/common';
import type { Service } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ServiceDto } from './dto/service.dto';

/**
 * Owns the `services` table. Other modules (availability, appointments) reach
 * service data through here rather than querying `services` directly.
 */
@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<ServiceDto[]> {
    const services = await this.prisma.db.service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return services.map(toDto);
  }

  async findActiveByIdOrThrow(id: string): Promise<Service> {
    const service = await this.prisma.db.service.findFirst({
      where: { id, active: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }
}

export function toDto(service: Service): ServiceDto {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    demoVideoUrl: service.demoVideoUrl,
    price: service.price.toFixed(2),
    durationMinutes: service.durationMinutes,
  };
}
