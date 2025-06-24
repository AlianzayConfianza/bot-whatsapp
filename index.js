import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as fs from 'fs';
import axios from 'axios'; // ✅ Importar correctamente

console.log("✅ Iniciando bot...");

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log("✅ Usando versión de Baileys:", version, "última:", isLatest);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    version,
    syncFullHistory: false,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
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
