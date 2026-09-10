import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ServiceDto } from './dto/service.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Active treatment services, name-ordered' })
  @ApiResponse({ status: 200, type: [ServiceDto] })
  list(): Promise<ServiceDto[]> {
    return this.servicesService.listActive();
  }
}
