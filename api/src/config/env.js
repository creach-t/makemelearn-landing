'use strict';

const { z } = require('zod');

const bool = (def) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === true || v === 'true' || v === '1'));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.string().optional(),
    DATABASE_URL: z.string().min(1).optional(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET doit faire au moins 32 caractères').optional(),
    APP_URL: z.string().url().optional(),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    CORS_ORIGIN: z.string().optional(),
    COOKIE_SECURE: bool(undefined),
    MAINTENANCE_TOKEN: z.string().optional(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_GAME_MAX: z.coerce.number().int().positive().default(600),
    RATE_LIMIT_CONTACT: z.coerce.number().int().positive().default(5),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    FROM_EMAIL: z.string().optional(), // ancien nom
    CONTACT_TO: z.string().optional(),
    TO_EMAIL: z.string().optional(), // ancien nom
    CONTENT_DIR: z.string().optional(),
    STATIC_DIR: z.string().optional(), // dossier du site statique servi par l'app (image Docker : /app/public)
    SYNC_CONTENT: bool(true),
    // true : les univers `draft` (statut « relecture ») sont listés et jouables avec un indicateur beta:true
    SHOW_DRAFT_UNIVERSES: bool(false)
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const key of ['DATABASE_URL', 'SESSION_SECRET']) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} est obligatoire en production` });
        }
      }
    }
  })
  .transform((env) => ({
    ...env,
    APP_URL: (env.APP_URL || (env.NODE_ENV === 'production' ? 'https://makemelearn.fr' : `http://localhost:${env.PORT}`)).replace(/\/+$/, ''),
    COOKIE_SECURE: env.COOKIE_SECURE === undefined ? env.NODE_ENV !== 'development' : env.COOKIE_SECURE,
    MAIL_FROM: env.MAIL_FROM || env.FROM_EMAIL || 'no-reply@makemelearn.fr',
    CONTACT_TO: env.CONTACT_TO || env.TO_EMAIL || 'hello@makemelearn.fr',
    // Secret de repli non-production uniquement (jamais utilisé en prod : superRefine l'exige)
    SESSION_SECRET: env.SESSION_SECRET || 'dev-only-insecure-secret-do-not-use-in-prod!!'
  }));

// loadEnv(process.env) lève une Error lisible si la configuration est invalide.
function loadEnv(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Configuration invalide : ${msg}`);
  }
  return result.data;
}

module.exports = { loadEnv };
