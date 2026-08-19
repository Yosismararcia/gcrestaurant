/* ============================================================
   G&CRestaurant · app.js (VISTA CLIENTE)
   Interfaz pública alimentada por /api/datos, que expone SOLO
   promociones, banners y el Especial del Día. El inventario,
   las recetas y los avisos viven en el panel de administrador.
   ============================================================ */
(() => {
  "use strict";

  function reportarError(msg) {
    const banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:1000;background:#c62828;color:#fff;" +
      "padding:8px 14px;font-size:12px;font-family:monospace;white-space:pre-wrap;box-shadow:0 4px 14px rgba(0,0,0,.3)";
    banner.textContent = "⚠️ ERROR: " + msg;
    document.body.prepend(banner);
  }
  window.addEventListener("error", (e) => reportarError(e.message || "desconocido"));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason || {};
    reportarError("Promesa rechazada: " + (r.message || r || "desconocido"));
  });

  const ESTADO = {
    promociones: [],
    banners: [],
    recetas: [],
    comentarios: [],
    contenido: { copy: {}, especial: {} },
    resumen: {},
    sesion: null, // { autenticado, admin, rol, usuario, nombre, cedula }
    carrito: {}, // clave = nombre normalizado, valor = { plato, qty }
    misPedidos: [],
  };

  const EMOJIS = {
    "especial del mar": "🐟", "japón": "🍣", "méxico": "🌮", "italia": "🍝",
    "españa": "🥘", "eeuu": "🍔", "tailandia": "🍜", "india": "🍛",
    "light": "🥗", "clásicos": "🍗", "sopas": "🍲", "bebidas": "🍹",
    "postres": "🍰", "zero waste": "🌿",
  };

  let starSelector = null;

  const MONEDA = "S/";

  const $ = (sel) => document.querySelector(sel);
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const formatear = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const emojiPorCategoria = (cat) => EMOJIS[(cat || "").toLowerCase()] || "🍽️";

  const imgProxy = (url) =>
    /^https?:\/\/(commons\.wikimedia\.org|upload\.wikimedia\.org)\//.test(url || "")
      ? `${location.origin}/img?url=${encodeURIComponent(url)}`
      : url || "";

  const tituloBonito = (s) =>
    (s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));

  function topDeTarjeta(p, emoji) {
    const hash = [...(p.plato || "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
    const fallback = () => `<span class="card__emoji-fb card__emoji-fb--warm${hash + 2}">${emoji}</span>`;
    if (p.imagen) {
      return `
        <img class="card__foto" src="${imgProxy(p.imagen)}" alt="${p.plato}" loading="lazy"
             onerror="this.remove(); this.nextElementSibling.hidden = false;">
        ${fallback()}`;
    }
    return fallback();
  }


  /* ---------- render: stats públicas ---------- */
  function renderStats() {
    $("#statPromos").textContent = ESTADO.resumen.total_promociones ?? ESTADO.promociones.length;
    $("#statPlatos").textContent = ESTADO.promociones.length;
    $("#statComentarios").textContent = ESTADO.resumen.total_comentarios ?? ESTADO.comentarios.length;
  }

  /* ---------- render: sesión del cliente ---------- */
  function renderUsuario() {
    const s = ESTADO.sesion;
    const chip = $("#userChip");
    const btn = $("#btnIngresar");
    if (s && s.autenticado) {
      $("#userNombre").textContent = s.nombre || s.usuario;
      $("#userCedula").textContent = s.rol === "admin" ? "Administrador" : ("Cédula " + (s.cedula || "—"));
      chip.hidden = false;
      btn.hidden = true;
    } else {
      chip.hidden = true;
      btn.hidden = false;
    }
  }

  /* ---------- especial + destacadas unificadas (Especial SIEMPRE primero) ---------- */
  function especialActual() {
    return Object.values(ESTADO.contenido.especial || {})[0] || null;
  }

  function tarjetaFeat(e, idx) {
    const p = ESTADO.promociones.find((x) => norm(x.plato) === norm(e.plato)) || {};
    const conPrecio = Number.isFinite(p.precio_final) && Number.isFinite(p.precio_base);
    const precioHtml = conPrecio
      ? `<span class="band__precio">${MONEDA} ${formatear(p.precio_final)} <s>${MONEDA} ${formatear(p.precio_base)}</s></span>`
      : `<span class="band__precio">${MONEDA} —</span>`;
    const descripcion = e.descripcion_larga || p.descripcion ||
      `Elaborado con lo más fresco del día: ${(e.inspirado_en || []).join(", ")}.`;
    return `
      <article class="card card--feat reveal" style="animation-delay:${idx * 80}ms" data-detalle="${e.plato}">
        <div class="card__img">${topDeTarjeta(e, "🐟")}</div>
        <div class="card__body">
          <span class="badge badge--dia">⚡ Especial del Día · Zero Waste</span>
          <h3 class="card__title">${tituloBonito(e.plato)}</h3>
          <p class="card__text">${descripcion}</p>
          <div class="card__meta"><span>🌿 ${(e.inspirado_en || []).slice(0, 3).join(", ")}</span></div>
          <div class="card__foot">
            ${precioHtml}
            <button class="btn btn--primary btn--cta-s" data-detalle="${e.plato}" type="button">Ver detalle</button>
          </div>
        </div>
      </article>`;
  }

  function tarjetaUnificada(p, idx) {
    const conPrecio = Number.isFinite(p.precio_final) && Number.isFinite(p.precio_base);
    const precioHtml = conPrecio
      ? `<div>
           <span class="card__precio" style="text-decoration:line-through;opacity:.55;font-size:.85em">${MONEDA} ${formatear(p.precio_base)}</span>
           <span class="card__precio">${MONEDA} ${formatear(p.precio_final)}</span>
         </div>`
      : `<span class="card__precio">${MONEDA} —</span>`;
    const motivo = p.razon
      ? `<span class="card__razon">${p.razon === "Variedad de la semana" ? "🎡" : p.razon === "Rescata frescura" ? "🌿" : "🏆"} ${p.razon}</span>`
      : "";
    return `
      <article class="card card--carousel reveal" style="animation-delay:${idx * 60}ms" data-detalle="${p.plato}">
        <div class="card__img">
          ${topDeTarjeta(p, emojiPorCategoria(p.categoria))}
          <span class="badge badge--descuento">-${p.descuento}%</span>
          <span class="badge badge--categoria">${p.categoria}</span>
        </div>
        <div class="card__body">
          <h3 class="card__title">${p.plato}</h3>
          <p class="card__text">${p.descripcion}</p>
          ${motivo}
          <div class="card__foot">
            ${precioHtml}
            <button class="btn btn--primary btn--cta-s" data-detalle="${p.plato}" type="button">Ver detalle</button>
          </div>
        </div>
      </article>`;
  }

  function renderUnificado() {
    const grid = $("#gridUnificado");
    if (!grid) return;
    const e = especialActual();
    const normE = e ? norm(e.plato) : null;
    const destacadas = (ESTADO.destacadas || [])
      .filter((d) => !normE || norm(d.plato) !== normE)
      .slice(0, 6);
    const cartas = [];
    if (e) cartas.push(tarjetaFeat(e, 0));
    destacadas.forEach((d, i) => cartas.push(tarjetaUnificada(d, e ? i + 1 : i)));
    grid.innerHTML = cartas.join("") ||
      `<p class="empty">Hoy aún no tenemos especiales ni destacadas. Vuelve en un momento. 🌱</p>`;
  }

  /* ---------- modal de detalle + anuncio del especial ---------- */
  let detallePlato = null;
  let detalleQty = 1;

  function imagenGrande(p, emoji, clase = "detalle__img") {
    const fallback = `<span class="detalle__emoji">${emoji}</span>`;
    if (p && p.imagen) {
      return `
        <div class="${clase}">
          <img class="detalle__foto" src="${imgProxy(p.imagen)}" alt="${p.plato || ""}" loading="eager"
               onerror="this.remove(); this.nextElementSibling.hidden = false;">
          ${fallback}
        </div>`;
    }
    return `<div class="${clase}">${fallback}</div>`;
  }

  function encontrarPromo(plato) {
    return ESTADO.promociones.find((x) => norm(x.plato) === norm(plato)) || null;
  }

  function abrirDetallePlato(plato) {
    const p = encontrarPromo(plato);
    if (!p) return;
    const e = especialActual() && norm(especialActual().plato) === norm(plato) ? especialActual() : null;
    detallePlato = plato;
    detalleQty = 1;
    $("#modalAnuncio").hidden = true;
    pintarDetalle(p, e);
    $("#modalEspecial").hidden = false;
    $("#overlay").hidden = false;
  }

  function pintarDetalle(p, e) {
    const conPrecio = Number.isFinite(p.precio_final) && Number.isFinite(p.precio_base);
    const precioHtml = conPrecio
      ? `<div class="detalle__precios">
           <span class="detalle__precio">${MONEDA} ${formatear(p.precio_final)}</span>
           <s class="detalle__precio-base">${MONEDA} ${formatear(p.precio_base)}</s>
           <span class="badge badge--descuento">-${p.descuento}%</span>
         </div>`
      : `<span class="detalle__precio">${MONEDA} —</span>`;
    const badge = e
      ? `<span class="badge badge--dia">⚡ Especial del Día · Zero Waste</span>`
      : `<span class="badge badge--categoria">${p.categoria}</span>`;
    const recetaHtml = e && e.receta
      ? `<div class="receta detalle__receta"><b>Preparación del chef:</b>\n${e.receta}</div>`
      : "";
    const inspiradoHtml = e && (e.inspirado_en || []).length
      ? `<p class="detalle__inspirado"><b>Inspirado en:</b> ${e.inspirado_en.join(", ")}</p>`
      : "";
    const descripcion = p.descripcion_larga || p.descripcion;
    $("#modalContenido").innerHTML = `
      ${imagenGrande(e || p, emojiPorCategoria(p.categoria))}
      <span class="detalle__head">
        ${badge}
        <span class="detalle__dias">🗓️ ${p.dias}</span>
      </span>
      <h3 class="modal__title">${e ? tituloBonito(e.plato) : p.plato}</h3>
      ${precioHtml}
      <p class="detalle__texto">${descripcion}</p>
      ${inspiradoHtml}
      ${recetaHtml}
      <div class="detalle__pedido">
        <div class="detalle__stepper" role="group" aria-label="Cantidad">
          <button class="item-pedido__c" data-detalle-restar type="button">−</button>
          <b class="detalle__qty" id="detalleQty">1</b>
          <button class="item-pedido__c" data-detalle-sumar type="button">+</button>
        </div>
        <button class="btn btn--primary" data-detalle-confirmar type="button">Añadir <b id="detalleQtyBtn">1</b> al pedido</button>
      </div>`;
  }

  function mostrarAnuncio() {
    if (sessionStorage.getItem("gc_anuncio_visto")) return;
    const e = especialActual();
    if (!e) return;
    const p = encontrarPromo(e.plato);
    setTimeout(() => {
      const conPrecio = Number.isFinite(p.precio_final);
      const precioHtml = conPrecio
        ? `<span class="anuncio__precio">${MONEDA} ${formatear(p.precio_final)} <s>${MONEDA} ${formatear(p.precio_base)}</s></span>`
        : "";
      const descripcion = e.descripcion_larga || (p && p.descripcion_larga) ||
        `Elaborado con lo más fresco del día: ${(e.inspirado_en || []).join(", ")}.`;
      $("#modalAnuncio").innerHTML = `
        <div class="modal__card anuncio">
          <button class="modal__close" data-cerrar-anuncio type="button" aria-label="Cerrar">×</button>
          ${imagenGrande(e, "🐟", "anuncio__img")}
          <span class="badge badge--dia">⚡ Especial del Día · Zero Waste</span>
          <h3 class="modal__title" id="modalAnuncioTitulo">${tituloBonito(e.plato)}</h3>
          ${precioHtml}
          <p class="detalle__texto">${descripcion}</p>
          <p class="anuncio__foot">
            <button class="btn btn--primary" data-anuncio-pedir type="button">Añadir al pedido</button>
            <button class="btn btn--ghost" data-cerrar-anuncio type="button">Ahora no</button>
          </p>
        </div>`;
      $("#modalAnuncio").hidden = false;
      $("#overlay").hidden = false;
    }, 900);
  }

  function cerrarAnuncio() {
    $("#modalAnuncio").hidden = true;
    sessionStorage.setItem("gc_anuncio_visto", "1");
    if ($("#modalEspecial").hidden && !$("#drawerCarrito").classList.contains("open")) $("#overlay").hidden = true;
  }

  /* ---------- render: menú (precios regulares, con buscador) ---------- */
  function renderMenu() {
    const grid = $("#gridMenu");
    const q = ($("#buscador").value || "").trim().toLowerCase();
    const lista = q
      ? ESTADO.promociones.filter((p) => (p.plato || "").toLowerCase().includes(q))
      : ESTADO.promociones.slice();
    const empty = $("#emptyMenu");
    if (empty) empty.hidden = lista.length > 0;
    if (!lista.length) {
      grid.innerHTML = q
        ? ""
        : `<article class="card"><div class="card__body"><p class="empty">El menú aún no está disponible. Vuelve pronto.</p></div></article>`;
      return;
    }
    grid.innerHTML = lista.map((p, idx) => {
      const precio = Number.isFinite(p.precio_base)
        ? `<span class="card__precio">${MONEDA} ${formatear(p.precio_base)}</span>`
        : `<span class="card__precio">${MONEDA} —</span>`;
      return `
      <article class="card reveal" style="animation-delay:${idx * 40}ms" data-detalle="${p.plato}">
        <div class="card__img">
          ${topDeTarjeta(p, emojiPorCategoria(p.categoria))}
          <span class="badge badge--categoria">${p.categoria}</span>
        </div>
        <div class="card__body">
          <h3 class="card__title">${p.plato}</h3>
          <p class="card__text">${p.descripcion}</p>
          <div class="card__meta"><span>🗓️ ${p.dias}</span><span>${emojiPorCategoria(p.categoria)} ${p.categoria}</span></div>
          <div class="card__foot">
            ${precio}
            <button class="btn btn--primary btn--cta-s" data-detalle="${p.plato}" type="button">Ver detalle</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------- render: recetas fáciles (aprende y cocina en casa) ---------- */
  const COMPARTIR_RECETA = {
    whatsapp: (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`,
    facebook: (texto, url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(texto)}`,
    twitter: (texto) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(texto)}`,
  };

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function textoReceta(r) {
    const url = location.origin + "/cliente#recetas";
    return [
      `👨‍🍳 Aprende a cocinar: ${r.titulo}`,
      `⏱️ En ${r.tiempo_min || 0} minutos · para ${r.porciones || 1} persona(s)`,
      `🧺 Ingredientes: ${(r.ingredientes || []).join(", ")}`,
      `🍴 Pasos: ${(r.pasos || []).join(" → ")}`,
      ``,
      `📍 Del menú de G&CRestaurant: ${url}`,
      `#AprendeYCocina #GCRestaurant #RecetasFaciles`,
    ].join("\n");
  }

  function renderRecetas() {
    const grid = $("#gridRecetas");
    const lista = ESTADO.recetas || [];
    const empty = $("#emptyRecetas");
    if (empty) empty.hidden = lista.length > 0;
    if (!grid) return;
    grid.innerHTML = lista.map((r, idx) => {
      const urlPagina = location.origin + "/cliente#recetas";
      const texto = textoReceta(r);
      const imagen = r.imagen
        ? `<img class="card__foto" src="${imgProxy(r.imagen)}" alt="${r.titulo}" loading="lazy"
             onerror="this.remove(); this.nextElementSibling.hidden = false;">
           <span class="card__emoji-fb card__emoji-fb--warm2" hidden>🍳</span>`
        : `<span class="card__emoji-fb card__emoji-fb--warm2">🍳</span>`;
      return `
      <article class="card receta-card reveal" style="animation-delay:${idx * 60}ms">
        <div class="card__img">${imagen}</div>
        <div class="card__body">
          <span class="badge badge--dia">👨‍🍳 Receta del día</span>
          <h3 class="card__title">${r.titulo}</h3>
          <div class="card__meta">
            <span>⏱️ ${r.tiempo_min || 0} min</span>
            <span>🍽️ ${r.porciones || 1} porc.</span>
          </div>
          <p class="card__text"><b>🧺 Ingredientes:</b> ${(r.ingredientes || []).join(", ")}.</p>
          <ol class="receta__pasos">${(r.pasos || []).map((p) => `<li>${p}</li>`).join("")}</ol>
          <div class="card__tools">
            <a class="card__copy" href="${COMPARTIR_RECETA.whatsapp(texto)}" target="_blank" rel="noopener">🟢 WhatsApp</a>
            <a class="card__copy" href="${COMPARTIR_RECETA.facebook(texto, urlPagina)}" target="_blank" rel="noopener">📘 Facebook</a>
            <a class="card__copy" href="${COMPARTIR_RECETA.twitter(texto)}" target="_blank" rel="noopener">🐦 X</a>
            <button class="card__copy" data-copiar-receta="${r.id}" type="button">🔗 Copiar</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------- render: comentarios ---------- */
  const ESTRELLAS = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  function renderComentarios() {
    const grid = $("#gridComentarios");
    const lista = ESTADO.comentarios || [];
    $("#emptyComentarios").hidden = lista.length > 0;
    grid.innerHTML = lista.map((c, idx) => {
      const fecha = c.creado ? new Date(c.creado).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "";
      return `
      <article class="card card--comentario reveal" style="animation-delay:${idx * 40}ms">
        <div class="card__body">
          <span class="comment__autor">${c.autor}</span>
          <span class="comment__stars">${ESTRELLAS(Math.max(1, Math.min(5, c.estrellas || 5)))}</span>
          <p class="comment__texto">“${c.texto}”</p>
          <div class="card__foot"><span></span><small style="color:var(--tinta-suave)">${fecha}</small></div>
        </div>
      </article>`;
    }).join("");
  }

  function estrellasSel() {
    let valor = 5;
    const btns = document.querySelectorAll("#starsSel .star");
    const pintar = () => btns.forEach((b) => b.classList.toggle("activo", Number(b.dataset.estrella) <= valor));
    btns.forEach((b) => b.addEventListener("click", () => { valor = Number(b.dataset.estrella); pintar(); }));
    pintar();
    return { get: () => valor };
  }

  async function enviarComentario(ev) {
    ev.preventDefault();
    const msg = $("#msgComentario");
    msg.hidden = true;
    const texto = $("#inComentario").value.trim();
    if (!texto) { msg.textContent = "Escribe tu comentario."; msg.hidden = false; msg.className = "auth__msg auth__msg--err"; return; }
    try {
      const res = await fetch("/api/comentario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, estrellas: starSelector.get() }),
      });
      const data = await res.json();
      if (!data.ok) { msg.textContent = data.error || "No se pudo publicar."; msg.className = "auth__msg auth__msg--err"; msg.hidden = false; return; }
      $("#inComentario").value = "";
      msg.textContent = data.mensaje;
      msg.className = "auth__msg auth__msg--ok";
      msg.hidden = false;
      ESTADO.comentarios.unshift(data.comentario);
      ESTADO.resumen.total_comentarios = (ESTADO.resumen.total_comentarios || 0) + 1;
      renderComentarios();
      renderStats();
      setTimeout(() => { msg.hidden = true; }, 6000);
    } catch (err) {
      msg.textContent = "Error de conexión. Intenta de nuevo.";
      msg.className = "auth__msg auth__msg--err";
      msg.hidden = false;
    }
  }

  /* ---------- render: mis pedidos ---------- */
  const ESTADOS = {
    nuevo: { texto: "Nuevo", clase: "tag--crit" },
    en_preparacion: { texto: "En preparación", clase: "tag--azul" },
    listo: { texto: "Listo 🍽️", clase: "tag--warn" },
    entregado: { texto: "Entregado ✅", clase: "tag--ok" },
  };

  function renderMisPedidos() {
    const grid = $("#gridPedidos");
    const lista = ESTADO.misPedidos || [];
    $("#emptyPedidos").hidden = lista.length > 0;
    grid.innerHTML = lista.map((p, idx) => {
      const st = ESTADOS[p.estado] || ESTADOS.nuevo;
      const platos = (p.platos || []).map((d) => `${d.cantidad ?? 1}× ${d.plato}`).join(" · ");
      const fecha = p.creado ? new Date(p.creado).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
      return `
      <article class="card card--pedido reveal" style="animation-delay:${idx * 40}ms">
        <div class="card__body">
          <div class="card__meta">
            <span class="orden__numero">#${p.numero_orden}</span>
            <span class="tag ${st.clase}">${st.texto}</span>
          </div>
          <p class="orden__platos">${platos}</p>
          <div class="card__foot">
            <span class="orden__total">${MONEDA} ${formatear(p.total)}</span>
            <small style="color:var(--tinta-suave)">${fecha}</small>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  async function cargarMisPedidos() {
    try {
      const res = await fetch("/api/mis-pedidos");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) ESTADO.misPedidos = data.pedidos || [];
      renderMisPedidos();
    } catch (err) { /* silencioso en segundo plano */ }
  }

  /* ---------- carrito (pedido del cliente) ---------- */
  function contarCarrito() {
    return Object.values(ESTADO.carrito).reduce((s, x) => s + x.qty, 0);
  }

  function renderCarrito() {
    const total = contarCarrito();
    $("#cartBadge").textContent = total;
    $("#btnConfirmarPedido").disabled = total === 0;
    const body = $("#drawerBody");
    const filas = Object.entries(ESTADO.carrito);
    if (!filas.length) {
      body.innerHTML = `<p class="empty">Aún no elegiste platillos. Toca <b>+</b> en una promoción. 🍽️</p>`;
    } else {
      body.innerHTML = filas.map(([k, item]) => {
        const promo = ESTADO.promociones.find((p) => norm(p.plato) === k);
        const precio = promo && Number.isFinite(promo.precio_final) ? promo.precio_final : null;
        return `
          <div class="item-pedido">
            <div class="item-pedido__info">
              <div class="item-pedido__titulo">${item.plato}</div>
              <div class="item-pedido__sub">${precio ? `${MONEDA} ${formatear(precio)} c/u` : "Precio por confirmar"}</div>
            </div>
            <button class="item-pedido__c" data-restar="${item.plato}" type="button">−</button>
            <b>${item.qty}</b>
            <button class="item-pedido__c" data-sumar="${item.plato}" type="button">+</button>
          </div>`;
      }).join("");
    }
    renderTotales();
  }

  function renderTotales() {
    let totalFinal = 0;
    Object.values(ESTADO.carrito).forEach(({ plato, qty }) => {
      const promo = ESTADO.promociones.find((p) => norm(p.plato) === norm(plato));
      if (promo && Number.isFinite(promo.precio_final)) totalFinal += promo.precio_final * qty;
    });
    $("#totalPedido").textContent = `${MONEDA} ${formatear(totalFinal)}`;
  }

  function sumar(item, delta) {
    item.qty = Math.max(0, item.qty + delta);
    if (item.qty === 0) delete ESTADO.carrito[norm(item.plato)];
    renderCarrito();
  }

  async function confirmarPedido() {
    if (!ESTADO.sesion || !ESTADO.sesion.autenticado) {
      if (window.GCAuth) window.GCAuth.abrir("login");
      return;
    }
    const nombres = [];
    Object.values(ESTADO.carrito).forEach(({ plato, qty }) => {
      const original = ESTADO.promociones.find((p) => norm(p.plato) === norm(plato));
      for (let i = 0; i < qty; i++) nombres.push(original ? original.plato : plato);
    });
    if (!nombres.length) return;
    const btn = $("#btnConfirmarPedido");
    btn.disabled = true; btn.textContent = "Procesando…";
    try {
      const res = await fetch("/api/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platos: nombres }),
      });
      const data = await res.json();
      if (data.ok) {
        ESTADO.carrito = {};
        renderCarrito();
        const orden = $("#ordenPedido");
        orden.hidden = false;
        orden.textContent = "🧾 Tu pedido #" + data.numero_orden + " fue registrado. El restaurante ya lo prepara.";
        orden.style.color = "var(--verde)";
        $("#notaPedido").textContent = "";
        cierreCarrito();
        setTimeout(() => { orden.hidden = true; }, 12000);
      } else {
        $("#notaPedido").textContent = "❌ " + (data.error || "No se pudo procesar el pedido.");
        $("#notaPedido").style.color = "var(--rojo)";
        setTimeout(() => { $("#notaPedido").textContent = ""; $("#notaPedido").style.color = "var(--verde)"; }, 6000);
      }
    } catch (err) {
      $("#notaPedido").textContent = "❌ Error de conexión con el restaurante.";
    }
    btn.disabled = false; btn.textContent = "Confirmar & descontar inventario ✔️";
  }

  /* ---------- modal ---------- */
  function abrirModalContenido(html) {
    $("#modalContenido").innerHTML = html;
    $("#modalEspecial").hidden = false;
    $("#overlay").hidden = false;
  }

  function cerrarModal() {
    $("#modalEspecial").hidden = true;
    $("#modalAnuncio").hidden = true;
    if (!$("#drawerCarrito").classList.contains("open")) $("#overlay").hidden = true;
  }

  /* ---------- drawer ---------- */
  function abrirCarrito() {
    $("#drawerCarrito").classList.add("open");
    $("#drawerCarrito").setAttribute("aria-hidden", "false");
    $("#overlay").hidden = false;
  }
  function cierreCarrito() {
    $("#drawerCarrito").classList.remove("open");
    $("#drawerCarrito").setAttribute("aria-hidden", "true");
    if ($("#modalEspecial").hidden) $("#overlay").hidden = true;
  }

  /* ---------- coordinación ---------- */
  function mostrarVista(nombre) {
    document.querySelectorAll(".vista").forEach((s) => {
      const activa = s.dataset.vista === nombre;
      s.classList.toggle("activa", activa);
    });
    document.querySelectorAll(".nav a[data-vista]").forEach((a) =>
      a.classList.toggle("activo", a.dataset.vista === nombre)
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTodo() {
    renderStats();
    renderMenu();
    renderUnificado();
    renderRecetas();
    renderCarrito();
  }

  function reveal() {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.style.opacity = ""; el.style.transform = "";
    });
  }

  /* ---------- eventos ---------- */
  function enlazar() {
    document.addEventListener("click", async (ev) => {
      const enlaceVista = ev.target.closest('a[data-vista]');
      if (enlaceVista) {
        ev.preventDefault();
        mostrarVista(enlaceVista.dataset.vista);
        return;
      }
      const sumarBtn = ev.target.closest("[data-sumar]");
      if (sumarBtn) { sumar(ESTADO.carrito[norm(sumarBtn.dataset.sumar)], 1); return; }
      const restarBtn = ev.target.closest("[data-restar]");
      if (restarBtn) { sumar(ESTADO.carrito[norm(restarBtn.dataset.restar)], -1); return; }

      const verCopy = ev.target.closest("[data-copy]");
      if (verCopy) {
        ev.stopPropagation();
        const c = ESTADO.contenido.copy[norm(verCopy.dataset.copy)];
        if (c) {
          abrirModalContenido(`
            <span class="badge badge--hero">📣 Publicación de Instagram</span>
            <h3 style="margin-top:14px">${verCopy.dataset.copy}</h3>
            <div class="receta">${c.texto}</div>
          `);
        }
        return;
      }

      const detalle = ev.target.closest("[data-detalle]");
      if (detalle) {
        abrirDetallePlato(detalle.dataset.detalle);
        return;
      }
      const detalleSumar = ev.target.closest("[data-detalle-sumar]");
      if (detalleSumar) {
        detalleQty = Math.min(20, detalleQty + 1);
        $("#detalleQty").textContent = detalleQty;
        $("#detalleQtyBtn").textContent = detalleQty;
        return;
      }
      const detalleRestar = ev.target.closest("[data-detalle-restar]");
      if (detalleRestar) {
        detalleQty = Math.max(1, detalleQty - 1);
        $("#detalleQty").textContent = detalleQty;
        $("#detalleQtyBtn").textContent = detalleQty;
        return;
      }
      const detalleConfirmar = ev.target.closest("[data-detalle-confirmar]");
      if (detalleConfirmar) {
        const plato = detallePlato;
        const k = norm(plato);
        if (!ESTADO.carrito[k]) ESTADO.carrito[k] = { plato, qty: 0 };
        sumar(ESTADO.carrito[k], detalleQty);
        cerrarModal();
        abrirCarrito();
        return;
      }
      const anuncioPedir = ev.target.closest("[data-anuncio-pedir]");
      if (anuncioPedir) {
        const e = especialActual();
        if (e) {
          const k = norm(e.plato);
          if (!ESTADO.carrito[k]) ESTADO.carrito[k] = { plato: e.plato, qty: 0 };
          sumar(ESTADO.carrito[k], 1);
        }
        cerrarAnuncio();
        abrirCarrito();
        return;
      }
      const cerrarAnuncioBtn = ev.target.closest("[data-cerrar-anuncio]");
      if (cerrarAnuncioBtn) {
        cerrarAnuncio();
        return;
      }
      const copiarReceta = ev.target.closest("[data-copiar-receta]");
      if (copiarReceta) {
        const r = (ESTADO.recetas || []).find((x) => String(x.id) === String(copiarReceta.dataset.copiarReceta));
        if (r) {
          const ok = await copiarTexto(textoReceta(r));
          copiarReceta.textContent = ok ? "✅ Copiado" : "Copiar";
          setTimeout(() => { copiarReceta.textContent = "🔗 Copiar"; }, 2200);
        }
        return;
      }

    });

    $("#btnCarrito").addEventListener("click", abrirCarrito);
    $("#btnSalir").addEventListener("click", () => {
      if (window.GCAuth) window.GCAuth.cerrarSesion();
    });
    $("#btnCerrarCarrito").addEventListener("click", cierreCarrito);
    $("#btnConfirmarPedido").addEventListener("click", confirmarPedido);
    $("#btnCerrarModal").addEventListener("click", cerrarModal);
    $("#btnIngresar").addEventListener("click", () => {
      if (window.GCAuth) window.GCAuth.abrir("login");
    });
    $("#overlay").addEventListener("click", () => { cierreCarrito(); cerrarModal(); });
    const buscador = $("#buscador");
    if (buscador) buscador.addEventListener("input", () => renderMenu());

    $("#navToggle").addEventListener("click", () => {
      document.querySelector(".nav").classList.toggle("open");
    });
    document.querySelectorAll("[data-nav]").forEach((a) =>
      a.addEventListener("click", () => document.querySelector(".nav").classList.remove("open"))
    );

    starSelector = estrellasSel();
    $("#formComentario").addEventListener("submit", enviarComentario);
  }

  /* ---------- inicio ---------- */
  async function iniciar() {
    enlazar();
    try {
      const res = await fetch("/api/datos");
      if (!res.ok) throw new Error(res.status);
      const datos = await res.json();
      ESTADO.promociones = datos.promociones || [];
      ESTADO.banners = datos.banners || [];
      ESTADO.recetas = datos.recetas || [];
      ESTADO.destacadas = datos.destacadas || [];
      ESTADO.comentarios = datos.comentarios || [];
      ESTADO.contenido = datos.contenido || { copy: {}, especial: {} };
      ESTADO.resumen = datos.resumen || {};
      ESTADO.sesion = datos.sesion || { autenticado: false, admin: false };
      renderUsuario();
      renderTodo();
      renderComentarios();
      mostrarAnuncio();
      cargarMisPedidos();
      setInterval(cargarMisPedidos, 5000);
      mostrarVista("inicio");
    } catch (err) {
      $("#gridUnificado").innerHTML = `<article class="card"><div class="card__body"><p class="empty">No se pudo conectar con el restaurante. Intenta de nuevo en unos segundos.</p></div></article>`;
      reportarError(err);
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
