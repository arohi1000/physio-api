import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Exempts a route from JwtAuthGuard, which is otherwise applied globally. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
