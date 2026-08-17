/* ============================================================
   G&CRestaurant · Panel de administrador
   Inventario, recetas y avisos protegidos con sesión (login).
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

  let DATA = null;
  let refrescoTimer = null;
  let invFiltro = "";
  let recFiltro = "";

  const formatear = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tituloBonito = (s) =>
    (s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1));

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

  function toggleUI(esAdmin) {
    $("#loginBox").hidden = esAdmin;
    $("#dashboard").hidden = !esAdmin;
    $("#btnLogout").hidden = !esAdmin;
    $("#adminNav").hidden = !esAdmin;
  }

  function mostrarVistaAdmin(nombre) {
    document.querySelectorAll("#dashboard .admin-vista").forEach((v) =>
      v.classList.toggle("activa", v.dataset.vista === nombre)
    );
    document.querySelectorAll(".admin-nav__btn").forEach((b) =>
      b.classList.toggle("activo", b.dataset.vista === nombre)
    );
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

  /* ---------- render paneles ---------- */
  function renderKpis() {
    const r = DATA.resumen;
    $("#kPromos").textContent = r.total_promociones;
    $("#kInsumos").textContent = r.total_insumos;
    $("#kCriticos").textContent = r.insumos_criticos;
    $("#kValor").textContent = `${MONEDA} ${formatear(r.valor_inventario)}`;
    $("#ventanaAlertas").textContent = DATA.ventana_alertas;
  }

  function renderAlertas() {
    const grid = $("#gridAlertas");
    const criticos = (DATA.especiales || []).slice(0, 9);
    if (!criticos.length) {
      grid.innerHTML = `<article class="card card--alerta"><div class="card__body"><p class="empty">Sin avisos críticos hoy. 🎉</p></div></article>`;
      return;
    }
    grid.innerHTML = criticos.map((i, idx) => {
      const dias = i.dias_para_caducar;
      const texto = dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : dias === 0 ? "Caduca HOY" : `Expira en ${dias}d`;
      const tag = dias < 0 || dias <= 1 ? "tag--crit" : dias <= 3 ? "tag--warn" : "tag--ok";
      return `
        <article class="card card--alerta ${dias <= 0 ? "dia-0" : ""} reveal" style="animation-delay:${idx * 50}ms">
          <div class="card__body">
            <span class="card__urgencia">${dias <= 0 ? "🚨" : "⚠️"} ${dias <= 1 ? "Acción inmediata" : "Rescatable"}</span>
            <h3 class="card__title">${i.nombre}</h3>
            <p class="card__text">${i.stock} ${i.unidad} · ${MONEDA} ${formatear(i.valor_linea)} en riesgo</p>
            <div class="card__foot">
              <span class="tag ${tag}">${texto}</span>
              <small>${i.fecha_caducidad}</small>
            </div>
          </div>
        </article>`;
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
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4"><p class="empty" style="padding:16px">Ninguna receta coincide con “${recFiltro}”.</p></td></tr>`;
      return;
    }
    tbody.innerHTML = lista.map((p) => {
      const ingredientes = Object.entries(p.ingredientes || {})
        .map(([n, c]) => `${tituloBonito(n)}: ${c} ${unidades[n] || ""}`)
        .join(" · ");
      const estado = p.oculta
        ? '<span class="tag tag--crit">Oculto</span>'
        : '<span class="tag tag--ok">Visible</span>';
      return `
        <tr>
          <td><strong>${p.plato}</strong></td>
          <td><span class="tag tag--crit">-${p.descuento}%</span></td>
          <td style="font-size:.85rem">${ingredientes || "—"}</td>
          <td>${estado}</td>
        </tr>`;
    }).join("");
  }

  function renderInventario() {
    const tbody = $("#tbodyInventario");
    const q = invFiltro.trim().toLowerCase();
    const lista = q
      ? (DATA.inventario || []).filter((i) =>
          (i.nombre || "").toLowerCase().includes(q) || (i.categoria || "").toLowerCase().includes(q))
      : DATA.inventario;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7"><p class="empty" style="padding:16px">Ningún insumo coincide con “${invFiltro}”.</p></td></tr>`;
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
        </tr>`;
    }).join("");
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

  function renderAvisos() {
    const grid = $("#gridAvisos");
    const avisos = DATA.banners.filter((b) => b.tipo === "alerta");
    if (!avisos.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">Sin avisos de inventario generados.</p></div></article>`;
      return;
    }
    grid.innerHTML = avisos.map((b, i) => `
      <article class="card reveal" style="animation-delay:${i * 40}ms">
        <button class="card__x" data-x-banner="${b.id}" type="button" title="Retirar aviso" aria-label="Retirar aviso">✕</button>
        <div class="card__img">${fotoAviso(b)}</div>
        <div class="card__body">
          <span class="badge badge--dia">⚠️ Aviso de inventario</span>
          <h3 class="card__title">${b.titulo}</h3>
          <p class="card__text">${b.nota || ""}</p>
          <div class="card__foot">
            <span class="tag ${b.oculto ? "tag--crit" : "tag--ok"}">${b.oculto ? "Oculto" : "Visible"}</span>
            <button class="btn btn--cta-s" data-btoggle="${b.id}" data-oculto="${b.oculto ? "1" : "0"}" type="button">${b.oculto ? "Mostrar" : "Ocultar"}</button>
          </div>
        </div>
      </article>`).join("");
  }

  function renderAnuncios() {
    const grid = $("#gridAnuncios");
    const promos = DATA.promociones || [];
    if (!promos.length) {
      grid.innerHTML = `<article class="card"><div class="card__body"><p class="empty">No hay promociones registradas.</p></div></article>`;
      return;
    }
    grid.innerHTML = promos.map((p, i) => {
      const foto = p.imagen ? `<div class="card__img">${fotoEspecial(p)}</div>` : "";
      return `
      <article class="card reveal" style="animation-delay:${i * 40}ms">
        <button class="card__x" data-x-promo="${p.plato}" type="button" title="Retirar anuncio" aria-label="Retirar anuncio">✕</button>
        ${foto}
        <div class="card__body">
          <span class="badge badge--descuento">-${p.descuento}%</span>
          <h3 class="card__title">${p.plato}</h3>
          <p class="card__text">${p.descripcion}</p>
          <div class="card__meta"><span>🗓️ ${p.dias}</span><span>${p.categoria}</span></div>
          <div class="card__foot">
            <span class="tag ${p.oculta ? "tag--crit" : "tag--ok"}">${p.oculta ? "Oculto" : "Visible"}</span>
            <button class="btn btn--cta-s" data-ptoggle="${p.plato}" data-oculto="${p.oculta ? "1" : "0"}" type="button">${p.oculta ? "Mostrar" : "Ocultar"}</button>
          </div>
        </div>
        <div class="card__tools">
          <button class="card__copy" data-aflyer="${p.plato}" data-app="whatsapp" type="button" title="Flyer + WhatsApp">🟢 WhatsApp</button>
          <button class="card__copy" data-aflyer="${p.plato}" data-app="instagram" type="button" title="Flyer + Instagram">📸 Instagram</button>
          <button class="card__copy" data-aflyer="${p.plato}" data-app="telegram" type="button" title="Flyer + Telegram">✈️ Telegram</button>
          <button class="card__copy" data-flyer-view="${p.plato}" type="button" title="Ver flyer">🖼️ Flyer</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderPaneles() {
    const paneles = [
      ["KPIs", renderKpis],
      ["Alertas", renderAlertas],
      ["Especial", renderEspecial],
      ["Recetas", renderRecetas],
      ["Inventario", renderInventario],
      ["Banners", renderBanners],
      ["Avisos", renderAvisos],
      ["Anuncios", renderAnuncios],
    ];
    paneles.forEach(([nombre, fn]) => {
      try {
        fn();
      } catch (e) {
        console.error(`Render "${nombre}" falló:`, e);
      }
    });
  }

  /* ---------- carga ---------- */
  async function cargarDatosAdmin() {
    const res = await fetch("/api/admin/datos");
    if (res.status === 401) {
      toggleUI(false);
      throw new Error("Sesión expirada");
    }
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
    toggleUI(true);
    renderPaneles();
    const activa = document.querySelector("#dashboard .admin-vista.activa");
    mostrarVistaAdmin(activa ? activa.dataset.vista : "resumen");
    iniciarRefresco();
  }

  /* Refresco en vivo del inventario (mientras se ve la vista de inventario) */
  async function cargarDatosSoft() {
    try {
      const res = await fetch("/api/admin/datos");
      if (res.status === 401) { toggleUI(false); detenerRefresco(); return; }
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
      renderPaneles();
    } catch (err) {
      console.warn("El refresco del inventario falló", err);
    }
  }

  function iniciarRefresco() {
    if (refrescoTimer) return;
    refrescoTimer = setInterval(async () => {
      const vistaActiva = document.querySelector("#dashboard .admin-vista.activa");
      if (vistaActiva && vistaActiva.dataset.vista === "inventario") await cargarDatosSoft();
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
      else toggleUI(false);
    } catch (err) {
      console.error(err);
      toggleUI(false);
    }
  }

  /* ---------- eventos ---------- */
  function enlazar() {
    $("#formLogin").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const msg = $("#loginMsg");
      msg.hidden = true;
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario: $("#inUsuario").value, password: $("#inPassword").value }),
        });
        const data = await res.json();
        if (!data.ok) {
          msg.textContent = data.error || "Credenciales inválidas.";
          msg.hidden = false;
          return;
        }
        $("#inPassword").value = "";
        await cargarDatosAdmin();
      } catch (err) {
        msg.textContent = "Error de conexión.";
        msg.hidden = false;
      }
    });

    $("#btnLogout").addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      DATA = null;
      detenerRefresco();
      invFiltro = "";
      recFiltro = "";
      const bInv = $("#invBuscar");
      if (bInv) bInv.value = "";
      const bRec = $("#recBuscar");
      if (bRec) bRec.value = "";
      toggleUI(false);
    });

    const invBuscar = $("#invBuscar");
    if (invBuscar) {
      invBuscar.addEventListener("input", (ev) => {
        invFiltro = ev.target.value;
        renderInventario();
      });
    }

    const recBuscar = $("#recBuscar");
    if (recBuscar) {
      recBuscar.addEventListener("input", (ev) => {
        recFiltro = ev.target.value;
        renderRecetas();
      });
    }

    document.querySelectorAll(".admin-nav__btn").forEach((btn) =>
      btn.addEventListener("click", () => mostrarVistaAdmin(btn.dataset.vista))
    );

    $("#btnCerrarModal").addEventListener("click", cerrarModal);
    $("#overlay").addEventListener("click", cerrarModal);

    document.addEventListener("click", (ev) => {
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
      const xPromo = ev.target.closest("[data-x-promo]");
      if (xPromo) {
        cambiarVisibilidad("promo", xPromo.dataset.xPromo, true);
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
    });
  }

  async function cambiarVisibilidad(tipo, id, ocultar) {
    try {
      const res = await fetch("/api/admin/visibilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, id, ocultar }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      await cargarDatosAdmin();
    } catch (err) {
      console.error(err);
      alert("No se pudo actualizar la visibilidad del anuncio.");
    }
  }

  /* ---------- inicio ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    enlazar();
    verificarSesion();
  });
})();