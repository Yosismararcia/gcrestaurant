/* ============================================================
   G&CRestaurant · Panel de administrador
   Módulos: Resumen e Impacto · Pedidos y Clientes ·
            Menú y Marketing · Inventario y Stock
   Cada módulo tiene un submenú con sus secciones.
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

  const MONEDA = "S/";
  const $ = (sel) => document.querySelector(sel);
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]+$/;
  const SOLO_DIGITOS = /^\d+$/;

  function validarTelefono(v, permitirVacio = true) {
    const limpio = (v || "").replace(/[\s\-().]/g, "");
    if (!limpio) return permitirVacio;
    return SOLO_DIGITOS.test(limpio) && limpio.length >= 6 && limpio.length <= 15;
  }
  function validarEmail(v, permitirVacio = true) {
    const s = (v || "").trim();
    if (!s) return permitirVacio;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  }
  function validarNombre(v, permitirVacio = true, max = 80) {
    const s = (v || "").trim();
    if (!s) return permitirVacio;
    return SOLO_LETRAS.test(s) && s.length <= max && !/\s{2,}/.test(s);
  }
  function validarUsuario(v) {
    return /^[A-Za-z0-9_]{3,30}$/.test((v || "").trim());
  }
  const vMsg = (bien, msg) => bien || msg;

  let DATA = null;
  let PEDIDOS = [];
  let refrescoTimer = null;
  let invFiltro = "";
  let recFiltro = "";

  const formatear = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tituloBonito = (s) =>
    (s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));

  const ESTADOS_ADMIN = {
    nuevo: { texto: "Nuevo", clase: "tag--crit" },
    en_preparacion: { texto: "En preparación", clase: "tag--azul" },
    listo: { texto: "Listo", clase: "tag--warn" },
    entregado: { texto: "Entregado", clase: "tag--ok" },
  };

  const MODULOS = {
    resumen: [
      { vista: "resumen-impacto", label: "📈 Impacto" },
      { vista: "resumen-alertas", label: "🚨 Alertas de vencimiento" },
    ],
    pedidos: [
      { vista: "pedidos", label: "🧾 Pedidos" },
      { vista: "clientes", label: "👥 Clientes" },
    ],
    menu: [
      { vista: "menu-recetas", label: "📖 Recetas de cocina" },
      { vista: "menu-especial", label: "⚡ Especial del Día" },
      { vista: "menu-recetas-faciles", label: "👨‍🍳 Recetas Fáciles" },
      { vista: "menu-marketing", label: "📣 Marketing y Anuncios" },
    ],
    inventario: [
      { vista: "inv-insumos", label: "📦 Insumos" },
      { vista: "inv-movimientos", label: "🏭 Movimientos" },
      { vista: "inv-proveedores", label: "🤝 Proveedores" },
    ],
  };
  const VISTA_MODULO = {};
  Object.entries(MODULOS).forEach(([m, secs]) => secs.forEach((s) => { VISTA_MODULO[s.vista] = m; }));

  const imgProxy = (url) =>
    /^https?:\/\/(commons\.wikimedia\.org|upload\.wikimedia\.org)\//.test(url || "")
      ? `${location.origin}/img?url=${encodeURIComponent(url)}`
      : url || "";

  function fotoEspecial(e) {
    if (e.imagen) {
      return `
        <img class="card__foto" src="${imgProxy(e.imagen)}" alt="${e.plato || "Especial del Día"}" loading="lazy"
             onerror="this.remove(); this.nextElementSibling.hidden = false;">
        <span class="card__emoji-fb card__emoji-fb--warm3" hidden>🍳</span>`;
    }
    return `<span class="card__emoji-fb card__emoji-fb--warm3">🍳</span>`;
  }

  function abrirAcceso() {
    if (window.GCAuth) window.GCAuth.abrir("login");
  }

  function toggleUI(esAdmin) {
    $("#dashboard").hidden = !esAdmin;
    $("#btnIngresar").hidden = esAdmin;
    $("#btnLogout").hidden = !esAdmin;
    $("#adminNav").hidden = !esAdmin;
    if (!esAdmin) $("#adminSubnav").hidden = true;
  }

  function pintarSubnav(modulo, activa) {
    const nav = $("#adminSubnav");
    if (!nav) return;
    const secs = MODULOS[modulo] || [];
    if (!secs.length) { nav.hidden = true; return; }
    nav.innerHTML = secs.map((s) =>
      `<button class="admin-subnav__btn${s.vista === activa ? " activo" : ""}" data-vista="${s.vista}" type="button">${s.label}</button>`
    ).join("");
    nav.hidden = false;
  }

  function mostrarVistaAdmin(vista) {
    const modulo = VISTA_MODULO[vista] || "resumen";
    document.querySelectorAll("#dashboard .admin-vista").forEach((v) =>
      v.classList.toggle("activa", v.dataset.vista === vista)
    );
    document.querySelectorAll(".admin-nav__btn").forEach((b) =>
      b.classList.toggle("activo", b.dataset.modulo === modulo)
    );
    pintarSubnav(modulo, vista);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirModalContenido(html) {
    $("#modalContenido").innerHTML = html;
    $("#modalEspecial").hidden = false;
    $("#overlay").hidden = false;
  }

  function cerrarModal() {
    $("#modalEspecial").hidden = true;
    $("#overlay").hidden = true;
  }

  async function apiPost(ruta, cuerpo) {
    const res = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const texto = await res.text();
    let data = {};
    try { data = texto ? JSON.parse(texto) : {}; } catch (e) { data = {}; }
    if (!res.ok || data.ok === false) {
      const html = texto.trim().startsWith("<") || texto.trim().startsWith("<!doctype");
      const err = data.error || (html
        ? "El servidor respondió una página. Reinicia el servidor: python api/index.py"
        : `Error ${res.status}`);
      throw new Error(err);
    }
    return data;
  }

  async function cargarDatosAdmin(vista) {
    const res = await fetch("/api/admin/datos");
    if (res.status === 401) {
      toggleUI(false);
      abrirAcceso();
      throw new Error("Sesión expirada");
    }
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
    toggleUI(true);
    renderPaneles();
    cargarPedidos();
    mostrarVistaAdmin(vista || "resumen-impacto");
    iniciarRefresco();
  }

  /* ============================================================
     MÓDULO 1 · RESUMEN E IMPACTO
     ============================================================ */
  function renderKpis() {
    const r = DATA.resumen;
    $("#kEnRiesgo").textContent = `${MONEDA} ${formatear(r.valor_riesgo)}`;
    $("#kRescatados").textContent = `${MONEDA} ${formatear(r.rescatados)}`;
    $("#kValorInventario").textContent = `${MONEDA} ${formatear(r.valor_inventario)}`;
    $("#kVentas").textContent = `${MONEDA} ${formatear(r.ventas)}`;
    $("#ventanaAlertas").textContent = DATA.ventana_alertas;
  }

  function renderAlertas() {
    const tbody = $("#tbodyAlertas");
    const empty = $("#emptyAlertas");
    const criticos = DATA.especiales || [];
    if (empty) empty.hidden = criticos.length > 0;
    if (!tbody) return;
    const propuestaDe = (insumo) =>
      (DATA.propuestas || []).find((x) => norm(x.insumo) === norm(insumo));
    tbody.innerHTML = criticos.map((i) => {
      const dias = i.dias_para_caducar;
      const texto = dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : dias === 0 ? "Caduca HOY" : `Expira en ${dias}d`;
      const nivel = dias < 0 || dias <= 1 ? '<span class="tag tag--crit">🔴 Crítico</span>'
        : dias <= 3 ? '<span class="tag tag--warn">🟡 Alto</span>'
        : '<span class="tag tag--warn">🟠 Medio</span>';
      const prop = propuestaDe(i.nombre);
      const platos = [...new Set((((prop || {}).platos) || []).map((p) => p.plato))];
      const accion = platos.length
        ? `<button class="btn btn--cta-s" data-especial="${platos[0]}" type="button"
             title="Convierte «${platos[0]}» en el Especial del Día${platos.length > 1 ? " (primer platillo que rescata este insumo)" : ""}">⚡ Convertir en Especial del Día</button>`
        : '<span class="tag tag--warn">Sin platillo</span>';
      return `
        <tr>
          <td><strong>${i.vencido ? "☠️ " : ""}${i.nombre}</strong></td>
          <td class="num">${i.stock} ${i.unidad}</td>
          <td class="num"><strong>${MONEDA} ${formatear(i.valor_linea)}</strong></td>
          <td><span class="tag ${dias < 0 || dias <= 1 ? "tag--crit" : dias <= 3 ? "tag--warn" : "tag--ok"}">${texto}</span></td>
          <td>${nivel}</td>
          <td>${accion}</td>
        </tr>`;
    }).join("");
  }

  /* ============================================================
     MÓDULO 2 · PEDIDOS Y CLIENTES
     ============================================================ */
  function renderPedidos() {
    const tbody = $("#tbodyPedidos");
    const lista = PEDIDOS || [];
    const empty = $("#emptyPedidos");
    if (empty) empty.hidden = lista.length > 0;
    if (!tbody) return;
    tbody.innerHTML = lista.map((p) => {
      const st = ESTADOS_ADMIN[p.estado] || ESTADOS_ADMIN.nuevo;
      const platos = (p.platos || []).map((d) => `${d.cantidad ?? 1}× ${d.plato}`).join(" · ");
      const acciones = [];
      if (!p.visto) acciones.push(`<button class="btn btn--cta-s" data-pvisto="${p.id}" type="button">✓ Ver</button>`);
      if (p.estado === "nuevo") acciones.push(`<button class="btn btn--cta-s" data-pestado="${p.id}" data-estado="en_preparacion" type="button">→ Preparando</button>`);
      if (p.estado === "en_preparacion") acciones.push(`<button class="btn btn--cta-s" data-pestado="${p.id}" data-estado="listo" type="button">→ Listo</button>`);
      if (p.estado === "listo") acciones.push(`<button class="btn btn--cta-s" data-pestado="${p.id}" data-estado="entregado" type="button">→ Entregado</button>`);
      if (p.estado === "entregado") acciones.push(`<span class="tag tag--ok">✔ Completado</span>`);
      const hora = p.creado ? new Date(p.creado).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "";
      return `
        <tr${p.visto ? "" : ' style="background:#fff4e6"'}>
          <td><strong>#${p.numero_orden}</strong><br><small style="color:var(--tinta-suave)">${hora}</small></td>
          <td>
            <strong>${p.cliente_nombre}</strong><br>
            <small style="color:var(--tinta-suave)">${p.cliente_cedula}</small>
            ${p.usuario_id ? `<br><button class="card__copy" data-cliente="${p.usuario_id}" type="button" title="Ver contacto e historial">👤 Ver cliente</button>` : ""}
          </td>
          <td style="font-size:.85rem">${platos || "—"}</td>
          <td class="num"><strong>${MONEDA} ${formatear(p.total)}</strong></td>
          <td><span class="tag ${st.clase}">${st.texto}</span></td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap">${acciones.join("")}</div></td>
        </tr>`;
    }).join("");
  }

  function renderClientes() {
    const tbody = $("#tbodyClientes");
    if (!tbody) return;
    const lista = DATA.clientes || [];
    const empty = $("#emptyClientes");
    if (empty) empty.hidden = lista.length > 0;
    tbody.innerHTML = lista.map((c) => `
        <tr>
          <td><strong>${c.nombre}</strong></td>
          <td>${c.usuario}</td>
          <td>${c.cedula || "—"}</td>
          <td class="num">${c.pedidos}</td>
          <td class="num"><strong>${MONEDA} ${formatear(c.gasto_acumulado)}</strong></td>
          <td><button class="btn btn--cta-s" data-cliente="${c.id}" type="button">👤 Ver detalle</button></td>
        </tr>`).join("");
  }

  async function cargarClienteDetalle(uid) {
    try {
      const res = await fetch(`/api/admin/clientes/${Number(uid)}`);
      if (res.status === 401) { toggleUI(false); abrirAcceso(); return; }
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const c = data.cliente;
      const pedidos = (data.pedidos || []).map((p) => {
        const st = ESTADOS_ADMIN[p.estado] || ESTADOS_ADMIN.nuevo;
        const platos = (p.platos || []).map((d) => `${d.cantidad ?? 1}× ${d.plato}`).join(" · ");
        return `
          <tr>
            <td><strong>#${p.numero_orden}</strong></td>
            <td style="font-size:.85rem">${platos || "—"}</td>
            <td class="num">${MONEDA} ${formatear(p.total)}</td>
            <td><span class="tag ${st.clase}">${st.texto}</span></td>
            <td><small style="color:var(--tinta-suave)">${new Date(p.creado).toLocaleString("es-PE")}</small></td>
          </tr>`;
      }).join("");
      $("#clienteDetalleContenido").innerHTML = `
        <div class="card" style="padding:16px;margin-bottom:12px">
          <div class="card__meta" style="flex-wrap:wrap">
            <span>👤 ${c.nombre}</span>
            <span>🔑 ${c.usuario}</span>
            <span>🪪 ${c.cedula || "—"}</span>
            <span>💳 ${MONEDA} ${formatear(c.gasto_acumulado)} acumulados</span>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Orden</th><th>Platos</th><th class="num">Total</th><th>Estado</th><th>Fecha</th></tr>
            </thead>
            <tbody>${pedidos || `<tr><td colspan="5"><p class="empty" style="padding:16px">El cliente aún no ha hecho pedidos.</p></td></tr>`}</tbody>
          </table>
        </div>`;
      $("#clienteDetalle").hidden = false;
      $("#clienteDetalle").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (err) {
      console.error(err);
      alert("No se pudo cargar el detalle del cliente.");
    }
  }

  async function cargarPedidos() {
    try {
      const res = await fetch("/api/admin/pedidos");
      if (res.status === 401) { toggleUI(false); detenerRefresco(); abrirAcceso(); return; }
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      PEDIDOS = data.pedidos || [];
      const nuevos = PEDIDOS.filter((p) => !p.visto).length;
      const badge = $("#navPedidosNuevos");
      if (badge) {
        badge.hidden = nuevos === 0;
        badge.textContent = nuevos;
      }
      renderPedidos();
    } catch (err) {
      console.warn("No se pudieron cargar los pedidos", err);
    }
  }

  async function marcarPedidoVisto(id) {
    try {
      await fetch("/api/admin/pedidos/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id) }),
      });
      cargarPedidos();
    } catch (err) { console.error(err); }
  }

  async function cambiarEstadoPedido(id, estado) {
    try {
      const res = await fetch("/api/admin/pedidos/estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id), estado }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      cargarPedidos();
    } catch (err) {
      console.error(err);
      alert("No se pudo actualizar el estado del pedido.");
    }
  }

  /* ============================================================
     MÓDULO 3 · MENÚ Y MARKETING
     ============================================================ */
  function renderRecetas() {
    const tbody = $("#tbodyRecetas");
    const unidades = {};
    (DATA.inventario || []).forEach((i) => { unidades[norm(i.nombre)] = i.unidad; });
    const q = recFiltro.trim().toLowerCase();
    const lista = q
      ? (DATA.promociones || []).filter((p) => {
          const ingreds = Object.keys(p.ingredientes || {}).join(" ");
          return (p.plato || "").toLowerCase().includes(q) || (p.categoria || "").toLowerCase().includes(q) || ingreds.toLowerCase().includes(q);
        })
      : DATA.promociones;
    if (!tbody) return;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="5"><p class="empty" style="padding:16px">Ninguna receta coincide con “${recFiltro}”.</p></td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map((p) => {
      const ingredientes = Object.entries(p.ingredientes || {})
        .map(([n, c]) => `${tituloBonito(n)}: ${c} ${unidades[n] || ""}`)
        .join(" · ");
      return `
        <tr>
          <td><strong>${p.plato}</strong></td>
          <td><span class="tag tag--crit">-${p.descuento}%</span></td>
          <td style="font-size:.85rem">${ingredientes || "—"}</td>
          <td>
            <span class="tag ${p.oculta ? "tag--crit" : "tag--ok"}">${p.oculta ? "Oculto" : "Visible"}</span>
            <button class="btn btn--cta-s" data-ptoggle="${p.plato}" data-oculto="${p.oculta ? "1" : "0"}" type="button">${p.oculta ? "Mostrar" : "Ocultar"}</button>
          </td>
          <td><div class="card__tools" style="padding:0">
            <button class="card__copy" data-aflyer="${p.plato}" data-app="whatsapp" type="button" title="Flyer + WhatsApp">🟢 WhatsApp</button>
            <button class="card__copy" data-aflyer="${p.plato}" data-app="facebook" type="button" title="Flyer + Facebook">📘 Facebook</button>
            <button class="card__copy" data-aflyer="${p.plato}" data-app="instagram" type="button" title="Flyer + Instagram">📸 Instagram</button>
            <button class="card__copy" data-aflyer="${p.plato}" data-app="telegram" type="button" title="Flyer + Telegram">✈️ Telegram</button>
            <button class="card__copy" data-flyer-view="${p.plato}" type="button" title="Ver flyer">🖼️ Flyer</button>
          </div></td>
        </tr>`;
    }).join("");
  }

  function renderEspecial() {
    const grid = $("#gridEspecial");
    const especiales = Object.values(DATA.contenido.especial || {});
    if (!especiales.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">Aún no hay receta del día preparada.</p></div></article>`;
      return;
    }
    grid.innerHTML = especiales.map((e, i) => `
      <article class="card reveal" style="animation-delay:${i * 60}ms">
        <div class="card__img">${fotoEspecial(e)}</div>
        <div class="card__body">
          <span class="badge badge--dia">⚡ ${(e.inspirado_en || []).slice(0, 3).join(", ")}</span>
          <h3 class="card__title">${tituloBonito(e.plato)}</h3>
          <p class="card__text">${(e.receta || "").slice(0, 90)}…</p>
          <div class="card__foot">
            <button class="btn btn--primary btn--cta-s" data-receta="${i}" type="button">📖 Ver receta</button>
          </div>
        </div>
      </article>`).join("");
  }

  function renderCombo() {
    const combo = DATA.combo_del_dia;
    const card = $("#cardCombo");
    const empty = $("#emptyCombo");
    if (!combo) {
      if (card) card.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    if (!card) return;
    card.innerHTML = `
      <article class="card combo-card reveal" style="margin-top:12px">
        <div class="card__body">
          <span class="badge badge--dia">🌿 Combo del día · Zero-Waste</span>
          <h3 class="card__title">${tituloBonito(combo.nombre)}</h3>
          <p class="card__text">Inspirado en: <strong>${combo.inspirado_en.join(", ")}</strong>.</p>
          <p class="card__text">${combo.sugerencia}</p>
          <div class="card__meta">
            <span>💵 Recupera ${MONEDA} ${formatear(combo.valor_recuperado)}</span>
            <span>🥘 ${combo.insumos.length} insumos por vencer</span>
          </div>
        </div>
      </article>`;
  }

  function renderRecetasFaciles() {
    const tbody = $("#tbodyRecetasFaciles");
    const empty = $("#emptyRecetasFaciles");
    const lista = DATA.recetas || [];
    if (empty) empty.hidden = lista.length > 0;
    if (!tbody) return;
    tbody.innerHTML = lista.map((r) => `
      <tr>
        <td><strong>${r.titulo}</strong></td>
        <td class="num">${r.tiempo_min || 0} min</td>
        <td class="num">${r.porciones || 1}</td>
        <td>
          <button class="btn btn--cta-s" data-recpub="${r.id}" data-pub="${r.publicada_hoy ? "0" : "1"}" type="button"
                  title="Mostrar u ocultar en la web del cliente">
            <span class="tag ${r.publicada_hoy ? "tag--ok" : "tag--warn"}">${r.publicada_hoy ? "✔ Publicada" : "Oculta"}</span>
            ${r.publicada_hoy ? "Quitar de la web" : "Publicar en la Web del Cliente Hoy"}
          </button>
        </td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn--cta-s" data-recedit="${r.id}" type="button">✏️ Editar</button>
          <button class="btn btn--cta-s" data-reccopy="${r.id}" type="button" title="Crear una copia para publicar">📋 Copiar</button>
          <button class="btn btn--cta-s" data-recdel="${r.id}" type="button">🗑️</button>
        </div></td>
      </tr>`).join("");
  }

  function formReceta(r) {
    const r2 = r || {};
    return `
      <form id="formReceta">
        <span class="badge badge--dia">👨‍🍳 Receta fácil</span>
        <h3 style="margin-top:12px">${r2.id ? "Editar receta" : "Nueva receta"}</h3>
        <input type="hidden" name="id" value="${r2.id || ""}">
        <label style="display:grid;gap:4px;margin-bottom:10px">Título
          <input class="input" name="titulo" required value="${(r2.titulo || "").replace(/"/g, "&quot;")}" placeholder="Ej: Ceviche de Camarones Express">
        </label>
        <label style="display:grid;gap:4px;margin-bottom:10px">URL de la foto
          <input class="input" name="imagen" value="${(r2.imagen || "").replace(/"/g, "&quot;")}" placeholder="https://commons.wikimedia.org/…">
        </label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <label style="display:grid;gap:4px">Tiempo (min)
            <input class="input" name="tiempo_min" type="number" min="0" value="${r2.tiempo_min || 15}">
          </label>
          <label style="display:grid;gap:4px">Porciones
            <input class="input" name="porciones" type="number" min="1" value="${r2.porciones || 2}">
          </label>
        </div>
        <label style="display:grid;gap:4px;margin-bottom:10px">Ingredientes (uno por línea)
          <textarea class="input" name="ingredientes" rows="3">${(r2.ingredientes || []).join("\n")}</textarea>
        </label>
        <label style="display:grid;gap:4px;margin-bottom:10px">Pasos (uno por línea)
          <textarea class="input" name="pasos" rows="5">${(r2.pasos || []).join("\n")}</textarea>
        </label>
        <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px;cursor:pointer">
          <input type="checkbox" name="publicada_hoy" ${r2.publicada_hoy ? "checked" : ""}> Publicar en la Web del Cliente Hoy
        </label>
        <button class="btn btn--primary" type="submit">💾 Guardar receta</button>
      </form>`;
  }

  async function guardarReceta(ev) {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const linea = (v) => (v || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const receta = {
      id: (f.get("id") || "").trim(),
      titulo: (f.get("titulo") || "").trim(),
      imagen: (f.get("imagen") || "").trim(),
      tiempo_min: Number(f.get("tiempo_min") || 0),
      porciones: Number(f.get("porciones") || 1),
      ingredientes: linea(f.get("ingredientes")),
      pasos: linea(f.get("pasos")),
      publicada_hoy: f.get("publicada_hoy") === "on",
    };
    if (!receta.titulo) return alert("Indica el título de la receta.");
    if (!Number.isFinite(receta.tiempo_min) || receta.tiempo_min < 0 || receta.tiempo_min > 600)
      return alert("El tiempo debe ser un número entre 0 y 600 minutos.");
    if (!Number.isFinite(receta.porciones) || receta.porciones < 1 || receta.porciones > 50)
      return alert("Las porciones deben ser un número entre 1 y 50.");
    if (receta.imagen && !/^https?:\/\//.test(receta.imagen))
      return alert("La URL de la foto debe empezar por http:// o https://.");
    try {
      await apiPost("/api/admin/recetas", { receta });
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo guardar la receta.");
      return;
    }
    cerrarModal();
    try {
      await cargarDatosAdmin("menu-recetas-faciles");
    } catch (e2) {
      console.error(e2);
      mostrarVistaAdmin("menu-recetas-faciles");
    }
    alert("Receta guardada correctamente. Ya puedes publicarla cuando lo decidas.");
  }

  async function publicarReceta(rid, publicar) {
    try {
      await apiPost(`/api/admin/recetas/${rid}/publicar`, { publicar: !!publicar });
      await cargarDatosAdmin("menu-recetas-faciles");
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo actualizar la publicación.");
    }
  }

  async function eliminarReceta(rid) {
    if (!confirm("¿Eliminar esta receta de la sección Aprende y Cocina?")) return;
    try {
      await apiPost(`/api/admin/recetas/${rid}/eliminar`, {});
      await cargarDatosAdmin("menu-recetas-faciles");
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo eliminar la receta.");
    }
  }

  function copiarReceta(rid) {
    const src = (DATA.recetas || []).find((x) => String(x.id) === String(rid));
    if (!src) { alert("Receta no encontrada."); return; }
    const copia = Object.assign({}, src, { id: "" });
    abrirModalContenido(formReceta(copia));
  }

  const IMAGENES_AVISO = {
    lechuga: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Iceberg_lettuce_in_SB.jpg?width=800", emoji: "🥬" },
    cilantro: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Bunches_of_coriander_leaves.jpg?width=800", emoji: "🌿" },
    "crema de leche": { url: "https://commons.wikimedia.org/wiki/Special:FilePath/01_Mmm..._Apple_Crisp_with_Whipped_Cream.jpg?width=800", emoji: "🥛" },
    "pescado fresco": { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Fish_stuffed_with_Thai_herbs.jpg?width=800", emoji: "🐟" },
    "pan ciabatta": { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Ciabatta_cut.JPG?width=800", emoji: "🍞" },
    tomate: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Tomato_je.jpg?width=800", emoji: "🍅" },
    choclo: { url: "https://commons.wikimedia.org/wiki/Special:FilePath/3_Chicken_Wings%2C_PERi-Salted_Chips%2C_Corn_on_the_Cob_-_Nando%27s.jpg?width=800", emoji: "🌽" },
    "pimiento rojo": { url: "https://commons.wikimedia.org/wiki/Special:FilePath/Green-Yellow-Red-Pepper-2009.jpg?width=800", emoji: "🌶️" },
  };

  function fotoAviso(b) {
    const info = IMAGENES_AVISO[norm(b.titulo)] || { url: "", emoji: "🧺" };
    if (info.url) {
      return `
        <img class="card__foto" src="${imgProxy(info.url)}" alt="${b.titulo}" loading="lazy"
             onerror="this.remove(); this.nextElementSibling.hidden = false;">
        <span class="card__emoji-fb card__emoji-fb--warm4" hidden>${info.emoji}</span>`;
    }
    return `<span class="card__emoji-fb card__emoji-fb--warm4">${info.emoji}</span>`;
  }

  function renderMarketing() {
    const cont = $("#marketingEnlaces");
    if (!cont) return;
    const web = location.origin + "/cliente";
    const texto = "🍽️ ¡Hoy te invito a G&CRestaurant! Menú internacional, promos y especiales del día. Pide aquí: " + web + " #GCRestaurant #PromoDeHoy";
    cont.innerHTML = `
      <button class="card__copy" data-mshare data-app="whatsapp" data-text="${encodeURIComponent(texto)}" type="button">🟢 WhatsApp Business</button>
      <button class="card__copy" data-mshare data-app="facebook" data-text="${encodeURIComponent(texto)}" type="button">📘 Facebook</button>
      <button class="card__copy" data-mshare data-app="instagram" data-text="${encodeURIComponent(texto)}" type="button">📸 Instagram</button>
      <button class="card__copy" data-mcopy type="button">🔗 Copiar enlace</button>`;
  }

  function renderDestacadas() {
    const grid = $("#gridDestacadas");
    const lista = (DATA.destacadas || []).slice(0, 6);
    if (!lista.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">Sin recomendaciones por ahora.</p></div></article>`;
      return;
    }
    grid.innerHTML = lista.map((d, i) => `
      <article class="card reveal" style="animation-delay:${i * 40}ms">
        <div class="card__body">
          <span class="badge badge--descuento">-${d.descuento}%</span>
          <h3 class="card__title">${d.plato}</h3>
          <p class="card__text">${d.descripcion}</p>
          <div class="card__meta">
            <span>${d.razon}</span>
            ${d.ventas_semana ? `<span>🏆 ${d.ventas_semana} pedido(s) esta semana</span>` : ""}
          </div>
          ${d.rescata && d.rescata.length ? `<p class="card__text" style="font-size:.82rem">🌿 Rescata: ${d.rescata.join(", ")}</p>` : ""}
          <div class="card__foot">
            <button class="btn btn--cta-s" data-gbanner="${d.plato}" type="button">🎨 Generar banner</button>
          </div>
        </div>
      </article>`).join("");
  }

  function renderBanners() {
    const grid = $("#gridBanners");
    const banners = DATA.banners.filter((b) => b.tipo === "banner");
    if (!banners.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">Sin anuncios promocionales generados.</p></div></article>`;
      return;
    }
    const promoDeBanner = (b) => {
      let p = DATA.promociones.find((x) => norm(x.plato) === norm(b.titulo));
      if (p) return p;
      const cat = (b.nota || "").split("·").pop().trim();
      p = cat
        ? DATA.promociones.find((x) => x.categoria.toLowerCase() === cat.toLowerCase())
        : null;
      return p || DATA.promociones.find((x) => x.imagen) || null;
    };
    grid.innerHTML = banners.map((b, i) => {
      const promo = promoDeBanner(b);
      const foto = promo && promo.imagen ? `<div class="card__img">${fotoEspecial(promo)}</div>` : "";
      const tools = promo ? `
          <div class="card__tools">
            <button class="card__copy" data-aflyer="${promo.plato}" data-app="whatsapp" type="button" title="Flyer + WhatsApp">🟢 WhatsApp</button>
            <button class="card__copy" data-aflyer="${promo.plato}" data-app="facebook" type="button" title="Flyer + Facebook">📘 Facebook</button>
            <button class="card__copy" data-aflyer="${promo.plato}" data-app="instagram" type="button" title="Flyer + Instagram">📸 Instagram</button>
            <button class="card__copy" data-aflyer="${promo.plato}" data-app="telegram" type="button" title="Flyer + Telegram">✈️ Telegram</button>
            <button class="card__copy" data-flyer-view="${promo.plato}" type="button" title="Ver flyer">🖼️ Flyer</button>
          </div>` : "";
      return `
      <article class="card reveal" style="animation-delay:${i * 40}ms">
        <button class="card__x" data-x-banner="${b.id}" type="button" title="Retirar anuncio" aria-label="Retirar anuncio">✕</button>
        ${foto}
        <div class="card__body">
          <span class="badge badge--descuento">🎨 Anuncio</span>
          <h3 class="card__title">${b.titulo}</h3>
          <p class="card__text">${b.nota || ""}</p>
          <div class="card__foot">
            <span class="tag ${b.oculto ? "tag--crit" : "tag--ok"}">${b.oculto ? "Oculto" : "Visible"}</span>
            <button class="btn btn--cta-s" data-btoggle="${b.id}" data-oculto="${b.oculto ? "1" : "0"}" type="button">${b.oculto ? "Mostrar" : "Ocultar"}</button>
          </div>
        </div>
        ${tools}
      </article>`;
    }).join("");
  }

  /* ============================================================
     MÓDULO 4 · INVENTARIO Y STOCK
     ============================================================ */
  function renderInventario() {
    const tbody = $("#tbodyInventario");
    const q = invFiltro.trim().toLowerCase();
    const lista = q
      ? (DATA.inventario || []).filter((i) =>
          (i.nombre || "").toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q))
      : DATA.inventario;
    if (!tbody) return;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="9"><p class="empty" style="padding:16px">Ningún insumo coincide con “${invFiltro}”.</p></td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map((i) => {
      const dias = i.dias_para_caducar;
      const tag = dias < 0 ? '<span class="tag tag--crit">Vencido</span>'
        : dias <= DATA.ventana_alertas ? `<span class="tag tag--crit">${dias === 0 ? "Hoy" : dias + "d"}</span>`
        : dias <= 10 ? '<span class="tag tag--warn">Pronto</span>'
        : '<span class="tag tag--ok">Fresco</span>';
      return `
        <tr>
          <td><strong>${i.vencido ? "☠️ " : ""}${i.nombre}</strong></td>
          <td>${i.categoria}</td>
          <td class="num">${i.stock} ${i.unidad}</td>
          <td class="num">${MONEDA} ${formatear(i.costo_unitario)}</td>
          <td class="num">${MONEDA} ${formatear(i.valor_linea)}</td>
          <td>${i.fecha_caducidad}</td>
          <td>${tag}</td>
          <td>${i.proveedor || "—"}</td>
          <td><button class="btn btn--cta-s" data-insumo-edit="${i.nombre}" type="button">✏️ Editar</button></td>
        </tr>`;
    }).join("");
  }

  function renderMovimientos() {
    const tbody = $("#tbodyMovimientos");
    const lista = DATA.movimientos || [];
    if (!tbody) return;
    tbody.innerHTML = lista.slice(0, 15).map((m) => `
      <tr>
        <td><small style="color:var(--tinta-suave)">${m.fecha ? new Date(m.fecha).toLocaleString("es-PE") : "—"}</small></td>
        <td><strong>${m.insumo}</strong></td>
        <td>${m.tipo === "entrada"
            ? '<span class="tag tag--ok">⤵ Entrada</span>'
            : '<span class="tag tag--warn">⤴ Salida</span>'}</td>
        <td class="num">${m.cantidad}</td>
        <td class="num">${m.stock_resultante}</td>
        <td style="font-size:.85rem">${m.motivo || "—"}</td>
      </tr>`).join("") || `<tr><td colspan="6"><p class="empty" style="padding:16px">Sin movimientos registrados todavía.</p></td></tr>`;
  }

  function rellenarSelectInsumos() {
    const sel = $("#ajusteInsumo");
    if (!sel) return;
    const actual = sel.value;
    sel.innerHTML = (DATA.inventario || [])
      .map((i) => `<option value="${i.nombre.replace(/"/g, "&quot;")}">${i.nombre} (${i.stock} ${i.unidad})</option>`)
      .join("");
    if (actual && [...sel.options].some((o) => o.value === actual)) sel.value = actual;
  }

  async function ajustarStock(ev) {
    ev.preventDefault();
    const insumo = $("#ajusteInsumo").value;
    const tipo = $("#ajusteTipo").value;
    const cantidad = Number($("#ajusteCantidad").value);
    const motivo = $("#ajusteMotivo").value.trim();
    if (!insumo) { alert("Selecciona un insumo."); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { alert("Indica una cantidad válida (número mayor a 0)."); return; }
    if (!motivo) { alert("Indica el motivo del movimiento."); return; }
    try {
      await apiPost("/api/admin/inventario/ajustar", { insumo, tipo, cantidad, motivo });
      await cargarDatosAdmin();
      mostrarVistaAdmin("inv-movimientos");
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo registrar el movimiento.");
    }
  }

  function formInsumo(i) {
    return `
      <form id="formInsumo">
        <span class="badge badge--categoria">📦 Ficha técnica</span>
        <h3 style="margin-top:12px">${i.nombre}</h3>
        <input type="hidden" name="nombre" value="${i.nombre}">
        <label style="display:grid;gap:4px;margin-bottom:10px">Costo unitario (S/)
          <input class="input" name="costo_unitario" type="number" min="0" step="any" value="${i.costo_unitario}">
        </label>
        <label style="display:grid;gap:4px;margin-bottom:10px">Fecha de caducidad
          <input class="input" name="fecha_caducidad" type="date" value="${i.fecha_caducidad || ""}">
        </label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <label style="display:grid;gap:4px">Unidad
            <input class="input" name="unidad" maxlength="40" value="${(i.unidad || "").replace(/"/g, "&quot;")}">
          </label>
          <label style="display:grid;gap:4px">Categoría
            <input class="input" name="categoria" maxlength="40" value="${(i.categoria || "").replace(/"/g, "&quot;")}">
          </label>
        </div>
        <label style="display:grid;gap:4px;margin-bottom:14px">Proveedor
          <select class="input" name="proveedor">
            <option value="">— Sin asignar —</option>
            ${(DATA.proveedores || []).map((p) =>
              `<option value="${p.nombre.replace(/"/g, "&quot;")}" ${norm(p.nombre) === norm(i.proveedor) ? "selected" : ""}>${p.nombre}</option>`).join("")}
          </select>
        </label>
        <button class="btn btn--primary" type="submit">💾 Guardar cambios</button>
      </form>`;
  }

  async function guardarInsumo(ev) {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const cuerpo = {
      nombre: f.get("nombre"),
      costo_unitario: Number(f.get("costo_unitario")),
      fecha_caducidad: f.get("fecha_caducidad"),
      unidad: (f.get("unidad") || "").trim(),
      categoria: (f.get("categoria") || "").trim(),
      proveedor: f.get("proveedor"),
    };
    if (!Number.isFinite(cuerpo.costo_unitario) || cuerpo.costo_unitario < 0)
      return alert("El costo debe ser un número positivo.");
    if (cuerpo.fecha_caducidad && !/^\d{4}-\d{2}-\d{2}$/.test(cuerpo.fecha_caducidad))
      return alert("La fecha de caducidad no es válida.");
    if (!validarNombre(cuerpo.unidad, true, 40))
      return alert("La unidad solo puede contener letras, espacios, puntos y guiones.");
    if (!validarNombre(cuerpo.categoria, true, 40))
      return alert("La categoría solo puede contener letras, espacios, puntos y guiones.");
    try {
      await apiPost("/api/admin/inventario/insumo", cuerpo);
      cerrarModal();
      await cargarDatosAdmin();
      mostrarVistaAdmin("inv-insumos");
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo actualizar el insumo.");
    }
  }

  function renderProveedores() {
    const tbody = $("#tbodyProveedores");
    const empty = $("#emptyProveedores");
    const lista = DATA.proveedores || [];
    if (empty) empty.hidden = lista.length > 0;
    if (!tbody) return;
    tbody.innerHTML = lista.map((p) => `
      <tr>
        <td><strong>${p.nombre}</strong></td>
        <td>${p.contacto || "—"}</td>
        <td>${p.telefono || "—"}</td>
        <td>${p.email || "—"}</td>
        <td>${p.rubro || "—"}</td>
        <td><button class="btn btn--cta-s" data-provedit="${p.id}" type="button">✏️ Editar</button></td>
      </tr>`).join("");
  }

  function formProveedor(p) {
    const p2 = p || {};
    return `
      <form id="formProveedor">
        <span class="badge badge--categoria">🤝 Proveedor</span>
        <h3 style="margin-top:12px">${p2.id ? "Editar proveedor" : "Nuevo proveedor"}</h3>
        <input type="hidden" name="id" value="${p2.id || ""}">
        <label style="display:grid;gap:4px;margin-bottom:10px">Nombre (obligatorio)
          <input class="input" name="nombre" required maxlength="80" value="${(p2.nombre || "").replace(/"/g, "&quot;")}" placeholder="Ej: Mercado Central">
        </label>
        <label style="display:grid;gap:4px;margin-bottom:10px">Contacto
          <input class="input" name="contacto" maxlength="80" value="${(p2.contacto || "").replace(/"/g, "&quot;")}" placeholder="Nombre de la persona">
        </label>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <label style="display:grid;gap:4px">Teléfono (solo números)
            <input class="input" name="telefono" inputmode="numeric" pattern="[0-9\s\-().]{6,15}" maxlength="15" value="${(p2.telefono || "").replace(/"/g, "&quot;")}" placeholder="Ej: 987654321">
          </label>
          <label style="display:grid;gap:4px">Rubro
            <input class="input" name="rubro" maxlength="60" value="${(p2.rubro || "").replace(/"/g, "&quot;")}" placeholder="Ej: Verduras y hortalizas">
          </label>
        </div>
        <label style="display:grid;gap:4px;margin-bottom:14px">Email
          <input class="input" name="email" type="email" maxlength="120" value="${(p2.email || "").replace(/"/g, "&quot;")}">
        </label>
        <button class="btn btn--primary" type="submit">💾 Guardar proveedor</button>
      </form>`;
  }

  async function guardarProveedor(ev) {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const proveedor = {
      id: (f.get("id") || "").trim(),
      nombre: (f.get("nombre") || "").trim(),
      contacto: (f.get("contacto") || "").trim(),
      telefono: (f.get("telefono") || "").trim(),
      email: (f.get("email") || "").trim(),
      rubro: (f.get("rubro") || "").trim(),
    };
    if (!proveedor.nombre) return alert("Indica el nombre del proveedor.");
    if (!validarNombre(proveedor.nombre, false))
      return alert("El nombre del proveedor solo puede contener letras, espacios, puntos y guiones.");
    if (!validarNombre(proveedor.contacto, true))
      return alert("El contacto solo puede contener letras, espacios, puntos y guiones.");
    if (!validarTelefono(proveedor.telefono, true))
      return alert("El teléfono solo puede contener números (6-15 dígitos, sin letras ni símbolos).");
    if (!validarEmail(proveedor.email, true))
      return alert("El correo electrónico no es válido.");
    if (!validarNombre(proveedor.rubro, true, 60))
      return alert("El rubro solo puede contener letras, espacios, puntos y guiones.");
    try {
      await apiPost("/api/admin/inventario/proveedor", { proveedor });
      cerrarModal();
      await cargarDatosAdmin();
      mostrarVistaAdmin("inv-proveedores");
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo guardar el proveedor.");
    }
  }

  /* ============================================================
     COORDINACIÓN
     ============================================================ */
  function renderPaneles() {
    const paneles = [
      ["KPIs", renderKpis],
      ["Alertas", renderAlertas],
      ["Especial", renderEspecial],
      ["Combo", renderCombo],
      ["Recetas", renderRecetas],
      ["RecetasFáciles", renderRecetasFaciles],
      ["Marketing", renderMarketing],
      ["Inventario", renderInventario],
      ["Movimientos", renderMovimientos],
      ["Proveedores", renderProveedores],
      ["Banners", renderBanners],
      ["Destacadas", renderDestacadas],
      ["Clientes", renderClientes],
    ];
    paneles.forEach(([nombre, fn]) => {
      try {
        fn();
      } catch (e) {
        console.error(`Render "${nombre}" falló:`, e);
      }
    });
    rellenarSelectInsumos();
  }

  async function cargarDatosSoft() {
    try {
      const res = await fetch("/api/admin/datos");
      if (res.status === 401) { toggleUI(false); detenerRefresco(); abrirAcceso(); return; }
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
      renderPaneles();
    } catch (err) {
      console.warn("El refresco del panel falló", err);
    }
  }

  function iniciarRefresco() {
    if (refrescoTimer) return;
    refrescoTimer = setInterval(async () => {
      const vistaActiva = document.querySelector("#dashboard .admin-vista.activa");
      const vista = vistaActiva && vistaActiva.dataset.vista;
      const modulo = VISTA_MODULO[vista];
      if (modulo === "inventario" || modulo === "resumen" || modulo === "pedidos") await cargarDatosSoft();
      cargarPedidos();
    }, 5000);
  }

  function detenerRefresco() {
    clearInterval(refrescoTimer);
    refrescoTimer = null;
  }

  async function verificarSesion() {
    try {
      const res = await fetch("/api/sesion");
      const data = await res.json();
      if (data.admin) await cargarDatosAdmin();
      else {
        toggleUI(false);
        abrirAcceso();
      }
    } catch (err) {
      console.error(err);
      toggleUI(false);
      abrirAcceso();
    }
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  async function convertirEnEspecial(plato) {
    try {
      await apiPost("/api/admin/especial", { plato });
      await cargarDatosAdmin();
      mostrarVistaAdmin("menu-especial");
      alert(`«${plato}» ahora es el Especial del Día. ⚡ Revisa el módulo Menú y Marketing.`);
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo convertir el plato en Especial.");
    }
  }

  function compartirMarketing(ev) {
    const btn = ev.target.closest("[data-mshare]");
    if (!btn) return;
    const texto = decodeURIComponent(btn.dataset.text || "");
    const web = location.origin + "/cliente";
    if (btn.dataset.app === "whatsapp") {
      window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
    } else if (btn.dataset.app === "facebook") {
      window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(web) + "&quote=" + encodeURIComponent(texto), "_blank", "noopener");
    } else if (btn.dataset.app === "instagram") {
      try { navigator.clipboard.writeText(texto); } catch (e) { /* sin portapapeles */ }
      window.open("https://www.instagram.com/", "_blank", "noopener");
    }
  }

  async function copiarEnlace() {
    const texto = `${location.origin}/cliente — Pedir en G&CRestaurant`;
    try {
      await navigator.clipboard.writeText(texto);
      alert("Enlace copiado al portapapeles. 🔗");
    } catch (e) {
      alert("Copia este enlace: " + location.origin + "/cliente");
    }
  }

  function enlazar() {
    $("#btnIngresar").addEventListener("click", abrirAcceso);

    $("#btnLogout").addEventListener("click", () => {
      if (window.GCAuth) window.GCAuth.cerrarSesion();
    });

    const invBuscar = $("#invBuscar");
    if (invBuscar) {
      invBuscar.addEventListener("input", (ev) => { invFiltro = ev.target.value; renderInventario(); });
    }
    const recBuscar = $("#recBuscar");
    if (recBuscar) {
      recBuscar.addEventListener("input", (ev) => { recFiltro = ev.target.value; renderRecetas(); });
    }
    const btnNuevaReceta = $("#btnNuevaReceta");
    if (btnNuevaReceta) btnNuevaReceta.addEventListener("click", () => abrirModalContenido(formReceta(null)));
    const btnNuevoProveedor = $("#btnNuevoProveedor");
    if (btnNuevoProveedor) btnNuevoProveedor.addEventListener("click", () => abrirModalContenido(formProveedor(null)));

    const btnSemana = $("#btnGenerarSemana");
    if (btnSemana) btnSemana.addEventListener("click", generarBannersSemana);

    document.querySelectorAll(".admin-nav__btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const m = btn.dataset.modulo;
        if (MODULOS[m] && MODULOS[m].length) mostrarVistaAdmin(MODULOS[m][0].vista);
      })
    );

    $("#btnCerrarModal").addEventListener("click", cerrarModal);
    $("#overlay").addEventListener("click", cerrarModal);

    document.addEventListener("submit", (ev) => {
      if (ev.target.id === "formReceta") guardarReceta(ev);
      else if (ev.target.id === "formAjuste") ajustarStock(ev);
      else if (ev.target.id === "formInsumo") guardarInsumo(ev);
      else if (ev.target.id === "formProveedor") guardarProveedor(ev);
    });

    document.addEventListener("click", (ev) => {
      const sub = ev.target.closest(".admin-subnav__btn");
      if (sub) { mostrarVistaAdmin(sub.dataset.vista); return; }

      const pVisto = ev.target.closest("[data-pvisto]");
      if (pVisto) { marcarPedidoVisto(pVisto.dataset.pvisto); return; }
      const pEstado = ev.target.closest("[data-pestado]");
      if (pEstado) { cambiarEstadoPedido(pEstado.dataset.pestado, pEstado.dataset.estado); return; }
      const cliente = ev.target.closest("[data-cliente]");
      if (cliente) { cargarClienteDetalle(cliente.dataset.cliente); return; }

      const especial = ev.target.closest("[data-especial]");
      if (especial) { convertirEnEspecial(especial.dataset.especial); return; }

      const gBanner = ev.target.closest("[data-gbanner]");
      if (gBanner) { generarBanner(gBanner.dataset.gbanner); return; }

      const recetaBtn = ev.target.closest("[data-receta]");
      if (recetaBtn) {
        const especiales = Object.values(DATA.contenido.especial || {});
        const e = especiales[Number(recetaBtn.dataset.receta)];
        if (!e) return;
        abrirModalContenido(`
          <span class="badge badge--dia">⚡ Zero-Waste</span>
          <h3 style="margin-top:14px">${tituloBonito(e.plato)}</h3>
          <p><strong>Inspirado en:</strong> ${(e.inspirado_en || []).join(", ")}</p>
          <div class="receta">${e.receta || "Receta aún no redactada."}</div>
          ${e.hashtags ? `<p class="kicker" style="margin-top:14px">${e.hashtags}</p>` : ""}
        `);
        return;
      }

      const recEdit = ev.target.closest("[data-recedit]");
      if (recEdit) {
        const r = (DATA.recetas || []).find((x) => x.id === recEdit.dataset.recedit);
        if (r) abrirModalContenido(formReceta(r));
        return;
      }
      const recPub = ev.target.closest("[data-recpub]");
      if (recPub) { publicarReceta(recPub.dataset.recpub, recPub.dataset.pub === "1"); return; }
      const recDel = ev.target.closest("[data-recdel]");
      if (recDel) { eliminarReceta(recDel.dataset.recdel); return; }
      const recCopy = ev.target.closest("[data-reccopy]");
      if (recCopy) { copiarReceta(recCopy.dataset.reccopy); return; }

      const insumoEdit = ev.target.closest("[data-insumo-edit]");
      if (insumoEdit) {
        const i = (DATA.inventario || []).find((x) => norm(x.nombre) === norm(insumoEdit.dataset.insumoEdit));
        if (i) abrirModalContenido(formInsumo(i));
        return;
      }
      const provEdit = ev.target.closest("[data-provedit]");
      if (provEdit) {
        const p = (DATA.proveedores || []).find((x) => x.id === provEdit.dataset.provedit);
        if (p) abrirModalContenido(formProveedor(p));
        return;
      }

      const btnPromo = ev.target.closest("[data-ptoggle]");
      if (btnPromo) {
        cambiarVisibilidad("promo", btnPromo.dataset.ptoggle, btnPromo.dataset.oculto !== "1");
        return;
      }
      const btnBanner = ev.target.closest("[data-btoggle]");
      if (btnBanner) {
        cambiarVisibilidad("banner", btnBanner.dataset.btoggle, btnBanner.dataset.oculto !== "1");
        return;
      }
      const xBanner = ev.target.closest("[data-x-banner]");
      if (xBanner) {
        cambiarVisibilidad("banner", xBanner.dataset.xBanner, true);
        return;
      }
      const buscaPromo = (nombre) => DATA.promociones.find((x) => norm(x.plato) === norm(nombre));
      const aflyer = ev.target.closest("[data-aflyer]");
      if (aflyer) {
        const pr = buscaPromo(aflyer.dataset.aflyer);
        if (pr && window.Flyer) window.Flyer.compartirFlyer(pr, aflyer.dataset.app);
        return;
      }
      const fview = ev.target.closest("[data-flyer-view]");
      if (fview) {
        const pr = buscaPromo(fview.dataset.flyerView);
        if (pr && window.Flyer) window.Flyer.abrirFlyer(pr);
        return;
      }
      const appShare = ev.target.closest("[data-app-share]");
      if (appShare) {
        const vista = $("#flyerVista");
        const plato = vista && vista.dataset.plato;
        const pr = buscaPromo(plato);
        if (pr && window.Flyer) window.Flyer.compartirFlyer(pr, appShare.dataset.appShare);
        return;
      }
      if (ev.target.closest("[data-mcopy]")) { copiarEnlace(); return; }
      compartirMarketing(ev);
    });
  }

  async function generarBanner(plato) {
    try {
      const data = await apiPost("/api/admin/generar-banner", { plato });
      if (data.guardado) {
        await cargarDatosAdmin();
        mostrarVistaAdmin("menu-marketing");
        alert(`Banner generado para "${plato}" y publicado en la galería. 🎨`);
      } else {
        abrirModalContenido(`<span class="badge badge--hero">🎨 Vista previa del banner</span><h3 style="margin-top:14px">${plato}</h3>${data.html}`);
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo generar el banner.");
    }
  }

  async function generarBannersSemana() {
    const msg = $("#msgGenerarSemana");
    try {
      const data = await apiPost("/api/admin/generar-banners-semana", {});
      if (msg) {
        msg.hidden = false;
        msg.className = "auth__msg auth__msg--ok";
        msg.textContent = data.mensaje;
      }
      await cargarDatosAdmin();
    } catch (err) {
      console.error(err);
      if (msg) {
        msg.hidden = false;
        msg.className = "auth__msg auth__msg--err";
        msg.textContent = err.message || "No se pudieron generar los banners de la semana.";
      }
    }
  }

  async function cambiarVisibilidad(tipo, id, ocultar) {
    try {
      await apiPost("/api/admin/visibilidad", { tipo, id, ocultar });
      await cargarDatosAdmin();
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo actualizar la visibilidad del anuncio.");
    }
  }

  /* ---------- inicio ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    enlazar();
    verificarSesion();
  });
})();