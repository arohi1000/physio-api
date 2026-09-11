import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AdminBlogController } from './admin-blog.controller';
import { BlogCacheService } from './blog-cache.service';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [BlogController, AdminBlogController],
  providers: [BlogService, BlogCacheService],
})
export class BlogModule {}
