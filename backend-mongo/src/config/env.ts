import 'dotenv/config';

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongoUri: required('MONGODB_URI'),
  registrationOpen: (process.env.REGISTRATION_OPEN ?? 'true') === 'true',
  /** Server scripts run only while this is not 'false'. A switch for incidents. */
  scriptsEnabled: process.env.SCRIPTS_ENABLED !== 'false',
  autoIndex: (process.env.MONGODB_AUTO_INDEX ?? 'true') === 'true',
};
