import axios from 'axios';
import qrcode from 'qrcode-terminal';
import {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const logger = pino({ level: 'silent' });

console.log("✅ Iniciando bot...");

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log("✅ Usando versión de Baileys:", version, "última:", isLatest);

    const sock = makeWASocket({
        auth: state,
        logger,
        version,
        printQRInTerminal: true, // Asegura que el QR se muestre si es necesario
        syncFullHistory: false,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('--- ¡NUEVO CÓDIGO QR! --- Escanea con tu teléfono.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('🔌 Conexión cerrada. Reintentando:', shouldReconnect);
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado a WhatsApp');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // --- EL EVENTO CON SUPER-LOGGING ---
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log('--- 🔎 EVENTO messages.upsert RECIBIDO ---');

        const msg = messages[0];
        console.log('Contenido completo del mensaje:', JSON.stringify(msg, null, 2));

        if (!msg.message) {
            console.log('--> SALIDA: El objeto msg.message está vacío. Ignorando evento.');
            return;
        }

        const sender = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        console.log(`--> De: ${sender}`);
        console.log(`--> Texto extraído: "${messageText}"`);

        if (messageText) {
            console.log('--- ✅ El mensaje tiene texto, intentando enviar a n8n... ---');
            
            // ▼▼▼ ¡IMPORTANTE! Asegúrate de que esta sea tu URL de prueba más reciente de n8n ▼▼▼
            const n8nWebhookUrl = "PEGA_AQUÍ_TU_URL_DE_N8N_MÁS_RECIENTE";
            
            try {
                await axios.post(n8nWebhookUrl, {
                    from: sender,
                    text: messageText,
                    timestamp: msg.messageTimestamp,
                    type: type
                });
                console.log("--- 📨 ¡ÉXITO! Mensaje enviado a n8n. ---");
            } catch (error) {
                console.error("--- ❌ ¡ERROR! No se pudo enviar a n8n:", error.message);
            }
        } else {
            console.log('--- 🚫 El mensaje no tiene texto, envío a n8n omitido. ---');
        }

        if (messageText.toLowerCase() === 'hola') {
            await sock.sendMessage(sender, { text: '¡Hola! Soy tu bot de WhatsApp 🚀' });
        }
    });
}

startSock();
