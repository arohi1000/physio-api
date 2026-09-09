import { randomUUID } from 'node:crypto';
import { Controller, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { AuditRecorder } from '../../src/common/audit/audit-recorder';
import { Audit } from '../../src/common/decorators/audit-action.decorator';

/**
 * Test-only stand-in for the patient mutations that arrive in Milestone 3.
 * It exists so the audit interceptor can be exercised over real HTTP now,
 * rather than shipping an unproven interceptor and a route no milestone asked
 * for. It is registered by the integration test, never by AppModule.
 */
@ApiExcludeController()
@Controller('admin/patients')
export class AuditedFixtureController {
  @Post()
  create(@Audit() audit: AuditRecorder): { id: string } {
    const id = randomUUID();
    audit.recordEntityId(id);
    audit.recordChange(null, {
      name: 'Fixture Patient',
      phone: '+910000000000',
    });
    return { id };
  }
}
