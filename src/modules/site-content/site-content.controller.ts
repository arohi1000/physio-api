import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AboutContentDto } from './dto/about-content.dto';
import { ReviewsContentDto } from './dto/reviews-content.dto';
import { SiteContentService } from './site-content.service';

/** Public reads of editable site content — M5-CONTRACT.md §3. */
@ApiTags('site-content')
@ApiExtraModels(AboutContentDto, ReviewsContentDto)
@Controller('site-content')
export class SiteContentController {
  constructor(private readonly siteContentService: SiteContentService) {}

  @Public()
  @Get(':key')
  @ApiOperation({ summary: 'Editable content by key: about | reviews' })
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
  get(@Param('key') key: string): Promise<AboutContentDto | ReviewsContentDto> {
    return this.siteContentService.get(key);
  }
}
