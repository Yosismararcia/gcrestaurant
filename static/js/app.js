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
    "postres": "🍰",
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

  /* ---------- render: promociones ---------- */
  function renderPromos(filtro = "") {
    const grid = $("#gridPromos");
    const filtroCategoria = $("#filtroCategoria").value;
    const lista = ESTADO.promociones.filter((p) => {
      const texto = `${p.plato} ${p.categoria} ${p.descripcion} ${p.dias}`.toLowerCase();
      const coincideTexto = texto.includes(filtro.toLowerCase());
      const coincideCat = !filtroCategoria || p.categoria === filtroCategoria;
      return coincideTexto && coincideCat;
    });

    $("#emptyPromos").hidden = lista.length > 0;
    grid.innerHTML = lista.map((p, idx) => tarjetaPromo(p, idx)).join("");
  }

  function tarjetaPromo(p, idx) {
    const conPrecio = Number.isFinite(p.precio_final) && Number.isFinite(p.precio_base);
    const precioHtml = conPrecio
      ? `<div>
           <span class="card__precio" style="text-decoration:line-through;opacity:.55;font-size:.85em">${MONEDA} ${formatear(p.precio_base)}</span>
           <span class="card__precio">${MONEDA} ${formatear(p.precio_final)}</span>
         </div>`
      : `<span class="card__precio">${MONEDA} —</span>`;
    const copiaLista = ESTADO.contenido.copy[norm(p.plato)];
    const copyBtn = copiaLista
      ? `<span class="card__copy" data-copy="${p.plato}" role="button" title="Ver copy de Instagram">📣 Copy IG listo</span>`
      : "";
    const toolsBtn = "";
    return `
      <article class="card reveal" style="animation-delay:${idx * 60}ms">
        <div class="card__img">
          ${topDeTarjeta(p, emojiPorCategoria(p.categoria))}
          <span class="badge badge--descuento">-${p.descuento}%</span>
          <span class="badge badge--categoria">${p.categoria}</span>
        </div>
        <div class="card__body">
          <h3 class="card__title">${copiaLista ? "📣 " : ""}${p.plato}</h3>
          <p class="card__text">${p.descripcion}</p>
          <div class="card__meta"><span>🗓️ ${p.dias}</span><span>${emojiPorCategoria(p.categoria)} ${p.categoria}</span></div>
          ${copyBtn}
          ${toolsBtn}
          <div class="card__foot">
            ${precioHtml}
            <button class="btn btn--primary btn--cta-s" data-agregar="${p.plato}" type="button">+ Pedir</button>
          </div>
        </div>
      </article>`;
  }

  /* ---------- destacadas (lo más pedido + rescates, rotación semanal) ---------- */
  function tarjetaDestacada(p, idx) {
    const precio = Number.isFinite(p.precio_final) && Number.isFinite(p.precio_base)
      ? `<span class="band__precio">${MONEDA} ${formatear(p.precio_final)} <s>${MONEDA} ${formatear(p.precio_base)}</s></span>`
      : `<span class="band__precio">${MONEDA} —</span>`;
    const motivo = p.razon
      ? `<span class="band__tag">${p.razon === "Variedad de la semana" ? "🎡" : p.razon === "Rescata frescura" ? "🌿" : "🏆"} ${p.razon}</span>`
      : "";
    return `
      <article class="band__card reveal" style="animation-delay:${idx * 60}ms">
        <span class="band__off">-${p.descuento}%</span>
        <span class="band__emoji">${emojiPorCategoria(p.categoria)}</span>
        <h3 class="band__titulo">${p.plato}</h3>
        <p class="band__texto">${p.descripcion}</p>
        <div class="band__pie">
          <span>${p.categoria}</span>
          ${precio}
        </div>
        ${motivo}
        <button class="btn btn--primary btn--cta-s" data-agregar="${p.plato}" type="button">+ Pedir</button>
      </article>`;
  }

  function renderDestacadas() {
    const grid = $("#gridDestacadas");
    if (!grid) return;
    const lista = (ESTADO.destacadas || []).slice(0, 6);
    grid.innerHTML = lista.map((p, idx) => tarjetaDestacada(p, idx)).join("");
    const band = $("#bandDestacadas");
    if (band) band.hidden = lista.length === 0;
  }

  /* ---------- filtros ---------- */
  function poblarCategorias() {
    const sel = $("#filtroCategoria");
    const mapa = {};
    ESTADO.promociones.forEach((p) => { mapa[p.categoria] = true; });
    Object.keys(mapa).sort().forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      sel.appendChild(opt);
    });
  }

  /* ---------- render: especial del día (sin receta para clientes) ---------- */
  function renderEspecial() {
    const grid = $("#gridEspecial");
    const guardados = Object.values(ESTADO.contenido.especial || {});
    if (guardados.length) {
      grid.innerHTML = guardados.map((e, i) => tarjetaEspecialPublic(e, i)).join("");
      return;
    }
    const placeholder = {
      plato: "El plato sorpresa del día",
      imagen: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&auto=format&fit=crop&q=70",
    };
    grid.innerHTML = `
      <article class="card card--especial reveal">
        <div class="card__img">${topDeTarjeta(placeholder, "🍳")}</div>
        <div class="card__body">
          <span class="badge badge--dia">Hoy</span>
          <h3 class="card__title">El plato sorpresa del día</h3>
          <p class="card__text">Pregunta por la oferta del día: nuestro chef lo prepara con lo más fresco. ¡Hasta agotar stock!</p>
        </div>
      </article>`;
  }

  function tarjetaEspecialPublic(e, idx) {
    return `
      <article class="card card--especial reveal" style="animation-delay:${idx * 80}ms">
        <div class="card__img">${topDeTarjeta(e, "🐟")}</div>
        <div class="card__body">
          <span class="badge badge--dia">⚡ Hoy</span>
          <h3 class="card__title">${tituloBonito(e.plato)}</h3>
          <p class="card__text">Elaborado con lo más fresco del día: ${(e.inspirado_en || []).slice(0, 3).join(", ")}.</p>
          <p class="card__text" style="opacity:.75;font-size:.8rem">Disponible hasta agotar stock.</p>
        </div>
      </article>`;
  }

  /* ---------- render: menú (precios regulares) ---------- */
  function renderMenu() {
    const grid = $("#gridMenu");
    const lista = ESTADO.promociones.slice();
    if (!lista.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">El menú aún no está disponible. Vuelve pronto.</p></div></article>`;
      return;
    }
    grid.innerHTML = lista.map((p, idx) => {
      const precio = Number.isFinite(p.precio_base)
        ? `<span class="card__precio">${MONEDA} ${formatear(p.precio_base)}</span>`
        : `<span class="card__precio">${MONEDA} —</span>`;
      return `
      <article class="card reveal" style="animation-delay:${idx * 40}ms">
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
            <button class="btn btn--ghost btn--cta-s" data-ir-promo="${p.plato}" type="button">Ver promoción</button>
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
    $("#overlay").hidden = true;
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
    renderPromos($("#buscador").value);
    renderEspecial();
    renderDestacadas();
    renderCarrito();
  }

  function reveal() {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.style.opacity = ""; el.style.transform = "";
    });
  }

  /* ---------- eventos ---------- */
  function enlazar() {
    document.addEventListener("click", (ev) => {
      const enlaceVista = ev.target.closest('a[data-vista]');
      if (enlaceVista) {
        ev.preventDefault();
        mostrarVista(enlaceVista.dataset.vista);
        return;
      }
      const irPromo = ev.target.closest("[data-ir-promo]");
      if (irPromo) {
        $("#buscador").value = irPromo.dataset.irPromo;
        renderPromos(irPromo.dataset.irPromo);
        mostrarVista("promociones");
        return;
      }
      const agregar = ev.target.closest("[data-agregar]");
      if (agregar) {
        const plato = agregar.dataset.agregar;
        const k = norm(plato);
        if (!ESTADO.carrito[k]) ESTADO.carrito[k] = { plato, qty: 0 };
        sumar(ESTADO.carrito[k], 1);
        ev.preventDefault();
        return;
      }
      const sumarBtn = ev.target.closest("[data-sumar]");
      if (sumarBtn) { sumar(ESTADO.carrito[norm(sumarBtn.dataset.sumar)], 1); return; }
      const restarBtn = ev.target.closest("[data-restar]");
      if (restarBtn) { sumar(ESTADO.carrito[norm(restarBtn.dataset.restar)], -1); return; }

      const verCopy = ev.target.closest("[data-copy]");
      if (verCopy) {
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
    $("#buscador").addEventListener("input", (ev) => renderPromos(ev.target.value));
    $("#filtroCategoria").addEventListener("change", () => renderPromos($("#buscador").value));

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
      ESTADO.destacadas = datos.destacadas || [];
      ESTADO.comentarios = datos.comentarios || [];
      ESTADO.contenido = datos.contenido || { copy: {}, especial: {} };
      ESTADO.resumen = datos.resumen || {};
      ESTADO.sesion = datos.sesion || { autenticado: false, admin: false };
      renderUsuario();
      poblarCategorias();
      renderTodo();
      renderComentarios();
      cargarMisPedidos();
      setInterval(cargarMisPedidos, 5000);
      mostrarVista("inicio");
    } catch (err) {
      $("#gridPromos").innerHTML = `<article class="card"><div class="card__body"><p class="empty">No se pudo conectar con el restaurante. Intenta de nuevo en unos segundos.</p></div></article>`;
      reportarError(err);
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
