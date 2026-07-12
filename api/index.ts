import express from 'express';
import { WebhookConfig, WebhookLog } from '../src/types';

const app = express();

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage (Note: serverless environments may recycle memory)
let config: WebhookConfig = {
  verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || 'meta_verify_token_example_123',
};
let logs: WebhookLog[] = [];

// Create Router to handle both prefixed (/api/webhook) and direct (/webhook) paths perfectly
const router = express.Router();

// API: Get webhook configuration
router.get('/webhook/config', (req, res) => {
  res.json({
    ...config,
    appUrl: process.env.APP_URL || ''
  });
});

// API: Update webhook configuration
router.post('/webhook/config', (req, res) => {
  const { verifyToken } = req.body;
  if (typeof verifyToken === 'string') {
    config.verifyToken = verifyToken.trim();
    res.json({ success: true, config });
  } else {
    res.status(400).json({ error: 'verifyToken must be a string' });
  }
});

// API: Get webhook logs
router.get('/webhook/logs', (req, res) => {
  res.json(logs);
});

// API: Clear webhook logs
router.delete('/webhook/logs', (req, res) => {
  logs = [];
  res.json({ success: true });
});

// API: Trigger a mock incoming webhook (useful for testing when client can't expose a public IP yet)
router.post('/webhook/mock', (req, res) => {
  const { type, customBody, customQuery, customHeaders } = req.body;
  const logId = Math.random().toString(36).substring(2, 11);
  const timestamp = new Date().toISOString();

  if (type === 'verify') {
    const mode = customQuery?.['hub.mode'] || 'subscribe';
    const token = customQuery?.['hub.verify_token'] || config.verifyToken;
    const challenge = customQuery?.['hub.challenge'] || 'challenge_mock_12345';

    const isVerified = token === config.verifyToken;

    const mockLog: WebhookLog = {
      id: logId,
      timestamp,
      method: 'GET',
      headers: {
        'user-agent': 'Meta-Webhook-Simulator/1.0',
        'content-type': 'application/json',
        ...customHeaders
      },
      query: {
        'hub.mode': mode,
        'hub.verify_token': token,
        'hub.challenge': challenge,
        ...customQuery
      },
      body: null,
      status: isVerified ? 'verified' : 'failed',
      message: isVerified 
        ? `Verification successful! Responded with challenge: "${challenge}"`
        : `Verification failed. Token mismatch! Expected "${config.verifyToken}", but received "${token}"`,
    };

    logs.unshift(mockLog);
    res.json({ 
      success: isVerified, 
      message: mockLog.message,
      responseSent: isVerified ? challenge : 'Forbidden (403)'
    });
  } else {
    // Simulate standard webhook event
    const payload = customBody || {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550000000',
                  phone_number_id: '100000000000000'
                },
                contacts: [
                  {
                    profile: {
                      name: 'John Doe'
                    },
                    wa_id: '1234567890'
                  }
                ],
                messages: [
                  {
                    from: '1234567890',
                    id: 'wamid.HBgLMTIzNDU2Nzg5MFVJZCEyMzQ1Njc4OTBBAA==',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    text: {
                      body: 'Hello, this is a mock test message from John Doe!'
                    },
                    type: 'text'
                  }
                ]
              },
              field: 'messages'
            }
          ]
        }
      ]
    };

    const mockLog: WebhookLog = {
      id: logId,
      timestamp,
      method: 'POST',
      headers: {
        'user-agent': 'Meta-Webhook-Simulator/1.0',
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=mock_signature_for_integrity_verification_12345',
        ...customHeaders
      },
      query: customQuery || {},
      body: payload,
      status: 'received',
      message: 'Successfully received webhook event payload.',
    };

    logs.unshift(mockLog);
    res.json({ success: true, message: 'Mock event logged.' });
  }
});

// API / Webhook Endpoint: Meta / General Verification Challenge (GET)
// Handles hub.mode, hub.verify_token, hub.challenge (including dot or bracket notation)
router.get('/webhook', (req, res) => {
  console.log('Incoming GET webhook validation request:', {
    query: req.query,
    headers: req.headers
  });

  const mode = req.query['hub.mode'] || (req.query['hub'] as any)?.['mode'];
  const token = req.query['hub.verify_token'] || (req.query['hub'] as any)?.['verify_token'];
  const challenge = req.query['hub.challenge'] || (req.query['hub'] as any)?.['challenge'];

  const logId = Math.random().toString(36).substring(2, 11);
  const timestamp = new Date().toISOString();

  // Log the incoming challenge request
  const queryObj: Record<string, string> = {};
  if (req.query['hub'] && typeof req.query['hub'] === 'object') {
    const hub = req.query['hub'] as any;
    if (hub['mode']) queryObj['hub.mode'] = String(hub['mode']);
    if (hub['verify_token']) queryObj['hub.verify_token'] = String(hub['verify_token']);
    if (hub['challenge']) queryObj['hub.challenge'] = String(hub['challenge']);
  }
  Object.keys(req.query).forEach((key) => {
    if (key !== 'hub') {
      queryObj[key] = String(req.query[key]);
    } else if (!queryObj['hub.mode']) {
      queryObj[key] = String(req.query[key]);
    }
  });

  const headerObj: Record<string, string> = {};
  Object.keys(req.headers).forEach((key) => {
    headerObj[key] = String(req.headers[key]);
  });

  // Check if verification parameters are provided
  if (mode && token) {
    if (mode === 'subscribe' && token === config.verifyToken) {
      // Log successful verification
      const newLog: WebhookLog = {
        id: logId,
        timestamp,
        method: 'GET',
        headers: headerObj,
        query: queryObj,
        body: null,
        status: 'verified',
        message: `Verification successful! Responded with challenge code.`,
      };
      logs.unshift(newLog);

      console.log(`Webhook verification successful. Returning challenge: ${challenge}`);

      // Crucial: Respond with challenge as PLAIN TEXT and prevent caching
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      res.status(200).send(String(challenge));
    } else {
      // Log failed verification (token mismatch)
      const newLog: WebhookLog = {
        id: logId,
        timestamp,
        method: 'GET',
        headers: headerObj,
        query: queryObj,
        body: null,
        status: 'failed',
        message: `Verification failed. Invalid verify token provided. Expected "${config.verifyToken}", but got "${token}".`,
      };
      logs.unshift(newLog);

      console.warn(`Webhook verification failed. Token mismatch. Expected "${config.verifyToken}", but got "${token}".`);

      res.status(403).send('Forbidden (Token Mismatch)');
    }
  } else {
    // General GET query without proper hub parameters
    const newLog: WebhookLog = {
      id: logId,
      timestamp,
      method: 'GET',
      headers: headerObj,
      query: queryObj,
      body: null,
      status: 'received',
      message: 'Received GET request on webhook endpoint without standard verification parameters.',
    };
    logs.unshift(newLog);

    res.status(200).json({ status: 'ok', message: 'Webhook endpoint is active.' });
  }
});

// API / Webhook Endpoint: Receive Webhook Events (POST)
router.post('/webhook', (req, res) => {
  const logId = Math.random().toString(36).substring(2, 11);
  const timestamp = new Date().toISOString();

  const queryObj: Record<string, string> = {};
  Object.keys(req.query).forEach((key) => {
    queryObj[key] = String(req.query[key]);
  });

  const headerObj: Record<string, string> = {};
  Object.keys(req.headers).forEach((key) => {
    headerObj[key] = String(req.headers[key]);
  });

  const newLog: WebhookLog = {
    id: logId,
    timestamp,
    method: 'POST',
    headers: headerObj,
    query: queryObj,
    body: req.body,
    status: 'received',
    message: 'Incoming event payload received.',
  };

  logs.unshift(newLog);

  // Keep logs size reasonable (e.g. max 100 entries)
  if (logs.length > 100) {
    logs = logs.slice(0, 100);
  }

  // Always respond with a 200 OK to acknowledge receipt
  res.status(200).json({ success: true, receivedId: logId });
});

// Mount the Router under both /api and / to handle Vercel routing variants flawlessly
app.use('/api', router);
app.use('/', router);

export default app;
