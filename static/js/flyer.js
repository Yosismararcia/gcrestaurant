/* ============================================================
   G&CRestaurant · Flyers promocionales (solo panel admin)
   Genera flyer en canvas 1080×1080 con la foto del platillo
   y permite descargar o compartir en WhatsApp / Instagram / Telegram.
   ============================================================ */
(() => {
  "use strict";

  const MONEDA = "S/";
  const $ = (sel) => document.querySelector(sel);
  const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  const EMOJIS = {
    "especial del mar": "🐟", "japón": "🍣", "méxico": "🌮", "italia": "🍝",
    "españa": "🥘", "eeuu": "🍔", "tailandia": "🍜", "india": "🍛",
    "light": "🥗", "clásicos": "🍗", "sopas": "🍲", "bebidas": "🍹",
    "postres": "🍰",
  };

  const HASHTAGS = {
    "especial del mar": ["#FrescuraDelMar", "#CevicheDeLaCasa"],
    "japón": ["#SushiLovers", "#RollsDeAutor"],
    "méxico": ["#TacosAmor", "#SaborMexicano"],
    "italia": ["#DolceVita", "#PastaPeruana"],
    "españa": ["#PaellaVibes", "#SaborEspanol"],
    "eeuu": ["#BurgerTime", "#SmashDay"],
    "tailandia": ["#PadThaiVibes", "#SaborTailandes"],
    "india": ["#CurryLovers", "#SpiceUp"],
    "light": ["#CenaLigera", "#HealthyChoice"],
    "clásicos": ["#ClasicosGC", "#SaborDeSiempre"],
    "sopas": ["#ComfortFood", "#SopasCalientes"],
    "bebidas": ["#RefrescaTuDia", "#BebidasGC"],
    "postres": ["#DulceMomento", "#PostresIRresistibles"],
  };

  const COLOR_CATEGORIA = {
    "especial del mar": "#0ea5e9", "japón": "#dc2626", "méxico": "#d97706",
    "italia": "#16a34a", "españa": "#ea580c", "eeuu": "#2563eb",
    "tailandia": "#e11d48", "india": "#f59e0b", "light": "#16a34a",
    "clásicos": "#b45309", "sopas": "#0d9488", "bebidas": "#0891b2",
    "postres": "#c026d3",
  };

  const formatear = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const emojiPorCategoria = (cat) => EMOJIS[(cat || "").toLowerCase()] || "🍽️";

  function textoPromocion(p) {
    const cat = (p.categoria || "").toLowerCase();
    const emoji = EMOJIS[cat] || "🍽️";
    const precio = Number.isFinite(p.precio_final)
      ? ` a solo ${MONEDA} ${formatear(p.precio_final)} (${p.descuento}% de descuento)`
      : "";
    const tags = (HASHTAGS[cat] || ["#GCRestaurant"]).join(" ");
    return [
      `✨ ¡HOY se antoja ${p.plato} en G&CRestaurant! ${emoji}`,
      `${p.descripcion}${precio}.`,
      `🗓️ ${p.dias} · ¡Corre que vuelan!`,
      `📍 Pide aquí 👉 ${location.origin}/cliente`,
      ``,
      `#GCRestaurant #PromoDeHoy #Descuentos ${tags}`,
    ].join("\n");
  }

  function descargarFlyer(url, nombre) {
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  }

  let timerAviso = null;
  function avisoMini(texto) {
    let el = document.querySelector(".mini-aviso");
    if (!el) {
      el = document.createElement("div");
      el.className = "mini-aviso";
      document.body.appendChild(el);
    }
    el.textContent = texto;
    el.classList.add("mostrar");
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.classList.remove("mostrar"), 3000);
  }

  function pintarRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function cargarImagen(url) {
    return new Promise((resolver, rechazar) => {
      const segura = location.origin + "/img?url=" + encodeURIComponent(url);
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolver(im);
      im.onerror = () => rechazar(new Error("imagen no cargó"));
      im.src = segura;
    });
  }

  async function construirFlyer(p) {
    const L = 1080;
    const lienzo = document.createElement("canvas");
    lienzo.width = L; lienzo.height = L;
    const ctx = lienzo.getContext("2d");

    const fondo = ctx.createLinearGradient(0, 0, L, L);
    fondo.addColorStop(0, "#7c2d12"); fondo.addColorStop(1, "#c2410c");
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, L, L);

    pintarRect(ctx, 60, 60, 960, 960, 44);
    ctx.fillStyle = "#fffdf6"; ctx.fill();
    ctx.strokeStyle = "#f7ead7"; ctx.lineWidth = 4; ctx.stroke();

    const acento = COLOR_CATEGORIA[(p.categoria || "").toLowerCase()] || "#ea580c";
    ctx.save();
    pintarRect(ctx, 100, 100, 880, 540, 32); ctx.clip();
    const g = ctx.createLinearGradient(100, 100, 980, 640);
    g.addColorStop(0, "#ffedd5"); g.addColorStop(1, "#fed7aa");
    ctx.fillStyle = g; ctx.fillRect(100, 100, 880, 540);
    if (p.imagen) {
      try {
        const img = await cargarImagen(p.imagen);
        const escala = Math.max(880 / img.width, 540 / img.height);
        const iw = img.width * escala, ih = img.height * escala;
        ctx.drawImage(img, 100 + (880 - iw) / 2, 100 + (540 - ih) / 2, iw, ih);
      } catch (e) {
        ctx.font = "120px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(emojiPorCategoria(p.categoria), 540, 370);
      }
    } else {
      ctx.font = "120px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(emojiPorCategoria(p.categoria), 540, 370);
    }
    ctx.restore();

    const disco = 210;
    ctx.save();
    ctx.beginPath(); ctx.arc(940, 620, disco / 2, 0, Math.PI * 2); ctx.fillStyle = acento; ctx.fill();
    ctx.beginPath(); ctx.arc(940 + 16, 620 + 16, disco / 2 - 12, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.fillStyle = acento; ctx.font = "700 66px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`-${p.descuento}%`, 940 + 16, 598);
    ctx.font = "600 30px Inter, sans-serif";
    ctx.fillText("HOY", 940 + 16, 668);
    ctx.restore();

    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = acento; ctx.font = "700 34px Inter, sans-serif";
    ctx.fillText((p.categoria || "").toUpperCase(), 100, 720);

    ctx.fillStyle = "#3a2a1f"; ctx.font = "900 60px Fraunces, serif";
    const nombre = p.plato.toUpperCase();
    ctx.fillText(nombre.length > 20 ? nombre.slice(0, 20) + "…" : nombre, 100, 800);

    ctx.fillStyle = "#6b5240"; ctx.font = "500 34px Inter, sans-serif";
    ctx.fillText(Number.isFinite(p.precio_final) ? `Desde ${MONEDA} ${formatear(p.precio_final)}` : "Consúltanos", 100, 864);
    ctx.fillStyle = "#9a6b4f"; ctx.font = "500 27px Inter, sans-serif";
    ctx.fillText(p.dias + " · G&CRestaurant", 100, 916);

    return lienzo;
  }

  const CACHE_FLYER = {};

  async function flyerArchivo(p) {
    const k = norm(p.plato);
    if (CACHE_FLYER[k]) return CACHE_FLYER[k];
    const lienzo = await construirFlyer(p);
    const blob = await new Promise((res) => lienzo.toBlob(res, "image/png"));
    const archivo = {
      file: new File([blob], `flyer-${k}.png`, { type: "image/png" }),
      url: lienzo.toDataURL("image/png"),
    };
    CACHE_FLYER[k] = archivo;
    return archivo;
  }

  async function compartirFlyer(p, app) {
    const texto = textoPromocion(p);
    const urlPagina = location.origin + "/cliente";
    avisoMini("Generando flyer…");
    let ar;
    try {
      ar = await flyerArchivo(p);
    } catch (e) {
      avisoMini("No se pudo generar el flyer 😕");
      console.error(e);
      return;
    }
    try {
      if (navigator.canShare && navigator.canShare({ files: [ar.file] })) {
        await navigator.share({ files: [ar.file], title: "G&CRestaurant", text: texto, url: urlPagina });
        avisoMini("Flyer listo ✓");
        return;
      }
    } catch (e) { /* cancelado o falló */ }
    descargarFlyer(ar.url, ar.file.name);
    if (app === "whatsapp") {
      window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank", "noopener");
    } else if (app === "telegram") {
      window.open(
        "https://t.me/share/url?url=" + encodeURIComponent(urlPagina) + "&text=" + encodeURIComponent(texto),
        "_blank", "noopener");
    } else {
      try { await navigator.clipboard.writeText(texto); } catch (e) { /* sin portapapeles */ }
      window.open("https://www.instagram.com/", "_blank", "noopener");
    }
    avisoMini("Flyer descargado 🖼️ adjúntalo en tu chat");
  }

  async function abrirFlyer(p) {
    $("#modalContenido").innerHTML = `
      <span class="badge badge--hero">🖼️ Flyer promocional</span>
      <div class="flyer-vista" id="flyerVista"><p class="empty">Generando flyer…</p></div>
      <div class="flyer-acciones">
        <button class="btn btn--primary btn--cta-s" id="btnAbrirFlyer" type="button">Generando…</button>
      </div>`;
    $("#modalEspecial").hidden = false;
    $("#overlay").hidden = false;
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const { url } = await flyerArchivo(p);
      $("#flyerVista").innerHTML = `<img class="flyer-img" src="${url}" alt="Flyer de ${p.plato}">`;
      $("#flyerVista").dataset.plato = p.plato;
      $("#btnAbrirFlyer").outerHTML = `
        <div class="flyer-acciones">
          <a class="btn btn--primary btn--cta-s" href="${url}" download="flyer-${norm(p.plato)}.png">⬇️ Descargar PNG</a>
          <button class="btn btn--cta-s" data-app-share="whatsapp" type="button">🟢 WhatsApp</button>
          <button class="btn btn--cta-s" data-app-share="instagram" type="button">📸 Instagram</button>
          <button class="btn btn--cta-s" data-app-share="telegram" type="button">✈️ Telegram</button>
        </div>`;
    } catch (e) {
      $("#flyerVista").innerHTML = `<p class="empty">No se pudo generar el flyer.</p>`;
      console.error(e);
    }
  }

  window.Flyer = { abrirFlyer, compartirFlyer };
})();