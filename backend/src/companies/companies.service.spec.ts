import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

const makeJpeg = (originalname = 'logo.jpeg') => {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  return { originalname, mimetype: 'image/jpeg', size: buffer.length, buffer } as Express.Multer.File;
};

describe('company :id routes tenant safety', () => {
  const svc = {
    findOne: jest.fn().mockResolvedValue({ id: 'company-a' }),
    update: jest.fn().mockResolvedValue({ id: 'company-a' }),
    updateSla: jest.fn().mockResolvedValue({ id: 'company-a' }),
    addAdmin: jest.fn().mockResolvedValue({ id: 'user-1' }),
  };
  const controller = new CompaniesController(svc as any);
  const me = { companyId: 'company-a' };

  beforeEach(() => jest.clearAllMocks());

  it('rejects cross-tenant access on every :id route before touching the service', () => {
    expect(() => controller.findOne('company-b', me)).toThrow(ForbiddenException);
    expect(() => controller.update('company-b', me, {})).toThrow(ForbiddenException);
    expect(() => controller.updateSla('company-b', me, {})).toThrow(ForbiddenException);
    expect(() => controller.addAdmin('company-b', me, {} as any)).toThrow(ForbiddenException);
    expect(svc.findOne).not.toHaveBeenCalled();
    expect(svc.update).not.toHaveBeenCalled();
    expect(svc.updateSla).not.toHaveBeenCalled();
    expect(svc.addAdmin).not.toHaveBeenCalled();
  });

  it('serves own-company requests scoped to the authenticated company', async () => {
    await expect(controller.findOne('company-a', me)).resolves.toEqual({ id: 'company-a' });
    expect(svc.findOne).toHaveBeenCalledWith('company-a');
    await controller.update('company-a', me, { name: 'Acme' });
    expect(svc.update).toHaveBeenCalledWith('company-a', { name: 'Acme' });
    await controller.updateSla('company-a', me, { slaWarningMinutes: 30 });
    expect(svc.updateSla).toHaveBeenCalledWith('company-a', { slaWarningMinutes: 30 });
    await controller.addAdmin('company-a', me, { email: 'a@b.c' } as any);
    expect(svc.addAdmin).toHaveBeenCalledWith('company-a', { email: 'a@b.c' });
  });

  it('requires admin roles for mutations and no longer exposes platform-wide routes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype.update)).toEqual([
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.MANAGER,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype.updateSla)).toEqual([
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.MANAGER,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype.addAdmin)).toEqual([
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
    ]);
    // Platform listing/creation/overview moved to the owner console.
    expect((controller as any).findAll).toBeUndefined();
    expect((controller as any).create).toBeUndefined();
    expect((controller as any).platformOverview).toBeUndefined();
  });
});

describe('company logo upload security', () => {
  it('restricts logo uploads to the authenticated company and authorized roles', async () => {
    const service = { uploadLogo: jest.fn().mockResolvedValue({ logoUrl: 'https://cdn.example/logo.jpg' }) };
    const controller = new CompaniesController(service as any);
    const file = makeJpeg();

    expect(() => controller.uploadLogo('company-b', { companyId: 'company-a' }, file))
      .toThrow(ForbiddenException);
    expect(service.uploadLogo).not.toHaveBeenCalled();
    expect(Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype.uploadLogo)).toEqual([
      UserRole.ADMIN,
      UserRole.COMPANY_ADMIN,
      UserRole.MANAGER,
    ]);

    await expect(controller.uploadLogo('company-a', { companyId: 'company-a' }, file))
      .resolves.toEqual({ logoUrl: 'https://cdn.example/logo.jpg' });
    expect(service.uploadLogo).toHaveBeenCalledWith('company-a', file);
  });

  it('validates file bytes and a matching extension before storing under a server-generated key', async () => {
    const storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      publicFileUrl: jest.fn().mockReturnValue('https://cdn.example/logo.jpg'),
    };
    const prisma = { company: { update: jest.fn().mockResolvedValue({ id: 'company-a' }) } };
    const service = new CompaniesService(prisma as any, storage as any, {} as any);
    const file = makeJpeg();

    await expect(service.uploadLogo('company-a', file)).resolves.toEqual({ logoUrl: 'https://cdn.example/logo.jpg' });
    expect(storage.upload).toHaveBeenCalledWith(expect.stringMatching(/^logos\/company-a\/[0-9a-f-]+\.jpg$/i), file.buffer, 'image/jpeg');
    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: 'company-a' },
      data: { logoUrl: 'https://cdn.example/logo.jpg' },
    });

    await expect(service.uploadLogo('company-a', makeJpeg('logo.png'))).rejects.toThrow(BadRequestException);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });
});
