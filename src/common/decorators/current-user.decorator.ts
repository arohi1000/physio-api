import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../http/authenticated-request';

/**
 * The principal established by JwtAuthGuard. Only usable on guarded routes, so
 * the value is never undefined by the time a handler runs.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error(
        '@CurrentUser() used on a route that is not behind JwtAuthGuard',
      );
    }
    return request.user;
  },
);
