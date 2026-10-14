/** Development against the real Laravel API (docker compose stack), through the dev-server proxy. No mock data. */
export const useMockApi = false;

export const environment = {
  production: false,
  useMockApi,
};
