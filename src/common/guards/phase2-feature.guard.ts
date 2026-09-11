import {
  CanActivate,
  Injectable,
  NotFoundException,
  Type,
} from '@nestjs/common';
import {
  isPhase2FeatureEnabled,
  type Phase2Feature,
} from '../../config/phase2-features';

/**
 * Disconnects a single deferred route that shares a controller with routes that
 * are still in scope — where dropping the whole controller is not an option and
 * moving the handler would mean editing code that currently works.
 *
 * Responds 404 rather than 403: a disabled feature should be indistinguishable
 * from one that was never built, and 403 would advertise that the endpoint
 * exists behind a flag.
 *
 * Prefer gating the controller in its module where a whole feature is deferred —
 * that way the route is absent from the OpenAPI contract too, rather than
 * present and refusing.
 */
export function Phase2FeatureGuard(feature: Phase2Feature): Type<CanActivate> {
  @Injectable()
  class DeferredFeatureGuard implements CanActivate {
    canActivate(): boolean {
      if (!isPhase2FeatureEnabled(feature)) {
        throw new NotFoundException();
      }
      return true;
    }
  }

  return DeferredFeatureGuard;
}
