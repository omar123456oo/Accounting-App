/** Always false in production so the mock API and its DEMO users are tree-shaken out of the bundle. */
export const useMockApi = false;

export const environment = {
  production: true,
  useMockApi,
};
