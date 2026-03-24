import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, runTransaction, getDoc, updateDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

// --- KONFIGURASI TELEGRAM BOT ---
const BOT_TOKEN = "8659828786:AAGvN2hYGOBVvytFULdb7_v_hOCFDGOO7VA"; // Token Bot Admin Webhook
const NOTIF_BOT_TOKEN = "7507761189:AAGUCYltzj_IMuDRgjUzUPiZDz4nbVXvOME"; // Token Bot Notif Grup
const NOTIF_GROUP_ID = "-1002997407612";
const TOPIC_TOPUP_ID = "7";

// --- KONFIGURASI FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDYj0BA6cZDUxNBA7lmxBoXzah7H4y8yu4",
  authDomain: "pandawa-store.firebaseapp.com",
  projectId: "pandawa-store",
  storageBucket: "pandawa-store.firebasestorage.app",
  messagingSenderId: "974440930132",
  appId: "1:974440930132:web:57fcb857cfd5ac51b386c1"
};

const app = getApps().find(a => a.name === "PandawaBot") || initializeApp(firebaseConfig, "PandawaBot");
const db = getFirestore(app);
const auth = getAuth(app);

// Fungsi pembantu balas loading
async function answerCallback(callbackQueryId, text, showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text, show_alert: showAlert })
    });
  } catch (e) { console.error(e); }
}

// FUNGSI BARU: KIRIM NOTIF KE GRUP TOPIC 7
async function sendGroupNotification(nominal, username, trxId) {
    try {
        const now = new Date();
        const wib = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        const months = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
        const timeStr = `${wib.getUTCDate()} ${months[wib.getUTCMonth()]} ${wib.getUTCFullYear()} | ${wib.getUTCHours().toString().padStart(2,'0')}.${wib.getUTCMinutes().toString().padStart(2,'0')}.${wib.getUTCSeconds().toString().padStart(2,'0')}`;

        const text = `*✅ DEPOSIT BERHASIL*\n━━━━━━━━━━━━━━━━━━\n💳 Jumlah : Rp${new Intl.NumberFormat('id-ID').format(nominal)}\n🕒 Waktu : ${timeStr}\n👤 User ID : ${username}\n📌 Status : Berhasil\n🆔 ID Transaksi : ${trxId}\n━━━━━━━━━━━━━━━━━━\n✨ Deposit berhasil diproses ke akun Anda.\nTerima kasih telah menggunakan layanan kami.\nwww.pandawa-digital.com`;

        await fetch(`https://api.telegram.org/bot${NOTIF_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: NOTIF_GROUP_ID,
                message_thread_id: TOPIC_TOPUP_ID,
                text: text,
                parse_mode: "Markdown"
            })
        });
    } catch (e) { console.error("Notif Error", e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    try {
      await signInWithEmailAndPassword(auth, "doni888855519@gmail.com", "wasalamL050");
    } catch (authError) {
      return res.status(500).send('Error Auth Firebase');
    }

    const body = req.body;

    // FITUR 1: BALAS CHAT CS (REPLY MESSAGE)
    if (body.message && body.message.reply_to_message && body.message.text) {
      const adminName = "Admin Pandawa"; 
      const replyText = body.message.text;
      const originalText = body.message.reply_to_message.text || "";
      const chatId = body.message.chat.id; 

      let refId = ""; let originalName = "User"; let originalMsg = "Pesan";

      const matchNama = originalText.match(/Nama:\s*([^\n]+)/);
      const matchRefId = originalText.match(/RefID:\s*([^\n]+)/);
      if (matchNama) originalName = matchNama[1].trim();
      if (matchRefId) refId = matchRefId[1].trim();

      if (originalText.includes("💬 Pesan:")) {
          originalMsg = originalText.split("💬 Pesan:")[1].trim();
      } else if (originalText.includes("Pesan:")) {
          originalMsg = originalText.split("Pesan:")[1].trim();
      }

      const chatData = {
        id: "msg_" + Date.now(), uid: "ADMIN", nama: adminName, pesan: replyText,
        timestamp: Date.now(), role: "admin",
        reply_to: { id: refId, name: originalName, text: originalMsg.substring(0, 60) + (originalMsg.length > 60 ? '...' : '') }
      };

      const roomRef = doc(db, 'chat_public', 'room_global');
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        let msgsArr = docSnap.exists() ? (docSnap.data().messages || []) : [];
        msgsArr.push(chatData);
        if (msgsArr.length > 40) msgsArr = msgsArr.slice(msgsArr.length - 40);
        transaction.set(roomRef, { messages: msgsArr }, { merge: true });
      });

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: "✅ <b>Balasan Terkirim ke Web!</b>", parse_mode: "HTML", reply_to_message_id: body.message.message_id })
      });
      return res.status(200).send('OK');
    }

    // FITUR 2: TOMBOL TERIMA/TOLAK TOPUP
    if (body.callback_query) {
      const cb = body.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const originalText = cb.message.text || "";

      if (data && (data.startsWith('A_') || data.startsWith('R_'))) {
        const parts = data.split('_');
        const action = parts[0]; 
        const docId = parts[1];
        const uid = parts[2];

        try {
          const trxRef = doc(db, "users", uid, "riwayat_transaksi", docId);
          const trxSnap = await getDoc(trxRef);
          
          if (!trxSnap.exists()) {
            await answerCallback(cb.id, "❌ Error: Data tidak ditemukan!", true);
            return res.status(200).send('OK: Not Found');
          }

          const trxData = trxSnap.data();
          if (trxData.status !== 'PENDING') {
            await answerCallback(cb.id, "⚠️ Transaksi ini sudah diproses!", true);
            return res.status(200).send('OK: Done');
          }

          let updatedText = originalText;

          if (action === 'A') {
            const nominal = trxData.harga;
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);
            const currentSaldo = userSnap.exists() ? (userSnap.data().saldo || 0) : 0;
            const newSaldo = currentSaldo + nominal;

            await updateDoc(userRef, { saldo: newSaldo });
            await updateDoc(trxRef, { status: "BERHASIL", sn: "Topup Berhasil (Via Bot Telegram)" });

            try {
              await fetch('https://pandawa-digital.com/doniguard.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: uid, action: 'topup', nominal: nominal, trx_id: trxData.trx_id || docId, produk: 'TOPUP MANUAL VALIDASI BOT', saldo_akhir_client: newSaldo })
              });
            } catch(dgError) {}

            // TRIGGER NOTIFIKASI TELEGRAM OTOMATIS
            const username = userSnap.exists() ? (userSnap.data().username || userSnap.data().nama || "User") : "User";
            await sendGroupNotification(nominal, username, trxData.trx_id || docId);

            updatedText += `\n\n✅ *STATUS: TOPUP DISETUJUI*\n💸 Saldo Masuk: Rp ${new Intl.NumberFormat('id-ID').format(nominal)}`;
            await answerCallback(cb.id, `✅ Topup Rp ${new Intl.NumberFormat('id-ID').format(nominal)} Disetujui!`, false);

          } else if (action === 'R') {
            await updateDoc(trxRef, { status: "GAGAL", sn: "Ditolak via Bot Telegram" });
            updatedText += `\n\n❌ *STATUS: TOPUP DITOLAK*`;
            await answerCallback(cb.id, "❌ Topup telah ditolak!", false);
          }

          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: updatedText, parse_mode: "Markdown" })
          });
          return res.status(200).send('OK');

        } catch (trxError) {
          await answerCallback(cb.id, "❌ Terjadi kesalahan pada server Firebase.", true);
          return res.status(200).send('OK');
        }
      }
    }
    return res.status(200).send('OK');
  } catch (error) {
    return res.status(500).send('Error');
  }
}
