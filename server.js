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

app.use(express.static(__dirname));

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
        const { data: order } = await supabase.from('orders').select('driver_id').eq('transaction_id', orderId).single();
        if (!order || order.driver_id) return res.status(400).json({ success: false });
        
        const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
        if (!driver) return res.status(404).json({ success: false });

        const { error } = await supabase.from('orders').update({
            driver_id: driverId,
            status: 'livre',
            updated_at: new Date().toISOString()
        }).eq('transaction_id', orderId);

        if (error) throw error;
        
        if (bot && chatId) {
            bot.sendMessage(chatId, `✅ *${driver.name}* a pris la commande \`${orderId}\` via l'interface web.`, { parse_mode: 'Markdown' });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/api/driver/complete', async (req, res) => {
    const { orderId, driverId } = req.body;
    try {
        const { data: order } = await supabase.from('orders').select('driver_id').eq('transaction_id', orderId).single();
        if (!order || order.driver_id !== driverId) return res.status(400).json({ success: false });

        await supabase.from('orders').update({
            status: 'termine',
            updated_at: new Date().toISOString()
        }).eq('transaction_id', orderId);
        
        const { data: driver } = await supabase.from('drivers').select('name').eq('id', driverId).single();

        if (bot && chatId && driver) {
            bot.sendMessage(chatId, `🏁 Commande \`${orderId}\` livrée par *${driver.name}* !`, { parse_mode: 'Markdown' });
        }
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});


// === TELEGRAM BOT INIT ===
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "").split(',').map(id => id.trim());
let bot = null;

if (token) {
    bot = new TelegramBot(token, {polling: true});
    bot.getMe().then(me => console.log(`🤖 Bot @${me.username} activé (ID: ${me.id})`));
    
    bot.on('message', (msg) => {
        if (adminIds.includes(msg.from.id.toString()) && msg.text && !msg.text.trim().startsWith('/')) {
            bot.sendMessage(msg.chat.id, "👋 Bonjour Admin ! Pour accéder à votre espace, tapez /livreur ou /id pour voir vos infos.");
        }
    });
    
    bot.on('callback_query', async (query) => {
        const data = query.data; 
        if (data.startsWith('status_')) {
            const parts = data.split('_');
            const newStatus = parts[2];
            const orderId = parts[1];
            const userId = query.from.id.toString();
            const isAdmin = adminIds.includes(userId);
            
            if (!isAdmin && (newStatus === 'confirme' || newStatus === 'annule' || newStatus === 'livre')) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Action réservée aux administrateurs.", show_alert: true });
            }
            
            const { data: order } = await supabase.from('orders').select('*, drivers(*)').eq('transaction_id', orderId).single();
            if (order) {
                if (newStatus === 'done') {
                    if (!order.driver_id || order.driver_id !== userId) {
                        return bot.answerCallbackQuery(query.id, { text: "⚠️ Seul le livreur assigné peut valider cette commande.", show_alert: true });
                    }
                    order.status = 'termine'; 
                } else {
                    order.status = newStatus;
                }
                
                await supabase.from('orders').update({
                    status: order.status,
                    updated_at: new Date().toISOString()
                }).eq('transaction_id', orderId);
                
                let textStatus = order.status === 'confirme' ? '✅ En préparation' : order.status === 'livre' ? '🚚 En livraison' : order.status === 'termine' ? '🏁 LIVRÉ ✔️' : '❌ Annulé';
                
                let phone = order.phone.replace(/[^0-9]/g, '');
                if (phone.length === 10 && !phone.startsWith('225')) phone = '225' + phone;
                
                let statutClient = order.status === 'confirme' ? 'En préparation et sera bientôt expédiée' : order.status === 'livre' ? 'En cours de livraison' : order.status === 'termine' ? 'Livrée' : 'Annulée';
                let waMsg = `Bonjour ${order.full_name},\n\nVotre commande n°${orderId} chez *Lemontini* a été mise à jour !\n\nStatut actuel : *${statutClient}*.\n\nVous pouvez suivre l'avancée ici : http://localhost:3000/track.html?id=${orderId}`;
                let waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`;

                let emojiIcon = order.status === 'confirme' ? '🟢' : order.status === 'livre' ? '🚛' : order.status === 'termine' ? '🏁' : '🔴';
                let originalText = query.message.text || "";
                
                let header = `━━━━━━━━━━━━━━━━━━━━\n${emojiIcon} *STATUT : ${textStatus.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                let msgBody = originalText.includes('🧾 *REÇU DE COMMANDE*') ? originalText.substring(originalText.indexOf('🧾 *REÇU DE COMMANDE*')) : originalText;
                let newText = header + msgBody;

                bot.answerCallbackQuery(query.id, { text: `Statut mis à jour : ${newStatus}` });
                
                let newKeyboard = [];
                if (order.status === 'confirme') {
                    newKeyboard.push([{ text: '🚚 Passer en Livraison (Admin)', callback_data: `status_${orderId}_livre` }]);
                    newKeyboard.push([{ text: '❌ Annuler la commande', callback_data: `status_${orderId}_annule` }]);
                } else if (order.status === 'livre') {
                    newKeyboard.push([{ text: '✅ Marquer comme Livré (Livreur)', callback_data: `status_${orderId}_done` }]);
                }
                newKeyboard.push([{ text: '💬 Envoyer un WhatsApp au client', url: waUrl }]);

                bot.editMessageText(newText, {
                    chat_id: query.message.chat.id,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: newKeyboard }
                }).catch(err => console.log('Telegram Edit Error:', err));
            } else {
                bot.answerCallbackQuery(query.id, { text: `Commande introuvable` });
            }
        } else if (data.startsWith('claim_')) {
            const orderId = data.split('_')[1];
            const driverId = query.from.id.toString();
            
            const { data: driver } = await supabase.from('drivers').select('*').eq('id', driverId).single();
            if (!driver) {
                return bot.answerCallbackQuery(query.id, { text: "⚠️ Vous n'êtes pas inscrit comme livreur. Tapez /inscription VotreNom VotreNumero" , show_alert: true });
            }
            
            const { data: order } = await supabase.from('orders').select('*').eq('transaction_id', orderId).single();
            if (!order) return bot.answerCallbackQuery(query.id, { text: "Commande introuvable" });
            
            if (order.driver_id) {
                const { data: existingDriver } = await supabase.from('drivers').select('name').eq('id', order.driver_id).single();
                return bot.answerCallbackQuery(query.id, { text: `❌ Déjà prise par ${existingDriver ? existingDriver.name : 'un autre livreur'}`, show_alert: true });
            }
            
            await supabase.from('orders').update({
                driver_id: driverId,
                status: 'livre',
                updated_at: new Date().toISOString()
            }).eq('transaction_id', orderId);
            
            bot.answerCallbackQuery(query.id, { text: "✅ Course attribuée ! En route 🚚" });
            
            let clientPhone = order.phone.replace(/[^0-9]/g, '');
            if (clientPhone.length === 10 && !clientPhone.startsWith('225')) clientPhone = '225' + clientPhone;
            
            let waMsg = `Bonjour ${order.full_name},\n\nVotre commande n°${orderId} est en cours de livraison !\n\n🏃‍♂️ Votre livreur est *${driver.name}*.\n📞 Vous pouvez le joindre au : *${driver.phone}*.\n\nSuivez votre colis ici : http://localhost:3000/track.html?id=${orderId}`;
            let waUrl = `https://wa.me/${clientPhone}?text=${encodeURIComponent(waMsg)}`;
            
            let originalText = query.message.text || "";
            let header = `━━━━━━━━━━━━━━━━━━━━\n🚚 *LIVREUR : ${driver.name.toUpperCase()}*\n📦 *STATUT : EN LIVRAISON*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
            let msgBody = originalText.includes('🧾 *REÇU DE COMMANDE*') ? originalText.substring(originalText.indexOf('🧾 *REÇU DE COMMANDE*')) : originalText;
            
            bot.editMessageText(header + msgBody, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💬 Envoyer WhatsApp au Client', url: waUrl }],
                        [{ text: '✅ Marquer comme Livré', callback_data: `status_${orderId}_done` }]
                    ]
                }
            }).catch(err => {});
        }
    });
    
    bot.onText(/\/inscription (.+) (.+)/, async (msg, match) => {
        const driverId = msg.from.id.toString();
        const name = match[1];
        const phone = match[2];
        
        await supabase.from('drivers').upsert({ id: driverId, name, phone });
        
        bot.sendMessage(msg.chat.id, `✅ Inscription réussie !\n\nNom: *${name}*\nTéléphone: *${phone}*\n\nVous recevrez désormais les propositions de livraison.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/id/, (msg) => {
        bot.sendMessage(msg.chat.id, `👤 *Information Utilisateur*\n\nNom: ${msg.from.first_name}\nID: \`${msg.from.id}\``, { parse_mode: 'Markdown' });
    });

    bot.onText(/^\s*\/livreur(@\w+)?\s*$/, (msg) => {
        const webAppUrl = `http://localhost:3000/driver_app.html`;
        bot.sendMessage(msg.chat.id, "📦 *Espace Livreur Lemontini*\n\nCliquez sur le bouton ci-dessous pour gérer vos livraisons.", {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Ouvrir mon Espace", web_app: { url: webAppUrl } }]] }
        });
    });
    
    bot.onText(/\/resume/, async (msg) => {
        const today = new Date().toISOString().split('T')[0];
        const { data: orders } = await supabase.from('orders').select('*').gte('created_at', today);
        
        const todayOrders = orders || [];
        const nouveau = todayOrders.filter(o => o.status === 'nouveau').length;
        const prepare = todayOrders.filter(o => o.status === 'confirme').length;
        const livre = todayOrders.filter(o => o.status === 'livre').length;
        const totalAmount = todayOrders.filter(o => o.status !== 'annule').reduce((acc, o) => acc + Number(o.total_amount), 0);
        
        let report = `📊 *RÉSUMÉ DU JOUR*\n\n🆕 Nouveau(x) : *${nouveau}*\n📦 En prépa : *${prepare}*\n✅ Livré(s) : *${livre}*\n\n💰 CA généré : *${Number(totalAmount).toLocaleString('fr-FR')} FCFA*`;
        bot.sendMessage(msg.chat.id, report, {parse_mode: 'Markdown'});
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
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
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
            const itemsList = (order.items||[]).map(i => `• ${i.qty}x ${i.name} (${Number(i.price).toLocaleString('fr-FR')} F)`).join('\n');
            const paymentTypeMsg = order.paymentType === 'cash' ? '💵 Espèces' : order.paymentType === 'wave' ? '💙 Wave' : '🟠 Orange';
            
            const msg = `━━━━━━━━━━━━━━━━━━━━\n` +
                        `🧾 *REÇU DE COMMANDE*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `🆔 *Réf :* \`${order.transactionId}\` \n` +
                        `👤 *Client :* ${order.fullName}\n` +
                        `📱 *WhatsApp :* ${order.phone}\n` +
                        `📍 *Lieu :* ${order.city} — ${order.address}\n` +
                        `📞 *Instruction :* ${order.instructions || "Aucune"}\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📦 *ARTICLES :*\n${itemsList}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `💳 *PAIEMENT :* ${paymentTypeMsg}\n` +
                        `💰 *TOTAL À PAYER :*\n` +
                        `✨ *${Number(order.totalAmount).toLocaleString('fr-FR')} FCFA*\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━`;
                        
            bot.sendMessage(chatId, msg, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Accepter (En prépa)', callback_data: `status_${order.transactionId}_confirme` },
                            { text: '🚚 Prendre la livraison', callback_data: `claim_${order.transactionId}` }
                        ],
                        [{ text: '❌ Annuler (Rupture/Faux)', callback_data: `status_${order.transactionId}_annule` }]
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
app.listen(PORT, () => {
    console.log(`Le serveur e-commerce avec SUPABASE est DÉMARRÉ sur http://localhost:${PORT}`);
});
