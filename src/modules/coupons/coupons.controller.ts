import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ServicesService } from '../services/services.service';
import { CouponsService } from './coupons.service';
import { CouponPreviewResponseDto } from './dto/coupon-preview-response.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

/** Preview-only endpoint; loose enough for a wizard's live "apply coupon"
 * field, tight enough to blunt code-guessing. */
const VALIDATE_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('coupons')
@Controller('coupons')
export class CouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly servicesService: ServicesService,
  ) {}

  @Public()
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Throttle(VALIDATE_THROTTLE)
  @ApiOperation({
    summary: 'Preview a coupon against a service price',
    description: 'Read-only — never increments used_count.',
  })
  @ApiResponse({ status: 200, type: CouponPreviewResponseDto })
  async validate(
    @Body() dto: ValidateCouponDto,
  ): Promise<CouponPreviewResponseDto> {
    const service = await this.servicesService.findActiveByIdOrThrow(
      dto.serviceId,
    );
    return this.couponsService.previewValidate(dto.code, service.price);
  }
}
