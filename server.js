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
app.post('/api/telegram-webhook-admin', async (req, res) => {
    if (bot) await bot.processUpdate(req.body);
    res.status(200).send('OK');
});

app.post('/api/telegram-webhook-driver', async (req, res) => {
    if (driverBot) await driverBot.processUpdate(req.body);
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

app.post('/api/driver/complete', async (req, res) => {
    const { orderId, driverId } = req.body;
    try {
        const { data: order } = await supabase.from('orders').select('driver_id').eq('transaction_id', orderId).single();
        if (!order || order.driver_id !== driverId) {
            return res.status(403).json({ success: false, error: 'Non autorisé' });
        }

        await supabase.from('orders').update({
            status: 'termine',
            updated_at: new Date().toISOString()
        }).eq('transaction_id', orderId);

        res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// ── LOGIQUE TELEGRAM (CALLBACKS & COMMANDES) ──
function setupTelegramHandlers(telegramBot) {
    telegramBot.on('callback_query', async (query) => {
        const data = query.data;

        // Approbation d'un nouveau livreur
        if (data.startsWith('approve_') || data.startsWith('reject_')) {
            const parts = data.split('_');
            const action = parts[0];
            const dId = parts[1];
            const dName = parts.slice(2).join(' ');

            if (!adminIds.includes(query.from.id.toString())) {
                return telegramBot.answerCallbackQuery(query.id, { text: "❌ Action réservée aux admins.", show_alert: true });
            }

            if (action === 'approve_') {
                await supabase.from('drivers').update({ active: true }).eq('id', dId);
                telegramBot.sendMessage(dId, "✅ Votre compte livreur Lemontini a été APPROUVÉ ! Tapez /livreur pour commencer.");
                telegramBot.editMessageText(`✅ Livreur *${dName}* approuvé.`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' });
            } else {
                await supabase.from('drivers').delete().eq('id', dId);
                telegramBot.editMessageText(`❌ Demande de *${dName}* refusée.`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' });
            }
            return;
        }

        // Prise en charge d'une commande (Claim)
        if (data.startsWith('claim_')) {
            const orderId = data.split('_')[1];
            const driverId = query.from.id.toString();

            const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
            if (!driver) return telegramBot.answerCallbackQuery(query.id, { text: "⚠️ Inscrivez-vous avec /inscription [Nom] [Tel]", show_alert: true });
            if (!driver.active) return telegramBot.answerCallbackQuery(query.id, { text: "⏳ En attente de validation admin.", show_alert: true });

            const { data: order } = await supabase.from('orders').select('*').eq('transaction_id', orderId).single();
            if (order.driver_id) return telegramBot.answerCallbackQuery(query.id, { text: "❌ Déjà pris par un autre livreur.", show_alert: true });

            await supabase.from('orders').update({ driver_id: driverId, status: 'livre', updated_at: new Date().toISOString() }).eq('transaction_id', orderId);

            telegramBot.editMessageText(`🟢 *EN COURS DE LIVRAISON*\n🛵 Livreur : *${driver.name}*\n📦 Commande : \`${orderId}\``, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🏁 Marquer comme livré", callback_data: `status_${orderId}_done` }]] }
            });
            return telegramBot.answerCallbackQuery(query.id, { text: "C'est parti ! 🚀" });
        }

        // ── Changements de statuts ──
        if (data.startsWith('status_')) {
            const parts = data.split('_');
            // Sécurité : dernier segment = action, tout le milieu = orderId (supporte les tirets dans l'ID)
            const action   = parts[parts.length - 1];
            const newStatus = action === 'done' ? 'termine' : action;
            const orderId  = parts.slice(1, parts.length - 1).join('_');

            // 1. Accusé de réception IMMÉDIAT (stoppe le chargement sur Telegram)
            const ackTexts = {
                confirme: '✅ Commande acceptée !',
                livre:    '🛵 En cours de livraison !',
                annule:   '❌ Commande annulée.',
                termine:  '🏁 Livraison terminée !'
            };
            // On ne fait pas de await ici pour ne pas bloquer l'exécution
            telegramBot.answerCallbackQuery(query.id, {
                text: ackTexts[newStatus] || 'Statut mis à jour'
            }).catch(e => console.error("Ack error:", e));

            // 2. Mise à jour Supabase
            await supabase.from('orders')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('transaction_id', orderId);

            // 3. Récupérer la commande fraîche depuis Supabase
            const { data: order } = await supabase.from('orders')
                .select('*').eq('transaction_id', orderId).single();

            // 4. Labels & emojis
            const statusEmoji = { confirme:'✅', livre:'🛵', termine:'🏁', annule:'❌' }[newStatus] || '📦';
            const statusLabel = {
                confirme: 'COMMANDE ACCEPTÉE',
                livre:    'EN LIVRAISON',
                termine:  'LIVRAISON TERMINÉE',
                annule:   'COMMANDE ANNULÉE'
            }[newStatus] || newStatus.toUpperCase();

            // 5. Message WhatsApp personnalisé selon le statut
            const clientName = order ? order.full_name : '';
            let waMsg = `Bonjour ${clientName} 👋,\n\n`;
            if (newStatus === 'confirme') {
                waMsg += `✅ Bonne nouvelle ! Votre commande *n°${orderId}* chez *Lemontini* est bien confirmée !\n\nNous la préparons avec soin 🌿 et vous contacterons très vite pour organiser la livraison.\n\nMerci de votre confiance 💕\n\n_Lemontini — Éclat Tropical_`;
            } else if (newStatus === 'livre') {
                waMsg += `🛵 Votre commande *n°${orderId}* est en route !\n\nNotre livreur est en cours de livraison vers chez vous. Gardez votre téléphone à portée 📱\n\nSuivez votre commande en direct ici :\nhttps://cesarshop.vercel.app/track.html?id=${orderId}\n\n_Lemontini — Éclat Tropical_`;
            } else if (newStatus === 'annule') {
                waMsg += `Nous avons le regret de vous informer que votre commande *n°${orderId}* a été annulée.\n\nN'hésitez pas à nous recontacter sur WhatsApp pour plus d'informations. Nous sommes désolés pour la gêne occasionnée 🌿\n\n_Lemontini — Éclat Tropical_`;
            } else if (newStatus === 'termine') {
                waMsg += `🎉 Votre commande *n°${orderId}* a été livrée avec succès !\n\nNous espérons que vous adorez vos produits Lemontini 💕 Merci de votre confiance !\n\nN'oubliez pas de nous laisser un avis ⭐ sur notre site :\nhttps://cesarshop.vercel.app\n\n_Lemontini — Éclat Tropical_`;
            }

            // 6. Lien WhatsApp
            let phone = order ? order.phone.replace(/[^0-9]/g, '') : '';
            if (phone.length === 10 && !phone.startsWith('225')) phone = '225' + phone;
            const waUrl = phone
                ? `https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`
                : null;

            // 7. Reconstruire le clavier dynamiquement
            // On ne propose que la suite logique
            let keyboard = [];

            if (newStatus === 'confirme') {
                keyboard.push([
                    { text: '🛵 En livraison', callback_data: `status_${orderId}_livre` },
                    { text: '❌ Annuler',      callback_data: `status_${orderId}_annule` }
                ]);
            } else if (newStatus === 'livre') {
                keyboard.push([
                    { text: '🏁 Marquer Livré', callback_data: `status_${orderId}_termine` },
                    { text: '❌ Annuler',       callback_data: `status_${orderId}_annule` }
                ]);
            }
            // Si c'est terminé ou annulé, on ne met plus de boutons d'action

            // Bouton WhatsApp personnalisé selon le statut
            if (waUrl) {
                const waLabels = {
                    confirme: '💬 WhatsApp — Commande confirmée',
                    livre:    '💬 WhatsApp — En cours de livraison',
                    annule:   '💬 WhatsApp — Informer de l\'annulation',
                    termine:  '💬 WhatsApp — Livraison terminée 🎉'
                };
                keyboard.push([{ text: waLabels[newStatus] || '💬 Envoyer un message WhatsApp', url: waUrl }]);
            }

            // 8. Reconstruire le texte du message depuis Supabase (évite les bugs Markdown)
            const items = order && order.items
                ? (typeof order.items === 'string' ? JSON.parse(order.items) : order.items)
                    .map(i => `• ${i.qty}x ${i.name}`).join('\n')
                : '—';
            const pymtLabel = { cash: '💵 Espèces', wave: '💙 Wave', orange: '🟠 Orange' }[order?.payment_type] || order?.payment_type || '—';
            const total     = order ? Number(order.total_amount).toLocaleString('fr-FR') : '?';

            const updatedMsg =
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `${statusEmoji} *${statusLabel}*\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `🆔 *Réf :* \`${orderId}\`\n` +
                `👤 *Client :* ${order?.full_name || '—'}\n` +
                `📍 *Quartier :* *${(order?.city || '—').toUpperCase()}*\n` +
                `🏠 *Lieu :* ${order?.address || '—'}\n\n` +
                `💰 *Montant :* *${total} FCFA*\n\n` +
                `📦 *Articles :*\n${items}\n\n` +
                `💳 *Paiement :* ${pymtLabel}\n` +
                `━━━━━━━━━━━━━━━━━━━━`;

            // 9. Éditer le message Telegram
            try {
                await telegramBot.editMessageText(updatedMsg, {
                    chat_id:    query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: keyboard }
                });
            } catch (err) {
                console.error('editMessageText error:', err.message);
                // Fallback : mise à jour du clavier uniquement
                try {
                    await telegramBot.editMessageReplyMarkup(
                        { inline_keyboard: keyboard },
                        { chat_id: query.message.chat.id, message_id: query.message.message_id }
                    );
                } catch (e2) { console.error('editMarkup fallback error:', e2.message); }
            }
        }
    });

    telegramBot.onText(/\/inscription (.+) (.+)/, async (msg, match) => {
        const dId = msg.from.id.toString();
        const name = match[1];
        const phone = match[2];
        await supabase.from('drivers').upsert({ id: dId, name, phone, active: false });
        telegramBot.sendMessage(msg.chat.id, "📩 *Demande envoyée !* Votre inscription est en attente de validation par l'administrateur.");
        
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

    telegramBot.onText(/\/id/, (msg) => {
        telegramBot.sendMessage(msg.chat.id, `👤 Votre ID : \`${msg.from.id}\``, { parse_mode: 'Markdown' });
    });

    telegramBot.onText(/^\/livreur/, (msg) => {
        const webAppUrl = `https://${process.env.VERCEL_URL || 'localhost:3000'}/driver_app.html`;
        telegramBot.sendMessage(msg.chat.id, "📦 *Espace Livreur Lemontini*", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Ouvrir mon Espace", web_app: { url: webAppUrl } }]] }
        });
    });
}

if (bot) setupTelegramHandlers(bot);
if (driverBot && driverBot !== bot) setupTelegramHandlers(driverBot);


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
            await (driverBot || bot).sendMessage(driverChatId, msg, { parse_mode: 'Markdown' });
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
            
            const baseMsg = `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🚨 *NOUVELLE COMMANDE !* 🚨\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 *Réf :* \`${order.transactionId}\` \n` +
                        `📍 *QUARTIER :* *${order.city.toUpperCase()}*\n` +
                        `🏠 *LIEU :* ${order.address}\n\n` +
                        `💰 *MONTANT :* *${Number(order.totalAmount).toLocaleString('fr-FR')} FCFA*\n\n` +
                        `📦 *ARTICLES :*\n${itemsList}\n\n` +
                        `💳 *PAIEMENT :* ${paymentTypeMsg}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n`;

            // 1. Message pour le groupe ADMIN (Commandes)
            await bot.sendMessage(chatId, baseMsg + `_🔔 Notification Admin_`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: '✅ Accepté', callback_data: `status_${order.transactionId}_confirme` },
                          { text: '🛵 En livraison', callback_data: `status_${order.transactionId}_livre` } ],
                        [ { text: '🏁 Marquer Livré', callback_data: `status_${order.transactionId}_termine` },
                          { text: '❌ Annuler', callback_data: `status_${order.transactionId}_annule` } ]
                    ]
                }
            }).catch(err => console.error("Telegram admin error:", err));

            // 2. Message pour le groupe LIVREURS (si différent ou configuré)
            if (driverBot && driverChatId) {
                await driverBot.sendMessage(driverChatId, baseMsg + `👇 _Livreurs, cliquez ci-dessous pour prendre la course_`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [ { text: '🛵 JE M\'EN OCCUPE !', callback_data: `claim_${order.transactionId}` } ]
                        ]
                    }
                }).catch(err => console.error("Telegram driver error:", err));
            }
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
        botToken: !!process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
        driverBotToken: !!process.env.TELEGRAM_DRIVER_BOT_TOKEN,
        driverChatId: process.env.TELEGRAM_DRIVER_CHAT_ID,
        botInstance: !!bot,
        driverBotInstance: !!driverBot,
        node_env: process.env.NODE_ENV
    });
});
