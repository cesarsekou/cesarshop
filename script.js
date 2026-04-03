/* ═══════════════════════════════════════════════════════════
   LEMONTINI — APPLICATION LOGIC v2.0
   Marché Ivoirien · Abidjan · Côte d'Ivoire
   ═══════════════════════════════════════════════════════════ */

// ─── 1. PRODUCTS DATA ───
const productsData = [
    {
        id: 'p1',
        name: 'Blush Crème "Teint d\'Ébène"',
        price: 15000,
        image: 'assets/blush.png',
        category: 'face',
        desc: 'Un blush crème hautement pigmenté, spécialement formulé pour ressortir parfaitement sur les peaux noires et métissées. Ne laisse pas de fini gras, résiste à la chaleur tropicale.',
        size: '5.3g / 0.18 oz',
        shade: 'Spicy Terracotta',
        isNew: true,
        rating: 4.8,
        reviews: 124
    },
    {
        id: 'p2',
        name: 'Gloss Soin au Beurre de Karité',
        price: 12000,
        image: 'assets/tint.png',
        category: 'lips',
        desc: 'Soin repulpant enrichi au beurre de karité pur de Côte d\'Ivoire. Hydrate en profondeur, laisse un fini brillant irrésistible sans effet collant.',
        size: '10ml',
        shade: 'Nude Miel Doré',
        isNew: false,
        isBestSeller: true,
        rating: 4.9,
        reviews: 231
    },
    {
        id: 'p3',
        name: 'Trousse "Éclat d\'Été"',
        price: 25000,
        image: 'assets/kit.png',
        category: 'kit',
        desc: 'Partez à Assinie ou Grand-Bassam avec vos essentiels réunis dans notre superbe trousse jaune signature Lemontini.',
        size: 'Format Voyage',
        shade: 'Lemontini Yellow',
        isNew: false,
        rating: 4.7,
        reviews: 87
    },
    {
        id: 'p4',
        name: 'Coque Smartphone Lemontini',
        price: 20000,
        image: 'assets/case.png',
        category: 'accessory',
        desc: 'Affichez votre style. Cette coque jaune solaire protège votre téléphone avec élégance et dispose d\'un slot pour transporter votre gloss.',
        size: 'Pro & Standard',
        shade: 'Jaune Solaire',
        isNew: true,
        rating: 4.6,
        reviews: 56
    }
];

// ─── HELPERS ───
const formatCFA = (amount) =>
    new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0 }).format(amount) + ' FCFA';

function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ─── 2. STATE ───
let cart = [];
let favorites = new Set();
let currentFilter = 'all';
let searchQuery = '';
let currentQuantity = 1;
let currentProduct = null;

// ─── 3. DOM ELEMENTS ───
const els = {
    searchToggle: document.getElementById('searchToggle'),
    searchBar: document.getElementById('searchBar'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    filterChips: document.getElementById('filterChips'),
    brandSubtitle: document.getElementById('brandSubtitle'),
    productGrid: document.getElementById('productGrid'),
    emptyState: document.getElementById('emptyState'),
    cartToggle: document.getElementById('cartToggle'),
    cartBadge: document.getElementById('cartBadge'),
    cartOverlay: document.getElementById('cartOverlay'),
    cartDrawer: document.getElementById('cartDrawer'),
    cartClose: document.getElementById('cartClose'),
    cartItems: document.getElementById('cartItems'),
    cartEmpty: document.getElementById('cartEmpty'),
    cartFooter: document.getElementById('cartFooter'),
    cartSubtotal: document.getElementById('cartSubtotal'),
    cartTotal: document.getElementById('cartTotal'),
    cartShipping: document.getElementById('cartShipping'),
    checkoutBtn: document.getElementById('checkoutBtn'),
    productModal: document.getElementById('productModal'),
    modalClose: document.getElementById('modalClose'),
    modalTitle: document.getElementById('modalTitle'),
    modalCategory: document.getElementById('modalCategory'),
    modalDesc: document.getElementById('modalDesc'),
    modalPrice: document.getElementById('modalPrice'),
    modalImage: document.getElementById('modalImage'),
    modalSize: document.getElementById('modalSize'),
    modalShade: document.getElementById('modalShade'),
    modalFav: document.getElementById('modalFav'),
    qtyMinus: document.getElementById('qtyMinus'),
    qtyPlus: document.getElementById('qtyPlus'),
    qtyValue: document.getElementById('qtyValue'),
    addToCartBtn: document.getElementById('addToCartBtn'),
    buyNowBtn: document.getElementById('buyNowBtn'),
    checkoutModal: document.getElementById('checkoutModal'),
    checkoutClose: document.getElementById('checkoutClose'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutSteps: document.getElementById('checkoutSteps'),
    orderSummaryMini: document.getElementById('orderSummaryMini'),
    payTotal: document.getElementById('payTotal'),
    checkoutSuccess: document.getElementById('checkoutSuccess'),
    continueShopping: document.getElementById('continueShopping'),
    orderNumber: document.getElementById('orderNumber'),
    momoInfo: document.getElementById('momoInfo'),
    citySelect: document.getElementById('city'),
    cityCustomGroup: document.getElementById('cityCustomGroup'),
    cityCustomInput: document.getElementById('cityCustom'),
    toastContainer: document.getElementById('toastContainer'),
    
    // Review elements
    addReviewBtn: document.getElementById('addReviewBtn'),
    reviewModal: document.getElementById('reviewModal'),
    reviewModalClose: document.getElementById('reviewModalClose'),
    reviewForm: document.getElementById('reviewForm'),
    starRatingInput: document.getElementById('starRatingInput'),
    selectedRating: document.getElementById('selectedRating'),
    reviewsScroll: document.getElementById('reviewsScroll')
};

// ─── 4. INIT ───
function init() {
    loadLocalData();
    renderProducts();
    updateCartUI();
    setupEventListeners();
    initChatbot();
    handleURLStatus();
    animateOnLoad();
    checkLastOrder();
    loadReviews(); // Load reviews from server
}

// ─── 5. LOCAL STORAGE ───
function loadLocalData() {
    try {
        const savedCart = localStorage.getItem('lemontini_cart_ci');
        if (savedCart) cart = JSON.parse(savedCart);
        const savedFavs = localStorage.getItem('lemontini_favs_ci');
        if (savedFavs) favorites = new Set(JSON.parse(savedFavs));
    } catch(e) { console.error('Erreur localStorage', e); }
}

function saveLocalData() {
    localStorage.setItem('lemontini_cart_ci', JSON.stringify(cart));
    localStorage.setItem('lemontini_favs_ci', JSON.stringify([...favorites]));
}

// ─── URL Status (retour Wave) ───
function handleURLStatus() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('status') === 'success') {
        showToast('Paiement Wave confirmé ! 🎉', 'success');
        history.replaceState({}, '', '/');
    } else if (params.get('status') === 'error') {
        showToast('Paiement annulé. Réessayez.');
        history.replaceState({}, '', '/');
    }
}

// ─── Load Animation ───
function animateOnLoad() {
    document.querySelectorAll('.hero-banner, .header, .product-grid').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px)';
        el.style.transition = `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`;
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 50);
    });
}

// ─── 6. RENDER PRODUCTS ───
function renderProducts() {
    const filtered = productsData.filter(p => {
        const matchCategory = currentFilter === 'all' || p.category === currentFilter;
        const q = searchQuery.toLowerCase();
        const matchSearch = p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
        return matchCategory && matchSearch;
    });

    els.productGrid.innerHTML = '';

    if (filtered.length === 0) {
        els.productGrid.style.display = 'none';
        els.emptyState.style.display = 'flex';
        els.emptyState.style.flexDirection = 'column';
        els.emptyState.style.alignItems = 'center';
        return;
    }

    els.productGrid.style.display = 'grid';
    els.emptyState.style.display = 'none';

    filtered.forEach((p, index) => {
        const isFav = favorites.has(p.id);

        // Stagger effect for right column on mobile
        const marginTop = (index % 2 !== 0 && index > 0) ? '28px' : '0';

        const article = document.createElement('article');
        article.className = 'product-card';
        article.style.marginTop = window.innerWidth > 600 ? '0' : marginTop;
        article.style.animationDelay = `${index * 0.06}s`;

        const badgeHTML = p.isNew
            ? `<span class="product-badge badge-new">Nouveau</span>`
            : p.isBestSeller
            ? `<span class="product-badge badge-bestseller">🔥 Best-seller</span>`
            : '';

        const starsHTML = `
            <div class="product-rating">
                <span class="stars" title="${p.rating}/5">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5 - Math.floor(p.rating))}</span>
                <span class="rating-count">(${p.reviews})</span>
            </div>`;

        article.innerHTML = `
            <button class="fav-btn ${isFav ? 'liked' : ''}" data-id="${p.id}" aria-label="Ajouter aux favoris">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
            <div class="product-image-container" onclick="openProduct('${p.id}')">
                ${badgeHTML}
                <img src="${p.image}" alt="${p.name}" class="product-image" loading="lazy">
                <button class="quick-add" onclick="event.stopPropagation(); quickAdd('${p.id}')">+ Ajout rapide</button>
            </div>
            <div class="product-info" onclick="openProduct('${p.id}')">
                ${starsHTML}
                <h3 class="product-name">${p.name}</h3>
                <p class="product-price">${formatCFA(p.price)}</p>
            </div>
        `;
        els.productGrid.appendChild(article);
    });
}

// ─── 7. CART LOGIC ───
function addToCart(productId, qty = 1) {
    const product = productsData.find(p => p.id === productId);
    if (!product) return;

    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ ...product, qty });
    }

    saveLocalData();
    updateCartUI();
    showToast(`✓ Ajouté : ${product.name}`, 'success');
    bumpBadge();
}

function updateCartQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    saveLocalData();
    updateCartUI();
}

function removeCartItem(id) {
    cart = cart.filter(i => i.id !== id);
    saveLocalData();
    updateCartUI();
}

function updateCartUI() {
    const totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal  = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const shipping  = 2000;
    const grandTotal = subtotal > 0 ? subtotal + shipping : 0;

    els.cartBadge.textContent = totalQty;

    if (cart.length === 0) {
        els.cartItems.innerHTML = '';
        els.cartEmpty.style.display = 'flex';
        els.cartFooter.style.display = 'none';
        return;
    }

    els.cartEmpty.style.display = 'none';
    els.cartFooter.style.display = 'block';
    els.cartSubtotal.textContent = formatCFA(subtotal);
    els.cartShipping.textContent = formatCFA(shipping);
    els.cartTotal.textContent    = formatCFA(grandTotal);
    els.payTotal.textContent     = formatCFA(grandTotal);

    els.cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-img">
                <img src="${item.image}" alt="${item.name}">
            </div>
            <div class="cart-item-details">
                <h4 class="cart-item-name">${item.name}</h4>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)" aria-label="Réduire">−</button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)" aria-label="Augmenter">+</button>
                </div>
            </div>
            <span class="cart-item-price">${formatCFA(item.price * item.qty)}</span>
            <button class="cart-item-remove" onclick="removeCartItem('${item.id}')" aria-label="Supprimer ${item.name}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
    `).join('');
}

// Expose functions globally
window.quickAdd = (id) => addToCart(id, 1);
window.updateCartQty = updateCartQty;
window.removeCartItem = removeCartItem;

function bumpBadge() {
    els.cartBadge.classList.remove('bump');
    void els.cartBadge.offsetWidth;
    els.cartBadge.classList.add('bump');
}

// ─── 8. PRODUCT MODAL ───
window.openProduct = function(id) {
    const p = productsData.find(pr => pr.id === id);
    if (!p) return;
    currentProduct = p;
    currentQuantity = 1;
    els.qtyValue.textContent = 1;

    els.modalImage.src = p.image;
    els.modalImage.alt = p.name;
    els.modalTitle.textContent = p.name;
    els.modalCategory.textContent = {
        face: '✨ Visage & Teint',
        lips: '💋 Lèvres',
        kit: '🎁 Coffrets',
        accessory: '🌟 Accessoires'
    }[p.category] || p.category;
    els.modalDesc.textContent    = p.desc;
    els.modalPrice.textContent   = formatCFA(p.price);
    els.modalSize.textContent    = p.size;
    els.modalShade.textContent   = p.shade;

    updateModalFavUI();
    els.productModal.classList.add('open');
    document.body.style.overflow = 'hidden';
};

function updateModalFavUI() {
    if (!currentProduct) return;
    const isFav = favorites.has(currentProduct.id);
    els.modalFav.classList.toggle('liked', isFav);
    els.modalFav.querySelector('svg').setAttribute('fill', isFav ? 'currentColor' : 'none');
}

function closeProductModal() {
    els.productModal.classList.remove('open');
    document.body.style.overflow = '';
}

// ─── 9. EVENT LISTENERS ───
function setupEventListeners() {

    // ── Product Modal ──
    els.modalClose.addEventListener('click', closeProductModal);
    els.productModal.addEventListener('click', (e) => {
        if (e.target === els.productModal) closeProductModal();
    });

    els.qtyMinus.addEventListener('click', () => {
        if (currentQuantity > 1) { currentQuantity--; els.qtyValue.textContent = currentQuantity; }
    });
    els.qtyPlus.addEventListener('click', () => {
        currentQuantity++;
        els.qtyValue.textContent = currentQuantity;
    });

    els.addToCartBtn.addEventListener('click', () => {
        if (currentProduct) {
            addToCart(currentProduct.id, currentQuantity);
            closeProductModal();
            setTimeout(openCart, 300);
        }
    });

    els.buyNowBtn.addEventListener('click', () => {
        if (currentProduct) {
            addToCart(currentProduct.id, currentQuantity);
            closeProductModal();
            closeCart();
            setTimeout(() => {
                els.checkoutModal.classList.add('open');
                document.body.style.overflow = 'hidden';
                els.checkoutForm.style.display = 'block';
                els.checkoutSuccess.style.display = 'none';
                resetCheckoutSteps();
                renderCheckoutSummary();
            }, 300);
        }
    });

    // ── Favorites (grid) ──
    els.productGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.fav-btn');
        if (!btn) return;
        e.stopPropagation();
        const id = btn.dataset.id;
        if (favorites.has(id)) {
            favorites.delete(id);
            showToast('Retiré des favoris');
        } else {
            favorites.add(id);
            showToast('❤️ Ajouté aux favoris');
        }
        saveLocalData();
        renderProducts();
    });

    // ── Favorites (modal) ──
    els.modalFav.addEventListener('click', () => {
        if (!currentProduct) return;
        const id = currentProduct.id;
        favorites.has(id) ? favorites.delete(id) : favorites.add(id);
        saveLocalData();
        updateModalFavUI();
        renderProducts();
    });

    // ── Cart Drawer ──
    els.cartToggle.addEventListener('click', openCart);
    els.cartClose.addEventListener('click', closeCart);
    els.cartOverlay.addEventListener('click', closeCart);

    // ── Checkout Open ──
    els.checkoutBtn.addEventListener('click', () => {
        closeCart();
        setTimeout(() => {
            els.checkoutModal.classList.add('open');
            document.body.style.overflow = 'hidden';
            els.checkoutForm.style.display = 'block';
            els.checkoutSuccess.style.display = 'none';
            resetCheckoutSteps();
            renderCheckoutSummary();
        }, 200);
    });

    els.checkoutClose.addEventListener('click', () => {
        els.checkoutModal.classList.remove('open');
        document.body.style.overflow = '';
    });
    els.checkoutModal.addEventListener('click', (e) => {
        if (e.target === els.checkoutModal) {
            els.checkoutModal.classList.remove('open');
            document.body.style.overflow = '';
        }
    });

    // ── Checkout Steps ──
    const panels = document.querySelectorAll('.checkout-step-panel');
    const steps  = Array.from(document.querySelectorAll('.checkout-steps .step'));
    const lines  = Array.from(document.querySelectorAll('.checkout-steps .step-line'));

    function showPanel(stepNum) {
        panels.forEach(p => p.classList.remove('active'));
        document.querySelector(`.checkout-step-panel[data-panel="${stepNum}"]`).classList.add('active');

        steps.forEach((step, i) => {
            const num = i + 1;
            step.classList.remove('active', 'done');
            if (num < stepNum) step.classList.add('done', 'active');
            else if (num === parseInt(stepNum)) step.classList.add('active');
        });

        lines.forEach((line, i) => {
            i < stepNum - 1 ? line.classList.add('done') : line.classList.remove('done');
        });

        // Scroll modal to top
        const mc = document.querySelector('.checkout-content');
        if (mc) mc.scrollTop = 0;
    }

    function resetCheckoutSteps() {
        showPanel(1);
        els.checkoutForm.reset();
        updateMomoInfo('wave');
    }

    document.querySelectorAll('.checkout-next-btn[data-next]').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.closest('.checkout-step-panel');
            const inputs = panel.querySelectorAll('input[required], select[required]');
            let valid = true;
            inputs.forEach(input => {
                // Special check for custom city
                if (input.id === 'cityCustom' && els.citySelect.value !== 'Autre') return;
                
                let isInputValid = true;
                
                if (!input.value.trim()) {
                    isInputValid = false;
                }
                
                if (input.id === 'phone' && input.value.trim()) {
                    const phoneVal = input.value.replace(/\s+/g, '');
                    if (!/^\d{10}$/.test(phoneVal)) {
                        isInputValid = false;
                        showToast('Le téléphone doit avoir exactement 10 chiffres', 'error');
                    }
                }

                if (!isInputValid) {
                    valid = false;
                    input.classList.add('error');
                } else {
                    input.classList.remove('error');
                }
            });
            
            // Check custom city if panel is Step 2
            if (btn.dataset.next === '3') {
                if (els.citySelect.value === 'Autre' && !els.cityCustomInput.value.trim()) {
                    valid = false;
                    els.cityCustomInput.classList.add('error');
                }
            }

            if (valid) {
                showPanel(btn.dataset.next);
                if (btn.dataset.next === '3') {
                    renderCheckoutSummary();
                }
            } else {
                showToast('Veuillez remplir les champs obligatoires.');
            }
        });
    });

    // ── City Select Change ──
    els.citySelect.addEventListener('change', (e) => {
        if (e.target.value === 'Autre') {
            els.cityCustomGroup.style.display = 'block';
            els.cityCustomInput.setAttribute('required', 'true');
        } else {
            els.cityCustomGroup.style.display = 'none';
            els.cityCustomInput.removeAttribute('required');
        }
    });

    document.querySelectorAll('.checkout-back-btn[data-prev]').forEach(btn => {
        btn.addEventListener('click', () => showPanel(btn.dataset.prev));
    });

    // Remove error on input
    els.checkoutForm.addEventListener('input', (e) => {
        if (e.target.required && e.target.value.trim()) e.target.classList.remove('error');
    });

    // ── Payment method toggle ──
    function updateMomoInfo(value) {
        const info = {
            wave: "Vous serez redirigé vers l'application Wave pour valider votre paiement en toute sécurité.",
            orange: "Vous recevrez un SMS Orange Money pour confirmer le paiement.",
            cash: null
        };
        if (info[value]) {
            els.momoInfo.style.display = 'flex';
            els.momoInfo.textContent = info[value];
        } else {
            els.momoInfo.style.display = 'none';
        }
    }

    document.querySelectorAll('input[name="paymentType"]').forEach(radio => {
        radio.addEventListener('change', (e) => updateMomoInfo(e.target.value));
    });

    // ── Form Submit ──
    els.checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submitOrder');
        submitBtn.innerHTML = '<span class="loader"></span> Traitement...';
        submitBtn.disabled = true;

        const phoneInput  = document.getElementById('phone');
        let phone         = phoneInput.value.replace(/\s+/g, '');
        if (!/^\d{10}$/.test(phone)) {
            showToast('Le téléphone doit contenir exactement 10 chiffres', 'error');
            phoneInput.classList.add('error');
            submitBtn.innerHTML = `Valider`;
            submitBtn.disabled = false;
            return;
        }

        const paymentType = document.querySelector('input[name="paymentType"]:checked').value;
        const fullName    = document.getElementById('fullName').value.trim();
        const citySelect  = document.getElementById('city').value;
        const cityCustom  = document.getElementById('cityCustom').value.trim();
        const city        = citySelect === 'Autre' ? cityCustom : citySelect;
        
        const address     = document.getElementById('address').value.trim();
        const instructions = document.getElementById('instructions').value;

        const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
        const totalAmount = subtotal + 2000;
        const transactionId = 'LM-CI-' + Math.floor(10000 + Math.random() * 90000);

        const orderPayload = {
            transactionId, fullName, phone, city, address, instructions,
            paymentType, totalAmount,
            items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price }))
        };

        function showSuccess() {
            els.checkoutForm.style.display = 'none';
            els.checkoutSuccess.style.display = 'block';
            els.orderNumber.textContent = transactionId;
            document.getElementById('trackOrderBtn').href = `/track.html?id=${transactionId}`;
            
            // Sauvegarder l'ID de commande pour le bouton de suivi global
            localStorage.setItem('lemontini_last_order', transactionId);
            checkLastOrder();

            cart = []; saveLocalData(); updateCartUI();
            submitBtn.disabled = false;
        }

        if (paymentType === 'wave') {
            try {
                const res = await fetch('/api/create-wave-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: totalAmount, currency: 'XOF',
                        success_url: `${window.location.origin}/?status=success&id=${transactionId}`,
                        error_url: `${window.location.origin}/?status=error`,
                        client_reference: transactionId
                    })
                });
                const data = await res.json();
                if (data.wave_launch_url) {
                    fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderPayload) });
                    window.location.href = data.wave_launch_url;
                } else {
                    throw new Error('No Wave URL');
                }
            } catch {
                submitBtn.innerHTML = 'Valider (<span id="payTotal">' + formatCFA(totalAmount) + '</span>)';
                submitBtn.disabled = false;
                showToast('Erreur de connexion Wave. Réessayez.');
            }
        } else {
            // Cash or Orange Money → direct order
            try {
                await fetch('/api/orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(orderPayload)
                });
            } catch { /* show success anyway */ }
            showSuccess();
        }
    });

    els.continueShopping.addEventListener('click', () => {
        els.checkoutModal.classList.remove('open');
        document.body.style.overflow = '';
    });

    // ── Hero Banner ──
    document.getElementById('heroBanner')?.addEventListener('click', () => {
        els.productGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ── Search ──
    els.searchToggle.addEventListener('click', () => {
        const isOpen = els.searchBar.classList.toggle('open');
        els.searchToggle.classList.toggle('active', isOpen);
        els.searchToggle.setAttribute('aria-expanded', isOpen);
        if (isOpen) els.searchInput.focus();
        else { els.searchInput.value = ''; searchQuery = ''; renderProducts(); }
    });

    els.searchClear.addEventListener('click', () => {
        els.searchInput.value = '';
        searchQuery = '';
        renderProducts();
        els.searchInput.focus();
    });

    els.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderProducts();
    });

    // ── Filter Chips ──
    els.filterChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        els.filterChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.dataset.category;
        const labels = {
            all: 'Éclat Tropical', face: 'Visage & Teint', lips: 'Lèvres',
            kit: 'Coffrets Cadeaux', accessory: 'Accessoires'
        };
        els.brandSubtitle.textContent = labels[currentFilter] || chip.textContent;
        renderProducts();
    });

    // ── Keyboard ESC ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeProductModal();
            closeCart();
            els.checkoutModal.classList.remove('open');
            els.reviewModal?.classList.remove('open');
            document.body.style.overflow = '';
        }
    });

    // ── Review Modal ──
    els.addReviewBtn?.addEventListener('click', () => {
        els.reviewModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    els.reviewModalClose?.addEventListener('click', () => {
        els.reviewModal.classList.remove('open');
        document.body.style.overflow = '';
    });

    // Star rating interactivity
    els.starRatingInput?.addEventListener('click', (e) => {
        const span = e.target.closest('span');
        if (!span) return;
        const rating = span.dataset.rating;
        els.selectedRating.value = rating;
        updateStarsUI(rating);
    });

    function updateStarsUI(rating) {
        const stars = els.starRatingInput.querySelectorAll('span');
        stars.forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.rating) <= parseInt(rating));
        });
    }
    updateStarsUI(5); // Default 5 stars

    // Review form submission
    els.reviewForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = els.reviewForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loader"></span> Publication...';

        const reviewData = {
            author: document.getElementById('reviewAuthor').value.trim(),
            rating: parseInt(els.selectedRating.value),
            product: document.getElementById('reviewProduct').value,
            comment: document.getElementById('reviewComment').value.trim(),
            date: new Date().toISOString()
        };

        try {
            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reviewData)
            });
            
            if (res.ok) {
                showToast('Merci ! Votre avis a été publié. ✨', 'success');
                els.reviewModal.classList.remove('open');
                document.body.style.overflow = '';
                els.reviewForm.reset();
                updateStarsUI(5);
                loadReviews(); // Refresh list
            } else {
                throw new Error();
            }
        } catch (err) {
            showToast('Erreur lors de la publication.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

async function loadReviews() {
    try {
        const res = await fetch('/api/reviews');
        const reviews = await res.json();
        if (reviews && reviews.length > 0) {
            renderReviews(reviews);
        }
    } catch (e) {
        console.error('Failed to load reviews', e);
    }
}

function renderReviews(reviews) {
    if (!els.reviewsScroll) return;
    
    // Filter out some hardcoded ones if you want, or just prepend
    const html = reviews.map(r => `
        <article class="review-card">
            <div class="review-top">
                <div class="review-avatar" style="background:#fde8f2; color:#d4447c;">${r.author.charAt(0).toUpperCase()}</div>
                <div class="review-info">
                    <h4 class="review-name">${r.author}</h4>
                    <p class="review-location">Cliente vérifiée</p>
                </div>
            </div>
            <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            <p class="review-text">${r.comment}</p>
            <span class="review-product-tag">${r.product}</span>
        </article>
    `).join('');
    
    els.reviewsScroll.innerHTML = html;
}

function openCart() {
    els.cartOverlay.classList.add('open');
    els.cartDrawer.classList.add('open');
    document.body.style.overflow = 'hidden';
}
function closeCart() {
    els.cartOverlay.classList.remove('open');
    els.cartDrawer.classList.remove('open');
    document.body.style.overflow = '';
}

function renderCheckoutSummary() {
    const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
    const shipping = 2000;
    const total = subtotal + shipping;

    const citySelect = document.getElementById('city').value;
    const cityCustom = document.getElementById('cityCustom').value.trim();
    const city = citySelect === 'Autre' ? cityCustom : citySelect;
    
    const address = document.getElementById('address').value.trim();
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    els.orderSummaryMini.className = 'receipt-summary';
    els.orderSummaryMini.innerHTML = `
        <div class="receipt-paper">
            <div class="receipt-header">
                <div class="receipt-brand">LE MO NTINI</div>
                <div class="receipt-subtitle">ÉCLAT TROPICAL</div>
                <div class="receipt-info">${dateStr} — ${timeStr}</div>
            </div>
            
            <div class="receipt-divider"></div>
            
            <div class="receipt-items">
                ${cart.map(item => `
                    <div class="receipt-item">
                        <div class="item-main">
                            <span class="item-qty">${item.qty} ×</span>
                            <span class="item-name">${item.name}</span>
                        </div>
                        <span class="item-price">${formatCFA(item.price * item.qty)}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="receipt-divider"></div>
            
            <div class="receipt-section">
                <div class="section-title">DESTINATION</div>
                <div class="receipt-detail">
                    <span class="detail-label">Lieu</span>
                    <span class="detail-value">${city}</span>
                </div>
                <div class="receipt-detail">
                    <span class="detail-label">Adresse</span>
                    <span class="detail-value">${address}</span>
                </div>
            </div>
            
            <div class="receipt-divider"></div>
            
            <div class="receipt-totals">
                <div class="total-row">
                    <span>Sous-total</span>
                    <span>${formatCFA(subtotal)}</span>
                </div>
                <div class="total-row">
                    <span>Frais de livraison</span>
                    <span>${formatCFA(shipping)}</span>
                </div>
                <div class="total-row grand-total">
                    <span>TOTAL À PAYER</span>
                    <span>${formatCFA(total)}</span>
                </div>
            </div>
            
            <div class="receipt-footer">
                <p>Merci pour votre confiance ! ✨</p>
                <div class="receipt-barcode">|||||||||||||||||||||||||||</div>
                <p class="receipt-tagline">www.lemontini.ci</p>
            </div>
        </div>
    `;
    els.payTotal.textContent = formatCFA(total);
}

// ─── 10. TOAST ───
function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${message}</span>
    `;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 3200);
}

// ─── 11. CHATBOT AMINATA ───
function initChatbot() {
    const chatContainer = document.getElementById('chatbotContainer');
    const chatToggle    = document.getElementById('chatToggle');
    const chatClose     = document.getElementById('chatClose');
    const chatInput     = document.getElementById('chatInput');
    const chatSend      = document.getElementById('chatSend');
    const chatMic       = document.getElementById('chatMic');
    const chatMessages  = document.getElementById('chatMessages');
    const quickReplies  = document.getElementById('quickReplies');
    const notifDot      = document.getElementById('chatNotifDot');

    let isRecording = false;

    chatToggle.addEventListener('click', () => {
        chatContainer.classList.toggle('open');
        if (chatContainer.classList.contains('open')) {
            chatInput.focus();
            // Hide notif dot once opened
            if (notifDot) notifDot.style.display = 'none';
        }
    });
    chatClose.addEventListener('click', () => chatContainer.classList.remove('open'));

    // Quick reply chips
    if (quickReplies) {
        quickReplies.addEventListener('click', (e) => {
            const chip = e.target.closest('.quick-reply-chip');
            if (!chip) return;
            const msg = chip.dataset.msg;
            addUserMsg(msg);
            // Fade out quick replies after first use
            quickReplies.style.opacity = '0.4';
            quickReplies.style.pointerEvents = 'none';
        });
    }

    function addUserMsg(text) {
        const msg = document.createElement('div');
        msg.className = 'message user';
        msg.innerHTML = `<div class="msg-bubble">${text}</div>`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        triggerBotResponse(text);
    }

    function addBotMsg(html) {
        const typing = chatMessages.querySelector('.typing-indicator');
        if (typing) typing.closest('.message.bot').remove();
        const msg = document.createElement('div');
        msg.className = 'message bot';
        msg.innerHTML = `<div class="msg-bubble">${html}</div>`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function showTyping() {
        const msg = document.createElement('div');
        msg.className = 'message bot';
        msg.innerHTML = `<div class="msg-bubble typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function triggerBotResponse(userMsg) {
        showTyping();
        const m = (userMsg || '').toLowerCase();

        let reply = "Je ne suis pas sûre de comprendre 🤔 Essayez : <em>blush, livraison, paiement, gloss…</em>";

        if (m.includes('blush') || m.includes('visage') || m.includes('teint') || m.includes('peau')) {
            reply = "Notre 💋 <strong>Blush Crème Teint d'Ébène</strong> est formulé pour peaux noires & métissées. Résiste à la chaleur ! Prix : <strong>15 000 FCFA</strong>. Voulez-vous le voir ?";
        } else if (m.includes('gloss') || m.includes('lèvre') || m.includes('levres') || m.includes('karité') || m.includes('lipstick')) {
            reply = "Notre best-seller 💋 <strong>Gloss Soin Karité</strong> hydrate & illumine les lèvres sans coller. Karité pur de CI. <strong>12 000 FCFA</strong> !";
        } else if (m.includes('livraison') || m.includes('délai') || m.includes('abidjan') || m.includes('yopougon') || m.includes('cocody')) {
            reply = "🛵 Livraison à Abidjan en <strong>24–48h pour 2 000 FCFA</strong>. On couvre Cocody, Plateau, Yopougon, Marcory, Abobo… Pour l'intérieur du pays, on envoie par transport.";
        } else if (m.includes('paiement') || m.includes('wave') || m.includes('orange') || m.includes('cash') || m.includes('payer')) {
            reply = "Nous acceptons 📱 <strong>Wave</strong>, <strong>Orange Money</strong> et le <strong>paiement en espèces à la livraison</strong>. Aucun frais supplémentaire !";
        } else if (m.includes('coffret') || m.includes('kit') || m.includes('cadeau')) {
            reply = "🎁 La <strong>Trousse Éclat d'Été</strong> est le cadeau idéal ! Tous les essentiels dans une trousse jaune signature. <strong>25 000 FCFA</strong> — parfaite pour Assinie 🏖️";
        } else if (m.includes('coque') || m.includes('telephone') || m.includes('téléphone')) {
            reply = "La <strong>Coque Lemontini</strong> est notre accessoire star ! Jaune solaire avec slot gloss intégré. <strong>20 000 FCFA</strong>. Super cadeau aussi !";
        } else if (m.includes('bonjour') || m.includes('salut') || m.includes('bonsoir') || m.includes('hello')) {
            reply = "Bonjour ! Bienvenue chez Lemontini 🌿 Je suis <strong>Aminata</strong>. Quel produit vous intéresse : blush, gloss, coffret ou coque ?";
        } else if (m.includes('merci') || m.includes('ok') || m.includes('super') || m.includes('parfait')) {
            reply = "Merci à vous ! 😊 N'hésitez pas si vous avez d'autres questions. Bonne commande !";
        } else if (m.includes('retour') || m.includes('remboursement') || m.includes('problème')) {
            reply = "En cas de problème, contactez-nous sur WhatsApp 📞. Nous acceptons les retours <strong>sous 7 jours</strong> après livraison 🙏";
        } else if (m.includes('produit') || m.includes('quels') || m.includes('gamme') || m.includes('collection')) {
            reply = "Notre collection : 💄 <strong>Blush Crème</strong> (15 000 FCFA), 💋 <strong>Gloss Karité</strong> (12 000 FCFA), 🎁 <strong>Trousse Éclat</strong> (25 000 FCFA) et 📱 <strong>Coque</strong> (20 000 FCFA). Lequel vous intéresse ?";
        } else if (m.includes('conseil') || m.includes('recommande') || m.includes('besoin')) {
            reply = "Pour sublimer votre teint 🌟, je recommande le <strong>Blush Crème Teint d'Ébène</strong>. Pour des lèvres parfaites, le <strong>Gloss Karité</strong> est un must ! Les deux se complètent à merveille.";
        }

        setTimeout(() => addBotMsg(reply), 1300);
    }

    chatSend.addEventListener('click', () => {
        const text = chatInput.value.trim();
        if (text) { addUserMsg(text); chatInput.value = ''; }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') chatSend.click();
    });

    // Voice note simulation
    chatMic.addEventListener('click', () => {
        if (isRecording) {
            isRecording = false;
            chatMic.classList.remove('recording');
            // Simulate voice message
            const msg = document.createElement('div');
            msg.className = 'message user';
            msg.innerHTML = `<div class="msg-bubble" style="display:flex;align-items:center;gap:8px;padding:8px 12px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <div style="flex:1;height:3px;background:rgba(255,255,255,0.4);border-radius:2px;"></div>
                <span style="font-size:10px;opacity:0.8">0:04</span>
            </div>`;
            chatMessages.appendChild(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            triggerBotResponse('bonjour');
        } else {
            isRecording = true;
            chatMic.classList.add('recording');
            showToast('🎤 Microphone activé… Parlez.');
        }
    });
}

// Gestion du Suivi Permanent
function checkLastOrder() {
    const lastOrder = localStorage.getItem('lemontini_last_order');
    const headerBtn = document.getElementById('headerTrackBtn');
    if (headerBtn) {
        if (lastOrder) {
            headerBtn.style.display = 'flex';
            headerBtn.href = `/track.html?id=${lastOrder}`;
        } else {
            headerBtn.style.display = 'none';
        }
    }
}

// ─── RUN ───
init();
