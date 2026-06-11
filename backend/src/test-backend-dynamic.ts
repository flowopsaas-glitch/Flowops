import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import fetch from 'node-fetch';
import 'reflect-metadata';
import { Controller, Get, Post, Put, Delete, Patch } from '@nestjs/common';

const BASE = 'http:/localhost:3000';

(async () => {
  console.log('🔑 Logging in...');

  // Login to get JWT token
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@alpha.com', password: 'password123' }),
  });

  const loginData: any = await loginRes.json();
  if (!loginData.accessToken) {
    console.error('Login failed');
    process.exit(1);
  }
  const token = loginData.accessToken;

  console.log('✅ Login successful.\n');

  // Start Nest app in memory
  const app = await NestFactory.createApplicationContext(AppModule);

  // Helper to get route paths from controller
  function getRoutes(controller: any) {
    const metadataKeys = Reflect.getMetadataKeys(controller.prototype);
    const routes: { method: string; path: string }[] = [];

    metadataKeys.forEach((key) => {
      const handler = Reflect.getMetadata(key, controller.prototype);
      if (handler && handler.path && handler.requestMethod !== undefined) {
        const methodMap = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
        routes.push({ method: methodMap[handler.requestMethod], path: handler.path });
      }
    });

    return routes;
  }

  // Gather all controllers from AppModule
  const modules = Array.from((app as any).container.getModules().values());
  const endpoints: string[] = [];

  modules.forEach((mod: any) => {
    mod.controllers.forEach((ctrlWrapper: any) => {
      const instance = ctrlWrapper.instance;
      if (!instance) return;
      const basePath: string = Reflect.getMetadata('path', instance.constructor) || '';
      const routes = getRoutes(instance.constructor);
      routes.forEach((r) => endpoints.push(basePath + r.path));
    });
  });

  console.log('📊 Testing discovered endpoints with JWT token...\n');

  const results: { url: string; status: number | string; count?: number; error?: string }[] = [];

  for (const ep of endpoints) {
    try {
      const res = await fetch(BASE + ep, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      const count = Array.isArray(data) ? data.length : undefined;
      results.push({ url: ep, status: res.status, count });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({ url: ep, status: '❌', error: errorMsg });
    }
  }

  // Print results
  console.log('URL'.padEnd(40) + '| Status | Items/Error');
  console.log('-'.repeat(70));
  results.forEach((r) => {
    const items = r.count !== undefined ? `${r.count} item(s)` : r.error || '-';
    console.log(r.url.padEnd(40) + `| ${r.status}`.padEnd(7) + `| ${items}`);
  });

  await app.close();
  console.log('\n✅ Dynamic backend test complete.');
})();