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
import { AvailabilityBlocksService } from './availability-blocks.service';
import {
  AvailabilityBlockDto,
  AvailabilityBlockWithWarningsDto,
} from './dto/availability-block.dto';
import { CreateAvailabilityBlockDto } from './dto/create-availability-block.dto';
import { QueryAvailabilityBlocksDto } from './dto/query-availability-blocks.dto';
import { UpdateAvailabilityBlockDto } from './dto/update-availability-block.dto';

@ApiTags('admin/availability-blocks')
@ApiBearerAuth()
@Controller('admin/availability-blocks')
export class AvailabilityBlocksController {
  constructor(
    private readonly availabilityBlocksService: AvailabilityBlocksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List availability blocks overlapping a range' })
  @ApiResponse({ status: 200, type: [AvailabilityBlockDto] })
  list(
    @Query() query: QueryAvailabilityBlocksDto,
  ): Promise<AvailabilityBlockDto[]> {
    return this.availabilityBlocksService.list(query.from, query.to);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an availability block',
    description:
      'Overlapping an existing booking always succeeds — the booking is never cancelled, only reported back in affectedAppointments.',
  })
  @ApiResponse({ status: 201, type: AvailabilityBlockWithWarningsDto })
  create(
    @Body() dto: CreateAvailabilityBlockDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvailabilityBlockWithWarningsDto> {
    return this.availabilityBlocksService.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an availability block' })
  @ApiResponse({ status: 200, type: AvailabilityBlockWithWarningsDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAvailabilityBlockDto,
  ): Promise<AvailabilityBlockWithWarningsDto> {
    return this.availabilityBlocksService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an availability block' })
  @ApiResponse({ status: 204 })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.availabilityBlocksService.remove(id);
  }
}
