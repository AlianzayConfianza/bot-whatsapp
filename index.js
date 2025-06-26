const axios = require('axios');

import qrcode from 'qrcode-terminal'; // Correcto, lo necesitamos
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

// Configuración del logger para ver menos mensajes en la consola
const logger = pino({ level: 'silent' });

console.log("✅ Iniciando bot...");

async function startSock() {
  // Usamos la carpeta 'auth' para guardar la sesión
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log("✅ Usando versión de Baileys:", version, "última:", isLatest);

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
    syncFullHistory: false,
  });

  // --- ESTA ES LA ÚNICA VERSIÓN QUE NECESITAMOS DE 'connection.update' ---
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
        console.log('¡Escanea el código QR a continuación con tu teléfono!');
        // Esta línea dibujará el QR directamente en tu terminal
        qrcode.generate(qr, { small: true }); 
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
  // ----------------------------------------------------------------------

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.message) return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    // ✅ Enviar a tu flujo de n8n
    try {
      await axios.post("https://alianzayconfianza.app.n8n.cloud/webhook/b454cde0-07e1-49ee-83b3-dc3bdd371a5b", {
        from: msg.key.remoteJid,
        text: text,
        timestamp: msg.messageTimestamp,
        type: type
      });
      console.log("📨 Mensaje enviado a n8n");
    } catch (error) {
      console.error("❌ Error al enviar a n8n:", error.message);
    }

    if (text?.toLowerCase() === 'hola') {
      await sock.sendMessage(msg.key.remoteJid, { text: '¡Hola! Soy tu bot de WhatsApp 🚀' });
    }
  });
}

startSock();
