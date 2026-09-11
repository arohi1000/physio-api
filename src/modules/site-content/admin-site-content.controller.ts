import { Body, Controller, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/http/authenticated-request';
import { AboutContentDto } from './dto/about-content.dto';
import { ReviewsContentDto } from './dto/reviews-content.dto';
import { SiteContentService } from './site-content.service';

/**
 * `PUT /admin/site-content/:key` — M5-CONTRACT.md §3. The body shape is
 * validated dynamically against whichever key is named (`about` or
 * `reviews`), since the two content blocks have different shapes but share
 * one route. No `@Roles` restriction, for the same reason as the blog admin
 * routes: the contract does not call this out as doctor_admin-only.
 */
@ApiTags('admin/site-content')
@ApiBearerAuth()
@ApiExtraModels(AboutContentDto, ReviewsContentDto)
@Controller('admin/site-content')
export class AdminSiteContentController {
  constructor(private readonly siteContentService: SiteContentService) {}

  @Put(':key')
  @ApiOperation({ summary: 'Replace the content for a key: about | reviews' })
  @ApiResponse({
    status: 200,
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AboutContentDto) },
        { $ref: getSchemaPath(ReviewsContentDto) },
      ],
    },
  })
  @ApiResponse({ status: 404, description: 'SITE_CONTENT_KEY_UNKNOWN' })
  update(
    @Param('key') key: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AboutContentDto | ReviewsContentDto> {
    return this.siteContentService.update(key, body, user.id);
  }
}
