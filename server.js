const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());

// Middleware pour lire le JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lemontini2025";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "lemontini_super_secret_token";

// Initialisation Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const requireAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.split(' ')[1] === ADMIN_API_TOKEN) {
        next();
    } else {
        res.status(401).json({ error: 'Non autorisé' });
    }
};

// Utils mapping Supabase -> Frontend
const mapOrder = (row) => {
    let order = {
        transactionId: row.transaction_id,
        fullName: row.full_name,
        phone: row.phone,
        city: row.city,
        address: row.address,
        instructions: row.instructions,
        totalAmount: row.total_amount,
        paymentType: row.payment_type,
        status: row.status,
        items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
    if (row.driver_id && row.drivers) {
        let drv = Array.isArray(row.drivers) ? row.drivers[0] : row.drivers;
        if (drv) {
            order.driver = { id: row.driver_id, name: drv.name, phone: drv.phone };
        }
    }
    return order;
};

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: ADMIN_API_TOKEN });
    } else {
        res.json({ success: false });
    }
});

app.use(express.static(path.join(__dirname)));

// ── WAVE API ──
app.post('/api/create-wave-session', async (req, res) => {
    try {
        const { amount, currency, success_url, error_url, client_reference } = req.body;
        const WAVE_API_KEY = process.env.WAVE_API_KEY || 'wave_ci_prod_votre_cle_secrete';

        const response = await fetch('https://api.wave.com/v1/checkout/sessions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WAVE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount.toString(), currency, success_url, error_url, client_reference })
        });
        res.json(await response.json());
    } catch(err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.post('/api/wave-webhook', (req, res) => {
    res.status(200).send('OK');
});

// ── INITIALISATION TELEGRAM BOTS ──
const chatId = process.env.TELEGRAM_CHAT_ID;
const driverChatId = process.env.TELEGRAM_DRIVER_CHAT_ID || chatId;
const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "").split(',').map(id => id.trim());

let bot = null; // Bot Admin (Annonces, Gestion)
let driverBot = null; // Bot Livreur (Missions, Livreurs)

const isVercel = !!process.env.VERCEL;

if (process.env.TELEGRAM_BOT_TOKEN) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: !isVercel });
    console.log("🤖 Bot Admin activé " + (isVercel ? "(Webhook)" : "(Polling)"));
}

if (process.env.TELEGRAM_DRIVER_BOT_TOKEN) {
    driverBot = new TelegramBot(process.env.TELEGRAM_DRIVER_BOT_TOKEN, { polling: !isVercel });
    console.log("🤖 Bot Livreur activé " + (isVercel ? "(Webhook)" : "(Polling)"));
}

const activeBot = driverBot || bot;

if (isVercel) {
    const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'lemontini.vercel.app';
    if (bot) bot.setWebHook(`https://${domain}/api/telegram-webhook-admin`);
    if (driverBot) driverBot.setWebHook(`https://${domain}/api/telegram-webhook-driver`);
}

// Routes express pour les webhooks Telegram (uniquement utiles sur Vercel)
app.post('/api/telegram-webhook-admin', (req, res) => {
    if (bot) bot.processUpdate(req.body);
    res.status(200).send('OK');
});

app.post('/api/telegram-webhook-driver', (req, res) => {
    if (driverBot) driverBot.processUpdate(req.body);
    res.status(200).send('OK');
});

// ── API LIVREUR ──
app.get('/api/driver/auth', async (req, res) => {
    const { id } = req.query;
    try {
        const { data, error } = await supabase.from('drivers').select('*').eq('id', id).single();
        if (data && !error) return res.json({ success: true, driver: data });
        res.json({ success: false });
    } catch(e) { res.json({ success: false }); }
});

app.get('/api/orders/all', async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*, drivers(*)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data.map(mapOrder));
    } catch(e) { res.json([]); }
});

app.post('/api/driver/claim', async (req, res) => {
    const { orderId, driverId } = req.body;
    try {
        const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
        if (!driver || !driver.active) {
            return res.status(403).json({ success: false, error: 'Compte non activé' });
        }

        const { data: order } = await supabase.from('orders').select('driver_id').eq('transaction_id', orderId).single();
        if (!order || order.driver_id) return res.status(400).json({ success: false, error: 'Déjà pris' });

        await supabase.from('orders').update({
            driver_id: driverId,
            status: 'livre',
            updated_at: new Date().toISOString()
        }).eq('transaction_id', orderId);

        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// ── LOGIQUE TELEGRAM (CALLBACKS & COMMANDES) ──
if (activeBot) {
    activeBot.on('callback_query', async (query) => {
        const data = query.data;

        // Approbation d'un nouveau livreur
        if (data.startsWith('approve_') || data.startsWith('reject_')) {
            const parts = data.split('_');
            const action = parts[0];
            const dId = parts[1];
            const dName = parts.slice(2).join(' ');

            if (!adminIds.includes(query.from.id.toString())) {
                return activeBot.answerCallbackQuery(query.id, { text: "❌ Action réservée aux admins.", show_alert: true });
            }

            if (action === 'approve_') {
                await supabase.from('drivers').update({ active: true }).eq('id', dId);
                activeBot.sendMessage(dId, "✅ Votre compte livreur Lemontini a été APPROUVÉ ! Tapez /livreur pour commencer.");
                activeBot.editMessageText(`✅ Livreur *${dName}* approuvé.`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' });
            } else {
                await supabase.from('drivers').delete().eq('id', dId);
                activeBot.editMessageText(`❌ Demande de *${dName}* refusée.`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' });
            }
            return;
        }

        // Prise en charge d'une commande (Claim)
        if (data.startsWith('claim_')) {
            const orderId = data.split('_')[1];
            const driverId = query.from.id.toString();

            const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
            if (!driver) return activeBot.answerCallbackQuery(query.id, { text: "⚠️ Inscrivez-vous avec /inscription [Nom] [Tel]", show_alert: true });
            if (!driver.active) return activeBot.answerCallbackQuery(query.id, { text: "⏳ En attente de validation admin.", show_alert: true });

            const { data: order } = await supabase.from('orders').select('*').eq('transaction_id', orderId).single();
            if (order.driver_id) return activeBot.answerCallbackQuery(query.id, { text: "❌ Déjà pris par un autre livreur.", show_alert: true });

            await supabase.from('orders').update({ driver_id: driverId, status: 'livre', updated_at: new Date().toISOString() }).eq('transaction_id', orderId);

            activeBot.editMessageText(`🟢 *EN COURS DE LIVRAISON*\n🛵 Livreur : *${driver.name}*\n📦 Commande : \`${orderId}\``, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🏁 Marquer comme livré", callback_data: `status_${orderId}_done` }]] }
            });
            return activeBot.answerCallbackQuery(query.id, { text: "C'est parti ! 🚀" });
        }

        // Changements de statuts divers
        if (data.startsWith('status_')) {
            const parts = data.split('_');
            const orderId = parts[1];
            const newStatus = parts[2] === 'done' ? 'termine' : parts[2];
            
            await supabase.from('orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('transaction_id', orderId);
            activeBot.answerCallbackQuery(query.id, { text: `Statut mis à jour : ${newStatus}` });
            
            if (newStatus === 'termine') {
                activeBot.editMessageText(`🏁 *LIVRAISON TERMINÉE*\n📦 Commande : \`${orderId}\`\n💰 Paiement encaissé. Merci !`, {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                });
            }
        }
    });

    activeBot.onText(/\/inscription (.+) (.+)/, async (msg, match) => {
        const dId = msg.from.id.toString();
        const name = match[1];
        const phone = match[2];
        await supabase.from('drivers').upsert({ id: dId, name, phone, active: false });
        activeBot.sendMessage(msg.chat.id, "📩 *Demande envoyée !* Votre inscription est en attente de validation par l'administrateur.");
        
        if (bot && chatId) {
            bot.sendMessage(chatId, `🔔 *NOUVEAU LIVREUR*\n👤 Nom : ${name}\n📞 Tel : ${phone}\n🆔 ID : \`${dId}\``, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ APPROUVER', callback_data: `approve_${dId}_${name}` },
                        { text: '❌ REFUSER', callback_data: `reject_${dId}_${name}` }
                    ]]
                }
            });
        }
    });

    activeBot.onText(/\/id/, (msg) => {
        activeBot.sendMessage(msg.chat.id, `👤 Votre ID : \`${msg.from.id}\``, { parse_mode: 'Markdown' });
    });

    activeBot.onText(/^\/livreur/, (msg) => {
        const webAppUrl = `https://${process.env.VERCEL_URL || 'localhost:3000'}/driver_app.html`;
        activeBot.sendMessage(msg.chat.id, "📦 *Espace Livreur Lemontini*", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Ouvrir mon Espace", web_app: { url: webAppUrl } }]] }
        });
    });
}

// ── API BOUTIQUE / ADMIN ──
app.get('/api/orders/track/:id', async (req, res) => {
    try {
        const { data: order } = await supabase.from('orders').select('*, drivers(*)').eq('transaction_id', req.params.id).single();
        if (!order) return res.status(404).json({ error: 'Commande introuvable' });
        
        const safeOrder = mapOrder(order);
        res.json({
            transactionId: safeOrder.transactionId,
            status: safeOrder.status,
            createdAt: safeOrder.createdAt,
            totalAmount: safeOrder.totalAmount,
            driver: safeOrder.driver || null
        });
    } catch(err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/orders', requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*, drivers(*)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data.map(mapOrder));
    } catch(err) { res.json([]); }
});

app.get('/api/reviews', async (req, res) => {
    try {
        const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
        res.json(data || []);
    } catch(e) { res.json([]); }
});

app.post('/api/reviews', async (req, res) => {
    try {
        const review = req.body;
        await supabase.from('reviews').insert({
            author: review.author,
            rating: review.rating,
            product: review.product,
            comment: review.comment
        });
        
        if (bot && chatId) {
            const starText = "⭐".repeat(review.rating);
            const msg = `🌟 *NOUVEL AVIS REÇU !*\n\n👤 *Auteur :* ${review.author}\n⭐ *Note :* ${starText}\n📦 *Produit :* ${review.product}\n💬 *Commentaire :*\n"${review.comment}"`;
            (driverBot || bot).sendMessage(driverChatId, msg, { parse_mode: 'Markdown' });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).send("Error"); }
});

app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await supabase.from('orders').update({
            status,
            updated_at: new Date().toISOString()
        }).eq('transaction_id', id);
        
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const order = req.body;
        
        await supabase.from('orders').insert({
            transaction_id: order.transactionId,
            full_name: order.fullName,
            phone: order.phone,
            city: order.city,
            address: order.address,
            instructions: order.instructions || '',
            total_amount: order.totalAmount,
            payment_type: order.paymentType,
            status: 'nouveau',
            items: order.items || []
        });

        if (bot && chatId) {
            const itemsList = (order.items||[]).map(i => `• ${i.qty}x ${i.name}`).join('\n');
            const paymentTypeMsg = order.paymentType === 'cash' ? '💵 Espèces' : order.paymentType === 'wave' ? '💙 Wave' : '🟠 Orange';
            
            const msg = `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🚨 *NOUVELLE COMMANDE !* 🚨\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 *Réf :* \`${order.transactionId}\` \n` +
                        `📍 *QUARTIER :* *${order.city.toUpperCase()}*\n` +
                        `🏠 *LIEU :* ${order.address}\n\n` +
                        `💰 *MONTANT :* *${Number(order.totalAmount).toLocaleString('fr-FR')} FCFA*\n\n` +
                        `📦 *ARTICLES :*\n${itemsList}\n\n` +
                        `💳 *PAIEMENT :* ${paymentTypeMsg}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `👇 _Livreurs, cliquez ci-dessous pour prendre la course_`;
                        
            (driverBot || bot).sendMessage(driverChatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🛵 JE M\'EN OCCUPE !', callback_data: `claim_${order.transactionId}` }
                        ],
                        [
                            { text: '⚙️ Gérer (Admin Only)', callback_data: `status_${order.transactionId}_confirme` }
                        ]
                    ]
                }
            }).catch(err => console.error("Telegram error:", err));
        }

        res.json({ success: true, orderId: order.transactionId });
    } catch(err) {
        console.error('Erreur sauvegarde:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Le serveur e-commerce avec SUPABASE est DÉMARRÉ sur http://localhost:${PORT}`);
    });
}

module.exports = app;

app.get('/api/debug-env', (req, res) => {
    res.json({
        vercel: process.env.VERCEL,
        botToken: process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'MISSING',
        chatId: process.env.TELEGRAM_CHAT_ID ? 'SET' : 'MISSING'
    });
});
