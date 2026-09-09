import { DynamicModule, Module, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { EnvironmentVariables } from '../../config/environment';
import { isDevBypassEnabled } from '../../config/dev-bypass';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DevAuthController } from './dev-auth.controller';
import { GoogleOAuthTokenVerifier } from './google/google-oauth-token-verifier';
import { GoogleTokenVerifier } from './google/google-token-verifier';
import { LoginAttemptLimiter } from './login-attempt.limiter';
import { RefreshCookieWriter } from './refresh-cookie.writer';
import { RefreshTokenStore } from './refresh-token.store';

@Module({})
export class AuthModule {
  /**
   * `DevAuthController` is added to the controller list only when the dev
   * bypass is enabled, so with the flag off the route does not exist at all —
   * it cannot be reached, and it does not appear in the OpenAPI contract.
   */
  static register(): DynamicModule {
    const controllers: Type<unknown>[] = [AuthController];
    if (isDevBypassEnabled()) {
      controllers.push(DevAuthController);
    }

    return {
      module: AuthModule,
      imports: [
        UsersModule,
        RedisModule,
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (
            configService: ConfigService<EnvironmentVariables, true>,
          ) => ({
            secret: configService.get('JWT_ACCESS_SECRET', { infer: true }),
          }),
        }),
      ],
      controllers,
      providers: [
        AuthService,
        AccessTokenService,
        RefreshTokenStore,
        RefreshCookieWriter,
        LoginAttemptLimiter,
        { provide: GoogleTokenVerifier, useClass: GoogleOAuthTokenVerifier },
      ],
      exports: [AccessTokenService],
    };
  }
}
