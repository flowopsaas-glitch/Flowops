"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var bcrypt_1 = require("bcrypt");
var prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var adminEmail, adminPassword, existingAdmin, hashedPassword, adminUser, companies, _i, companies_1, company, baseName, companyAdminEmail, hashedPassword, user, i, operatorEmail, hashedPassword, user, i, driverEmail, hashedPassword, user;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("🌱 Seeding users...");
                    adminEmail = "admin@flowops.com";
                    adminPassword = "Admin123!";
                    return [4 /*yield*/, prisma.user.findUnique({
                            where: { email: adminEmail },
                        })];
                case 1:
                    existingAdmin = _a.sent();
                    if (!!existingAdmin) return [3 /*break*/, 4];
                    return [4 /*yield*/, bcrypt_1.default.hash(adminPassword, 10)];
                case 2:
                    hashedPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: adminEmail,
                                password: hashedPassword,
                                role: client_1.UserRole.ADMIN,
                            },
                        })];
                case 3:
                    adminUser = _a.sent();
                    console.log("\u2705 Created top-level ADMIN user: ".concat(adminUser.email));
                    return [3 /*break*/, 5];
                case 4:
                    console.log("\u26A0 Top-level ADMIN already exists: ".concat(existingAdmin.email));
                    _a.label = 5;
                case 5: return [4 /*yield*/, prisma.company.findMany()];
                case 6:
                    companies = _a.sent();
                    if (companies.length === 0) {
                        console.log("⚠ No companies found. Please seed companies first.");
                        return [2 /*return*/];
                    }
                    _i = 0, companies_1 = companies;
                    _a.label = 7;
                case 7:
                    if (!(_i < companies_1.length)) return [3 /*break*/, 24];
                    company = companies_1[_i];
                    baseName = company.name.replace(/\s+/g, "").toLowerCase();
                    companyAdminEmail = "admin@".concat(baseName, ".com");
                    return [4 /*yield*/, prisma.user.findUnique({ where: { email: companyAdminEmail } })];
                case 8:
                    if (!!(_a.sent())) return [3 /*break*/, 11];
                    return [4 /*yield*/, bcrypt_1.default.hash("Password123!", 10)];
                case 9:
                    hashedPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: companyAdminEmail,
                                password: hashedPassword,
                                role: client_1.UserRole.COMPANY_ADMIN,
                                company: { connect: { id: company.id } },
                            },
                        })];
                case 10:
                    user = _a.sent();
                    console.log("\u2705 Created user: ".concat(user.email, " (role: ").concat(user.role, ") for company: ").concat(company.name));
                    _a.label = 11;
                case 11:
                    i = 1;
                    _a.label = 12;
                case 12:
                    if (!(i <= 4)) return [3 /*break*/, 17];
                    operatorEmail = "operator".concat(i, "@").concat(baseName, ".com");
                    return [4 /*yield*/, prisma.user.findUnique({ where: { email: operatorEmail } })];
                case 13:
                    if (!!(_a.sent())) return [3 /*break*/, 16];
                    return [4 /*yield*/, bcrypt_1.default.hash("Password123!", 10)];
                case 14:
                    hashedPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: operatorEmail,
                                password: hashedPassword,
                                role: client_1.UserRole.OPERATOR,
                                company: { connect: { id: company.id } },
                            },
                        })];
                case 15:
                    user = _a.sent();
                    console.log("\u2705 Created user: ".concat(user.email, " (role: ").concat(user.role, ") for company: ").concat(company.name));
                    _a.label = 16;
                case 16:
                    i++;
                    return [3 /*break*/, 12];
                case 17:
                    i = 1;
                    _a.label = 18;
                case 18:
                    if (!(i <= 10)) return [3 /*break*/, 23];
                    driverEmail = "driver".concat(i, "@").concat(baseName, ".com");
                    return [4 /*yield*/, prisma.user.findUnique({ where: { email: driverEmail } })];
                case 19:
                    if (!!(_a.sent())) return [3 /*break*/, 22];
                    return [4 /*yield*/, bcrypt_1.default.hash("Password123!", 10)];
                case 20:
                    hashedPassword = _a.sent();
                    return [4 /*yield*/, prisma.user.create({
                            data: {
                                email: driverEmail,
                                password: hashedPassword,
                                role: client_1.UserRole.DRIVER,
                                company: { connect: { id: company.id } },
                            },
                        })];
                case 21:
                    user = _a.sent();
                    console.log("\u2705 Created user: ".concat(user.email, " (role: ").concat(user.role, ") for company: ").concat(company.name));
                    _a.label = 22;
                case 22:
                    i++;
                    return [3 /*break*/, 18];
                case 23:
                    _i++;
                    return [3 /*break*/, 7];
                case 24:
                    console.log("🎉 Seeding complete!");
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
