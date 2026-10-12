import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentInjector, inject } from '@angular/core';
import { MockBackend } from './mock-backend';

/**
 * One backend (one in-memory session) per application injector. A plain WeakMap instead of an
 * @Injectable or InjectionToken, because those leave side-effectful statics that stop the bundler from
 * dropping the mock and its DEMO users out of production builds.
 */
const backends = new WeakMap<EnvironmentInjector, MockBackend>();

/** Registered only when environment.useMockApi is true (see app.config.ts). */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(EnvironmentInjector);
  let backend = backends.get(injector);
  if (!backend) {
    backend = new MockBackend();
    backends.set(injector, backend);
  }
  return backend.handle(req) ?? next(req);
};
