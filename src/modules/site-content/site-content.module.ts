import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AdminSiteContentController } from './admin-site-content.controller';
import { SiteContentCacheService } from './site-content-cache.service';
import { SiteContentController } from './site-content.controller';
import { SiteContentService } from './site-content.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SiteContentController, AdminSiteContentController],
  providers: [SiteContentService, SiteContentCacheService],
})
export class SiteContentModule {}
