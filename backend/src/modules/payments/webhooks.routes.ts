import express, { Router, type Request, type Response } from 'express';
import { constructWebhookEvent } from '../../integrations/stripe';
import { handleStripeEvent } from './payments.service';
import { logger } from '../../config/logger';

export const webhooksRouter = Router();

/**
 * Stripe webhook. Signature verification needs the RAW request body, so this
 * route uses express.raw — it must be mounted BEFORE the global JSON parser
 * (see app.ts), or registered with its own raw parser as done here.
 */
webhooksRouter.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      return res.status(400).send('Missing stripe-signature header');
    }
    try {
      const event = constructWebhookEvent(req.body as Buffer, signature);
      await handleStripeEvent(event);
      res.json({ received: true });
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook rejected');
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }
  },
);
