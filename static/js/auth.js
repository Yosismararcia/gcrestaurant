/* ============================================================
   G&CRestaurant · auth.js (LOGIN UNIFICADO)
   Un único modal de acceso compartido por las tres páginas
   (portada, cliente y admin). El backend /api/login distingue
   el rol: cliente → /cliente, administrador → /admin.
   ============================================================ */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  let sesion = { autenticado: false, admin: false, rol: "", usuario: "", nombre: "", cedula: "" };

  function mensaje(el, texto, ok) {
    el.textContent = texto;
    el.className = "auth__msg " + (ok ? "auth__msg--ok" : "auth__msg--err");
    el.hidden = false;
  }

  function notificar() {
    if (typeof window.GCAuth !== "undefined" && typeof window.GCAuth.onCambio === "function") {
      try { window.GCAuth.onCambio(sesion); } catch (e) { /* aislado por página */ }
    }
  }

  /* ---------- construir el modal (una sola vez por página) ---------- */
  function construir() {
    const modal = $("#modalAcceso");
    if (!modal || modal.dataset.listos) return;
    modal.dataset.listos = "1";
    modal.innerHTML = `
      <div class="modal__card">
        <button class="modal__close" id="btnCerrarAcceso" type="button" aria-label="Cerrar">×</button>
        <p class="kicker">G&amp;CRestaurant</p>
        <h3 class="modal__title" id="modalAccesoTitulo">Inicia sesión</h3>
        <p class="section__sub">Un solo acceso para clientes y administradores: entra con tu usuario y contraseña.</p>
        <div class="tabs" role="tablist">
          <button class="tab activo" id="tabLogin" type="button" role="tab">Ingresar</button>
          <button class="tab" id="tabRegistro" type="button" role="tab">Registrarme</button>
        </div>
        <form class="auth" id="formLogin">
          <label class="auth__label" for="inUsuario">Usuario</label>
          <input class="auth__input" id="inUsuario" type="text" placeholder="Tu usuario" autocomplete="username" required>
          <label class="auth__label" for="inClave">Contraseña</label>
          <input class="auth__input" id="inClave" type="password" placeholder="Tu contraseña" autocomplete="current-password" required>
          <button class="btn btn--primary btn--block" type="submit">Entrar</button>
          <p class="auth__msg" id="msgLogin" hidden></p>
        </form>
        <form class="auth" id="formRegistro" hidden>
          <label class="auth__label" for="regNombre">Nombre completo</label>
          <input class="auth__input" id="regNombre" type="text" placeholder="Ej. María Pérez" autocomplete="name" required>
          <label class="auth__label" for="regCedula">Cédula / DNI</label>
          <input class="auth__input" id="regCedula" type="text" placeholder="Ej. 12345678" autocomplete="off" required>
          <label class="auth__label" for="regUsuario">Usuario</label>
          <input class="auth__input" id="regUsuario" type="text" placeholder="Elige un usuario (mín. 3 letras)" autocomplete="username" required>
          <label class="auth__label" for="regClave">Contraseña</label>
          <input class="auth__input" id="regClave" type="password" placeholder="Crea tu contraseña (mín. 4)" autocomplete="new-password" required>
          <button class="btn btn--primary btn--block" type="submit">Crear cuenta</button>
          <p class="auth__msg" id="msgRegistro" hidden></p>
        </form>
      </div>`;

    $("#btnCerrarAcceso").addEventListener("click", cerrar);
    $("#tabLogin").addEventListener("click", () => mostrarTab("login"));
    $("#tabRegistro").addEventListener("click", () => mostrarTab("registro"));
    $("#formLogin").addEventListener("submit", enviarLogin);
    $("#formRegistro").addEventListener("submit", enviarRegistro);
    const overlay = $("#overlayAcceso");
    if (overlay) overlay.addEventListener("click", cerrar);
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") cerrar();
    });
  }

  function mostrarTab(nombre) {
    const login = nombre === "login";
    const tL = $("#tabLogin");
    const tR = $("#tabRegistro");
    if (tL) tL.classList.toggle("activo", login);
    if (tR) tR.classList.toggle("activo", !login);
    $("#formLogin").hidden = !login;
    $("#formRegistro").hidden = login;
  }

  function abrir(tab = "login") {
    construir();
    mostrarTab(tab);
    $("#modalAcceso").hidden = false;
    const overlay = $("#overlayAcceso");
    if (overlay) overlay.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const foco = tab === "registro" ? $("#regNombre") : $("#inUsuario");
      if (foco) foco.focus();
    }, 60);
  }

  function cerrar() {
    const modal = $("#modalAcceso");
    if (modal) modal.hidden = true;
    const overlay = $("#overlayAcceso");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function redirigir(data) {
    window.location.href = data && data.admin ? "/admin" : "/cliente";
  }

  async function enviarLogin(ev) {
    ev.preventDefault();
    const msg = $("#msgLogin");
    msg.hidden = true;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: $("#inUsuario").value.trim(), password: $("#inClave").value }),
      });
      const data = await res.json();
      if (!data.ok) { mensaje(msg, data.error || "Credenciales inválidas.", false); return; }
      sesion = data;
      notificar();
      mensaje(msg, "Bienvenido, " + (data.nombre || data.usuario) + " 🎉", true);
      setTimeout(() => redirigir(data), 500);
    } catch (err) {
      mensaje(msg, "Error de conexión. Intenta de nuevo.", false);
    }
  }

  async function enviarRegistro(ev) {
    ev.preventDefault();
    const msg = $("#msgRegistro");
    msg.hidden = true;
    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: $("#regNombre").value.trim(),
          cedula: $("#regCedula").value.trim(),
          usuario: $("#regUsuario").value.trim(),
          password: $("#regClave").value,
        }),
      });
      const data = await res.json();
      if (!data.ok) { mensaje(msg, data.error || "No se pudo crear la cuenta.", false); return; }
      sesion = data;
      notificar();
      mensaje(msg, (data.mensaje || "Cuenta creada.") + " Redirigiendo…", true);
      setTimeout(() => redirigir(data), 500);
    } catch (err) {
      mensaje(msg, "Error de conexión. Intenta de nuevo.", false);
    }
  }

  async function cerrarSesion() {
    try { await fetch("/api/logout", { method: "POST" }); } catch (e) { /* sin red */ }
    sesion = { autenticado: false, admin: false };
    notificar();
    window.location.href = "/";
  }

  async function sincronizar() {
    try {
      const res = await fetch("/api/sesion");
      sesion = await res.json();
    } catch (e) {
      sesion = { autenticado: false, admin: false };
    }
    notificar();
    return sesion;
  }

  window.GCAuth = {
    abrir,
    cerrar,
    cerrarSesion,
    sincronizar,
    onCambio: null,
    get sesion() { return sesion; },
  };
})();