import { NotFoundException } from '@nestjs/common';
import { OkrService } from './okr.service';

/**
 * OKR — Objectives & Key Results for FlowOps itself.
 *
 * Not tenant-scoped, and deliberately so: the controller sits behind
 * OwnerAuthGuard at /owner/okrs, and the service docstring says it is the
 * owner's strategic cockpit. The absence of companyId here is a design
 * decision, not the gap it would be anywhere else in this codebase — worth
 * stating plainly because it looks exactly like one.
 *
 * What is worth testing is the progress maths, since an objective's percentage
 * is derived from key-result values and never hand-entered.
 */

function makePrisma() {
  const objectives: any[] = [];
  const keyResults: any[] = [];
  let seq = 0;

  const match = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([k, v]) => (row as any)[k] === v);

  const prisma: any = {
    objective: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `obj-${++seq}`, keyResults: [], status: 'ON_TRACK', ...data };
        objectives.push(row);
        return { ...row };
      }),
      findMany: jest.fn(async ({ where: _where }: any) =>
        objectives.map((o) => ({ ...o, keyResults: keyResults.filter((k) => k.objectiveId === o.id) })),
      ),
      findUnique: jest.fn(async ({ where }: any) => {
        const o = objectives.find((x) => x.id === where.id);
        return o ? { ...o, keyResults: keyResults.filter((k) => k.objectiveId === o.id) } : null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const o = objectives.find((x) => x.id === where.id);
        if (!o) throw new Error('not found');
        Object.assign(o, data);
        return { ...o };
      }),
      delete: jest.fn(async ({ where }: any) => {
        const i = objectives.findIndex((x) => x.id === where.id);
        if (i < 0) throw new Error('not found');
        objectives.splice(i, 1);
        return { id: where.id };
      }),
    },
    keyResult: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `kr-${++seq}`, ...data };
        keyResults.push(row);
        return { ...row };
      }),
      findUnique: jest.fn(async ({ where }: any) => keyResults.find((x) => x.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) => keyResults.filter((k) => match(k, where))),
      update: jest.fn(async ({ where, data }: any) => {
        const k = keyResults.find((x) => x.id === where.id);
        if (!k) throw new Error('not found');
        Object.assign(k, data);
        return { ...k };
      }),
      delete: jest.fn(async ({ where }: any) => {
        const i = keyResults.findIndex((x) => x.id === where.id);
        if (i < 0) throw new Error('not found');
        keyResults.splice(i, 1);
        return { id: where.id };
      }),
    },
    __objectives: objectives,
    __keyResults: keyResults,
  };
  return prisma;
}

const build = (prisma: any) => new OkrService(prisma);

describe('OkrService — key result progress is derived, never entered', () => {
  const seedKr = (prisma: any, over: any = {}) => {
    const obj = { id: 'obj-1', title: 'Ship the platform', quarter: '2026-Q4' };
    prisma.__objectives.push({ ...obj, keyResults: [], status: 'ON_TRACK' });
    prisma.__keyResults.push({
      id: 'kr-1',
      objectiveId: 'obj-1',
      title: 'Courier partners',
      startValue: 0,
      targetValue: 100,
      currentValue: 0,
      ...over,
    });
    return prisma;
  };

  it('is 0 at the start value and 100 at the target', async () => {
    const p = makePrisma();
    seedKr(p, { currentValue: 0 });
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(0);

    p.__keyResults[0].currentValue = 100;
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(100);
  });

  it('is 50 halfway', async () => {
    const p = makePrisma();
    seedKr(p, { currentValue: 50 });
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(50);
  });

  it('works for a target below the start — reducing cost, say', async () => {
    // start 100 -> target 50. Reaching 75 is halfway.
    const p = makePrisma();
    seedKr(p, { startValue: 100, targetValue: 50, currentValue: 75 });
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(50);
  });

  it('clamps overshoot at 100 rather than reporting more than complete', async () => {
    const p = makePrisma();
    seedKr(p, { currentValue: 250 });
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(100);
  });

  it('clamps below the start at 0', async () => {
    const p = makePrisma();
    seedKr(p, { currentValue: -40 });
    expect((await build(p).get('obj-1')).keyResults[0].progress).toEqual(0);
  });

  it('does not divide by zero when start and target are equal', async () => {
    // span === 0. Unguarded this is NaN, and NaN would poison the objective
    // roll-up and the summary average for the whole quarter.
    const p = makePrisma();
    seedKr(p, { startValue: 10, targetValue: 10, currentValue: 10 });
    const out: any = await build(p).get('obj-1');
    expect(Number.isNaN(out.keyResults[0].progress)).toBe(false);
    expect(out.keyResults[0].progress).toEqual(100);
  });

  it('rolls an objective up as the average of its key results', async () => {
    const p = makePrisma();
    seedKr(p, { currentValue: 100 });
    p.__keyResults.push({
      id: 'kr-2', objectiveId: 'obj-1', title: 'NPS',
      startValue: 0, targetValue: 100, currentValue: 0,
    });
    const out: any = await build(p).get('obj-1');
    expect(out.progress).toEqual(50);
  });

  it('reports 0 progress for an objective with no key results', async () => {
    const p = makePrisma();
    await build(p).createObjective({ title: 'Empty', quarter: '2026-Q4' });
    const out: any = await build(p).get(p.__objectives[0].id);
    expect(out.progress).toEqual(0);
    expect(Number.isNaN(out.progress)).toBe(false);
  });
});

describe('OkrService — suggested status tracks progress', () => {
  const statusFor = async (currentValue: number) => {
    const p = makePrisma();
    await build(p).createObjective({ title: 'Objective', quarter: '2026-Q4' });
    const id = p.__objectives[0].id;
    await build(p).addKeyResult(id, { title: 'KR', targetValue: 100, currentValue });
    const out: any = await build(p).get(id);
    return out.suggestedStatus;
  };

  it('is ACHIEVED at 100', async () => expect(await statusFor(100)).toEqual('ACHIEVED'));
  it('is ON_TRACK from 70', async () => expect(await statusFor(70)).toEqual('ON_TRACK'));
  it('is AT_RISK from 40', async () => expect(await statusFor(40)).toEqual('AT_RISK'));
  it('is BEHIND below 40', async () => expect(await statusFor(10)).toEqual('BEHIND'));
});

describe('OkrService — lifecycle', () => {
  it('creates, updates and deletes an objective', async () => {
    const p = makePrisma();
    const svc = build(p);
    const created: any = await svc.createObjective({ title: 'Expand to Gauteng', quarter: '2026-Q4' });
    expect(created.title).toEqual('Expand to Gauteng');

    const updated: any = await svc.updateObjective(created.id, { title: 'Expand to Gauteng & Cape' });
    expect(updated.title).toEqual('Expand to Gauteng & Cape');

    await svc.deleteObjective(created.id);
    await expect(svc.get(created.id)).rejects.toThrow(NotFoundException);
  });

  it('refuses an unknown objective', async () => {
    await expect(build(makePrisma()).get('nope')).rejects.toThrow(NotFoundException);
  });

  it('refuses an unknown key result', async () => {
    await expect(build(makePrisma()).updateKeyResult('nope', { title: 'x' })).rejects.toThrow(NotFoundException);
    await expect(build(makePrisma()).deleteKeyResult('nope')).rejects.toThrow(NotFoundException);
  });

  it('refuses a key result on an unknown objective', async () => {
    await expect(
      build(makePrisma()).addKeyResult('nope', { title: 'KR', targetValue: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('defaults a key result’s current value to its start value', async () => {
    const p = makePrisma();
    await build(p).createObjective({ title: 'Objective', quarter: '2026-Q4' });
    const id = p.__objectives[0].id;
    await build(p).addKeyResult(id, { title: 'KR', targetValue: 100, startValue: 20 });
    expect(p.__keyResults[0].currentValue).toEqual(20);
  });

  it('recomputes the objective when a key result is removed', async () => {
    const p = makePrisma();
    await build(p).createObjective({ title: 'Objective', quarter: '2026-Q4' });
    const id = p.__objectives[0].id;
    await build(p).addKeyResult(id, { title: 'A', targetValue: 100, currentValue: 100 });
    await build(p).addKeyResult(id, { title: 'B', targetValue: 100, currentValue: 0 });

    const out: any = await build(p).deleteKeyResult(p.__keyResults[1].id);
    expect(out.progress).toEqual(100);
  });
});
