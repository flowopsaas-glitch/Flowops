import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "dev-secret-change-me",
    });
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException();
    }

    const id = Number(payload.sub);
    const companyId =
      payload.companyId === null || payload.companyId === undefined
        ? null
        : Number(payload.companyId);

    // This object becomes "req.user" in your controllers
    return {
      userId: Number.isFinite(id) ? id : payload.sub,
      id: Number.isFinite(id) ? id : payload.sub, 
      email: payload.email,
      role: payload.role,
      roles: payload.roles || [payload.role], 
      tenantId: payload.tenantId || companyId || null,
      companyId: companyId != null && Number.isFinite(companyId) ? companyId : null,
      scope: payload.scope || payload.type || "tenant",
    };
  }
}
