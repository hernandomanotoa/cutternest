const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://backend:8000/api/v1/webhook/whatsapp';

if (!API_KEY) {
    console.error('ERROR: API_KEY environment variable is required');
    process.exit(1);
}

let sock = null;
let qrCode = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrCode = qr;
            console.log('QR Code generated. Scan with WhatsApp.');
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp connected successfully!');
            qrCode = null;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            try {
                await axios.post(WEBHOOK_URL, {
                    from: msg.key.remoteJid,
                    body: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '',
                    timestamp: msg.messageTimestamp
                }, {
                    headers: { 'X-API-Key': API_KEY }
                });
            } catch (err) {
                console.error('Webhook error:', err.message);
            }
        }
    });
}

function validateApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        connected: sock?.user ? true : false,
        qr: qrCode ? true : false
    });
});

app.post('/send', validateApiKey, async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: 'Missing to or message' });
    }

    try {
        await sock.sendMessage(to, { text: message });
        res.json({ success: true, to });
    } catch (err) {
        console.error('Send error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/qr', (req, res) => {
    if (!qrCode) {
        return res.json({ qr: null, connected: sock?.user ? true : false });
    }
    res.json({ qr: qrCode });
});

app.listen(PORT, () => {
    console.log(`WhatsApp Gateway running on port ${PORT}`);
    connectToWhatsApp();
});
