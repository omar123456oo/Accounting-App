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
  docs: {
    /** Where original PDFs live. A directory outside the repository in production. */
    storageDir: process.env.DOCS_STORAGE_DIR ?? './storage/documents',
    maxUploadMb: Number(process.env.DOCS_MAX_UPLOAD_MB ?? 20),
    maxPages: Number(process.env.DOCS_MAX_PAGES ?? 200),
    /** 'anthropic' needs ANTHROPIC_API_KEY. Anything else (or no key) leaves the AI step off: text is still extracted. */
    aiProvider: process.env.DOCS_AI_PROVIDER ?? 'anthropic',
    aiKey: process.env.ANTHROPIC_API_KEY ?? '',
    aiModel: process.env.DOCS_AI_MODEL ?? 'claude-sonnet-5-5',
    aiTimeoutMs: Number(process.env.DOCS_AI_TIMEOUT_MS ?? 60_000),
    aiMaxChars: Number(process.env.DOCS_AI_MAX_CHARS ?? 60_000),
    /** When true, fields marked sensitive are not requested from the AI and long digit runs are masked in the text it receives. */
    aiRedactSensitive: process.env.DOCS_AI_REDACT_SENSITIVE === 'true',
    /** 'tesseract' turns OCR on for scanned pages; 'none' reports them as needing OCR. */
    ocrProvider: process.env.DOCS_OCR_PROVIDER ?? 'none',
    ocrLangs: process.env.DOCS_OCR_LANGS ?? 'eng+ara',
    ocrLangPath: process.env.DOCS_OCR_LANG_PATH ?? '',
    /** Runs the job worker and the reminder scheduler inside the API process. Set 'false' to run `npm run docs:tick` from cron instead. */
    schedulerOn: process.env.DOCS_SCHEDULER !== 'false',
    tickMs: Number(process.env.DOCS_TICK_MS ?? 30_000),
    /** The office's clock: "today" for expiry status, and the default timezone of new reminder rules. */
    timezone: process.env.DOCS_TIMEZONE ?? 'Africa/Cairo',
    appUrl: process.env.APP_URL ?? 'http://localhost:4200',
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Accounting Office <no-reply@localhost>',
  },
};
