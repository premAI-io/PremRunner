import { Hono } from 'hono';
import { openAPISpecs } from 'hono-openapi';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { verify } from 'hono/jwt';
import { logger } from 'hono/logger';
import { AlgorithmTypes } from 'hono/utils/jwt/jwa';

import { clerkMiddleware, getAuth } from '@hono/clerk-auth';
import { swaggerUI } from '@hono/swagger-ui';

import { CronJob } from 'cron';
import { eq, sql } from 'drizzle-orm';

import adminApp from './api/admin/app';
import apiKeysApp from './api/apiKeys/app';
import bitgptApp from './api/bitgpt/app';
import chatApp from './api/chat/app';
import datasetsApp from './api/datasets/app';
import {
	cleanupOldTempDownloads,
	cleanupStaleDataAugmentationProcesses
} from './api/datasets/utils';
import embeddingsApp from './api/embeddings/app';
import evaluationsApp from './api/evaluations/app';
import finetuningApp from './api/finetuning/app';
import { updateFineTuningTask, updateInferenceTask } from './api/finetuning/utils';
import internalApp from './api/internal/app';
import metricsApp from './api/metrics/app';
import modelsApp from './api/models/app';
import notificationsApp from './api/notifications/app';
import playgroundApp from './api/playground/app';
import stripeApp from './api/stripe/app';
import tokenizeApp from './api/tokenize/app';
import userApp from './api/user/app';
import authApp, { verifyToken } from './auth';
import config from './config';
import { db } from './db/config';
import { apiKeys, userMeta } from './db/schema';
import { hash } from './utils';
import { requestQuotaLimiter } from './utils/requestQuotaLimiter';

//TODO: rename bearer to x-api-key when using api keys
const authMiddleware = createMiddleware(async (c, next) => {
	const token = c.req.header('Authorization')?.replace('Bearer ', '');

	if (!token) {
		const auth = getAuth(c);
		if (!auth || !auth.userId) return c.json({ error: 'Unauthorized' }, 401);
		c.set('userId', auth.userId);
		c.set('authType', 'app');
	} else {
		if (token.startsWith(config.API_KEY_PREFIX)) {
			const apiKey = await db.query.apiKeys.findFirst({
				where: eq(apiKeys.hashedKey, hash(token))
			});
			if (!apiKey) return c.json({ error: 'Unauthorized' }, 401);
			c.set('userId', apiKey.userId);
			c.set('authType', 'token');
		} else if (token.split('.').length === 3) {
			// check if it is a jwt token
			try {
				const verifiedPayload = await verify(
					token,
					config.KRISHNA_PUBLIC_KEY,
					config.KRISHNA_ALGORITHM as AlgorithmTypes
				);
				if (!verifiedPayload.sub) {
					return c.json({ error: 'Unauthorized' }, 401);
				}
				c.set('userId', verifiedPayload.sub as string);
				c.set('authType', 'token');
			} catch (error) {
				return c.json({ error: (error as Error).message }, 401);
			}
		} else if (config.SELF_HOSTED) {
			try {
				const decoded = await verifyToken(token);
				c.set('userId', decoded.userId as string);
				c.set('authType', 'app');
			} catch (error) {
				return c.json({ error: (error as Error).message }, 401);
			}
		} else {
			return c.json({ error: 'Unauthorized' }, 401);
		}
	}

	await next();
});

const internalAuthMiddleware = createMiddleware(async (c, next) => {
	const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
	if (!apiKey || apiKey !== config.INTERNAL_API_KEY) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

const internalChatMiddleware = createMiddleware(async (c, next) => {
	const userId = c.req.header('x-user-id');
	const completionTask = c.req.header('x-completion-task');
	if (!userId || !completionTask) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	c.set('userId', userId);
	c.set('authType', 'internal');
	c.set('completionTask', completionTask);
	await next();
});

const adminAuthMiddleware = createMiddleware(async (c, next) => {
	const userId = c.get('userId');
	const meta = await db.query.userMeta.findFirst({
		where: eq(userMeta.userId, userId)
	});
	const isAdmin = meta?.isAdmin ?? false;
	if (!isAdmin) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

const app = new Hono()
	.use('/api/*', cors(), logger())
	.use('/api/v1/*', clerkMiddleware(), authMiddleware)
	.use('/api/v1/admin/*', adminAuthMiddleware)
	.use('/api/v1/chat/completions', requestQuotaLimiter('llmRequests'))
	.use('/api/v1/finetuning/create', requestQuotaLimiter('fineTuningExperiments'))
	.use('/api/v1/datasets/create', requestQuotaLimiter('datasets'))
	.route('/api/v1/apiKeys', apiKeysApp)
	.route('/api/v1/finetuning', finetuningApp)
	.route('/api/v1/datasets', datasetsApp)
	.route('/api/v1/evaluations', evaluationsApp)
	.route('/api/v1/metrics', metricsApp)
	.route('/api/v1/playground', playgroundApp)
	.route('/api/v1/chat', chatApp)
	.route('/api/v1/user', userApp)
	.route('/api/v1/models', modelsApp)
	.route('/api/v1/notifications', notificationsApp)
	.route('/api/v1/admin', adminApp);

app
	.use('/api/internal/*', internalAuthMiddleware)
	.use('/api/internal/chat/completions', internalChatMiddleware, requestQuotaLimiter('llmRequests'))
	.route('/api/internal', internalApp)
	.route('/api/internal/tokenize', tokenizeApp)
	.route('/api/internal/embeddings', embeddingsApp)
	.route('/api/internal/chat', chatApp);

app
	.use('/api/auth/*', cors(), logger())
	.use('/api/auth/add-amazon-account', clerkMiddleware(), authMiddleware)
	.route('/api/auth', authApp);

// Add root health endpoint for docker health checks
app.get('/health', (c) => c.json({ status: 'ok' }));

// Stripe routes (no authentication required for webhooks)
app.use('/api/webhooks/stripe', cors(), logger()).route('/api/webhooks/stripe', stripeApp);

// BitGPT routes (no authentication required for webhooks)
app.use('/api/webhooks/bitgpt', cors(), logger()).route('/api/webhooks/bitgpt', bitgptApp);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.get(
	'/api/openapi.json',
	openAPISpecs(app, {
		documentation: {
			info: {
				title: 'Prem Studio API',
				version: '0.0.1',
				description: 'Studio autofinetuning agent API'
			},
			servers: [
				{
					url: 'https://studio.premai.io',
					description: 'Production server'
				}
			],
			components: {
				securitySchemes: {
					bearerAuth: {
						type: 'http',
						scheme: 'bearer',
						bearerFormat: 'JWT'
					}
				}
			},
			security: [{ bearerAuth: [] }]
		}
	})
);

app.get('/api/ui', swaggerUI({ url: '/api/openapi.json' }));

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message }, err.status);
	}
	console.error(err);
	return c.json({ error: 'Internal server error' }, 500);
});

CronJob.from({
	cronTime: '0,20,40 * * * * *', // Run every 20 seconds starting at 0 (0, 20, 40 seconds)
	onTick: function () {
		console.log(`${new Date().toISOString()} Running updateFineTuningTask`);
		updateFineTuningTask().catch((error) => {
			console.error('Error updateFineTuningTask:', error);
		});
	},
	waitForCompletion: true,
	start: true,
	timeZone: 'UTC'
});

CronJob.from({
	cronTime: '10,30,50 * * * * *', // Run every 20 seconds starting at 10 (10, 30, 50 seconds)
	onTick: function () {
		console.log(`${new Date().toISOString()} Running updateInferenceTask`);
		updateInferenceTask().catch((error) => {
			console.error('Error updateInferenceTask:', error);
		});
	},
	waitForCompletion: true,
	start: true,
	timeZone: 'UTC'
});

// Data augmentation cleanup job - runs every hour
CronJob.from({
	cronTime: '0 0 * * * *', // Run every hour at the start of the hour
	onTick: function () {
		console.log(`${new Date().toISOString()} Running data augmentation cleanup`);
		cleanupStaleDataAugmentationProcesses().catch((error) => {
			console.error('Error in data augmentation cleanup:', error);
		});
	},
	waitForCompletion: true,
	start: true,
	timeZone: 'UTC'
});

// Temp downloads cleanup job - runs daily
CronJob.from({
	cronTime: '0 2 * * * *',
	onTick: function () {
		console.log(`${new Date().toISOString()} Running temp downloads cleanup`);
		cleanupOldTempDownloads().catch((error) => {
			console.error('Error in temp downloads cleanup:', error);
		});
	},
	waitForCompletion: true,
	start: true,
	timeZone: 'UTC'
});

export type AppType = typeof app;

if (config.SELF_HOSTED) {
	const user = await db.query.users.findFirst();

	if (!user) {
		console.warn('no user found, create a user to use the platform');
	}
	console.log('running app in self hosted mode');
}
export default app;
