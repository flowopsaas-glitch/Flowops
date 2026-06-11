"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirePlan = exports.REQUIRE_PLAN_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.REQUIRE_PLAN_KEY = 'require_plan';
const RequirePlan = (...plans) => (0, common_1.SetMetadata)(exports.REQUIRE_PLAN_KEY, plans);
exports.RequirePlan = RequirePlan;
