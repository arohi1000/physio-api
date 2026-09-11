import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BlogService } from './blog.service';
import { BlogPostDto, PaginatedBlogPostsDto } from './dto/blog-post.dto';
import { QueryBlogPostsDto } from './dto/query-blog-posts.dto';

/** Public blog reads — M5-CONTRACT.md §3. */
@ApiTags('blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Published posts, newest first' })
  @ApiResponse({ status: 200, type: PaginatedBlogPostsDto })
  list(@Query() query: QueryBlogPostsDto): Promise<PaginatedBlogPostsDto> {
    return this.blogService.listPublished(query.page, query.limit);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'A published post by slug — a draft 404s' })
  @ApiResponse({ status: 200, type: BlogPostDto })
  @ApiResponse({ status: 404, description: 'BLOG_POST_NOT_FOUND' })
  getBySlug(@Param('slug') slug: string): Promise<BlogPostDto> {
    return this.blogService.getPublishedBySlug(slug);
  }
}
