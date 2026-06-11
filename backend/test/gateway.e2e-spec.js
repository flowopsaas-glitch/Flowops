"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const axios_1 = require("@nestjs/axios");
const rxjs_1 = require("rxjs");
const test_module_1 = require("./test.module");
describe('Gateway (e2e)', () => {
    let app;
    let httpService;
    beforeEach(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [test_module_1.TestModule],
        })
            .overrideProvider(axios_1.HttpService)
            .useValue({
            post: jest.fn(),
            get: jest.fn()
        })
            .compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true
        }));
        httpService = moduleFixture.get(axios_1.HttpService);
        await app.init();
    });
    afterEach(async () => {
        await app.close();
    });
    it('/api/v1/health (GET)', () => {
        // Mock the health check response
        jest.spyOn(httpService, 'get').mockImplementation(() => {
            return (0, rxjs_1.of)({
                data: {
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    service: 'workflow-service',
                    uptime: 123.456
                },
                status: 200,
                statusText: 'OK',
                headers: {},
                config: { url: 'http://localhost:3001/api/v1/health' }
            });
        });
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/api/v1/health')
            .expect(200)
            .expect((res) => {
            expect(res.body).toHaveProperty('gateway');
            expect(res.body).toHaveProperty('workflow');
            expect(res.body.gateway).toHaveProperty('status', 'ok');
            expect(res.body.workflow).toHaveProperty('status', 'ok');
        });
    });
});
