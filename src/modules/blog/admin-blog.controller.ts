import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { BlogService } from './blog.service';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { BlogPostDto, PaginatedBlogPostsDto } from './dto/blog-post.dto';
import { QueryAdminBlogPostsDto } from './dto/query-admin-blog-posts.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';

/**
 * CRM blog CRUD — M5-CONTRACT.md §3. No `@Roles` restriction: unlike coupons,
 * user management, clinic settings and patient deletion, the contract does
 * not call blog management out as doctor_admin-only, so it stays open to any
 * authenticated CRM user per `roles.decorator.ts`'s default.
 */
@ApiTags('admin/blog')
@ApiBearerAuth()
@Controller('admin/blog')
export class AdminBlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @ApiOperation({
    summary: 'List posts, drafts included, filterable by status',
  })
  @ApiResponse({ status: 200, type: PaginatedBlogPostsDto })
  list(@Query() query: QueryAdminBlogPostsDto): Promise<PaginatedBlogPostsDto> {
    return this.blogService.listForAdmin(query.status, query.page, query.limit);
  }

  @Post()
  @ApiOperation({ summary: 'Create a post; slug is generated from the title' })
  @ApiResponse({ status: 201, type: BlogPostDto })
  @ApiResponse({ status: 409, description: 'BLOG_SLUG_TAKEN' })
  create(
    @Body() dto: CreateBlogPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BlogPostDto> {
    return this.blogService.create(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A post by id, drafts included' })
  @ApiResponse({ status: 200, type: BlogPostDto })
  @ApiResponse({ status: 404, description: 'BLOG_POST_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<BlogPostDto> {
    return this.blogService.getByIdForAdmin(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a post' })
  @ApiResponse({ status: 200, type: BlogPostDto })
  @ApiResponse({ status: 404, description: 'BLOG_POST_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'BLOG_SLUG_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBlogPostDto,
  ): Promise<BlogPostDto> {
    return this.blogService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard delete — a blog post is not a medical record',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'BLOG_POST_NOT_FOUND' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.blogService.delete(id);
  }
}
