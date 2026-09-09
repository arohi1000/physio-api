import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Owns the `users` table. Every other module reaches CRM accounts through here
 * rather than querying `users` directly (EXECUTION-PLAN §4.1).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Email addresses are stored and compared lower-cased. */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.db.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }

  findByGoogleSub(googleSub: string): Promise<User | null> {
    return this.prisma.db.user.findUnique({ where: { googleSub } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.db.user.findUnique({ where: { id } });
  }

  linkGoogleSub(userId: string, googleSub: string): Promise<User> {
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { googleSub },
    });
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
