const CONFIG = {
  submitEndpoint: "",
  requestIdPrefix: "SASPA",
};

const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      return;
    }
  },
};

function setTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.dataset.theme = isLight ? "light" : "dark";
  storage.set("theme", isLight ? "light" : "dark");
}

function initTheme() {
  const saved = storage.get("theme");
  if (saved === "light" || saved === "dark") {
    setTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  setTheme(prefersLight ? "light" : "dark");
}

function initYear() {
  const year = new Date().getFullYear();
  document.querySelectorAll('[data-slot="year"]').forEach((node) => {
    node.textContent = String(year);
  });
}

function toggleNav() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  nav.classList.toggle("is-open");
}

function openStatusDialog() {
  const dialog = document.getElementById("statusDialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  dialog.showModal();
}

function showNotice(node, kind, text) {
  if (!node) return;
  node.hidden = false;
  node.classList.remove("is-ok", "is-bad");
  if (kind === "ok") node.classList.add("is-ok");
  if (kind === "bad") node.classList.add("is-bad");
  node.textContent = text;
}

function hideNotice(node) {
  if (!node) return;
  node.hidden = true;
  node.textContent = "";
  node.classList.remove("is-ok", "is-bad");
}

function randomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${CONFIG.requestIdPrefix}-${out}`;
}

function collectFormData(form) {
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((value, key) => {
    obj[key] = String(value).trim();
  });
  return obj;
}

function formatKeyValue(obj, labelMap) {
  const lines = [];
  Object.keys(labelMap).forEach((key) => {
    const label = labelMap[key];
    const value = obj[key] || "—";
    lines.push(`${label}: ${value}`);
  });
  return lines.join("\n");
}

async function copyToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

async function maybeSubmit(payload) {
  if (!CONFIG.submitEndpoint) return { mode: "copy" };

  const res = await fetch(CONFIG.submitEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  return { mode: "sent" };
}

function saveDraft(formKey, values) {
  storage.set(`draft:${formKey}`, values);
}

function loadDraft(formKey) {
  return storage.get(`draft:${formKey}`) || null;
}

function applyDraft(form, draft) {
  if (!draft) return;
  Object.keys(draft).forEach((key) => {
    const input = form.elements.namedItem(key);
    if (!input) return;
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      input.checked = Boolean(draft[key]);
      return;
    }
    input.value = draft[key];
  });
}

function bindDraftAutoSave(form, formKey) {
  const handler = () => {
    const values = {};
    Array.from(form.elements).forEach((el) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      const name = el.name;
      if (!name) return;
      if (el instanceof HTMLInputElement && el.type === "checkbox") values[name] = el.checked;
      else values[name] = el.value;
    });
    saveDraft(formKey, values);
  };
  form.addEventListener("input", handler);
  form.addEventListener("change", handler);
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const form = document.querySelector('form[data-form="application"]');
  if (!tabs.length || !form) return;

  const title = document.querySelector('[data-slot="form-title"]');

  const applyType = (type) => {
    const input = form.elements.namedItem("type");
    if (input) input.value = type;
    if (title) {
      title.textContent =
        type === "transfer" ? "Заявка на перевод" : type === "reinstatement" ? "Заявка на восстановление" : "Заявка на вступление";
    }
    tabs.forEach((t) => {
      const active = t.dataset.tab === type;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
  };

  const byHash = () => {
    const raw = (location.hash || "").replace("#", "");
    if (raw === "transfer" || raw === "reinstatement" || raw === "join") applyType(raw);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const type = tab.dataset.tab;
      if (!type) return;
      history.replaceState(null, "", `#${type}`);
      applyType(type);
    });
  });

  byHash();
  window.addEventListener("hashchange", byHash);
}

function initCharterToc() {
  const toc = document.querySelector('[data-slot="toc"]');
  const article = document.querySelector('[data-slot="charter"]');
  if (!toc || !article) return;

  const slugFromText = (raw) => {
    const base = String(raw || "")
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    return base || "section";
  };

  const used = new Set(
    Array.from(article.querySelectorAll("[id]"))
      .map((el) => (el instanceof HTMLElement ? el.id : ""))
      .filter(Boolean),
  );

  const heads = Array.from(article.querySelectorAll("h2"));
  toc.innerHTML = "";
  heads.forEach((h) => {
    if (!(h instanceof HTMLElement)) return;
    if (!h.id) {
      const base = slugFromText(h.textContent);
      let id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      h.id = id;
      used.add(id);
    }
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.textContent = h.textContent || h.id;
    toc.appendChild(a);

    const isDocs = h.id === "documents" || String(h.textContent || "").toLowerCase().includes("актуальные документы");
    if (!isDocs) return;

    let el = h.nextElementSibling;
    while (el) {
      if (el instanceof HTMLHeadingElement && el.tagName === "H2") break;
      const cards = el.querySelectorAll ? Array.from(el.querySelectorAll("a.doc-card")) : [];
      cards.forEach((card) => {
        if (!(card instanceof HTMLAnchorElement)) return;
        const title = card.querySelector(".card-title");
        const text = String((title && title.textContent ? title.textContent : "") || "").trim();
        const href = card.getAttribute("href");
        if (!href || !text) return;
        const link = document.createElement("a");
        link.href = href;
        const target = card.getAttribute("target");
        const rel = card.getAttribute("rel");
        if (target) link.setAttribute("target", target);
        if (rel) link.setAttribute("rel", rel);
        link.className = "is-sub";
        link.textContent = text;
        toc.appendChild(link);
      });
      el = el.nextElementSibling;
    }
  });
}

function initPrisonShot() {
  document.querySelectorAll(".prison-shot-media").forEach((media) => {
    if (!(media instanceof HTMLElement)) return;
    const img = media.querySelector("img[data-slot='prison-photo']");
    if (!(img instanceof HTMLImageElement)) return;
    const sync = () => media.classList.toggle("has-photo", Boolean(img.complete && img.naturalWidth > 0));
    img.addEventListener("load", sync);
    img.addEventListener("error", sync);
    sync();
  });
}

function initApplicationForm() {
  const form = document.querySelector('form[data-form="application"]');
  if (!form) return;

  const formKey = "application";
  applyDraft(form, loadDraft(formKey));
  bindDraftAutoSave(form, formKey);

  const result = form.querySelector('[data-slot="form-result"]');

  const buildText = (values, requestId) => {
    const type = values.type || "join";
    const header = type === "transfer" ? "ЗАЯВКА НА ПЕРЕВОД" : type === "reinstatement" ? "ЗАЯВКА НА ВОССТАНОВЛЕНИЕ" : "ЗАЯВКА НА ВСТУПЛЕНИЕ";
    const map = {
      icName: "Имя Фамилия (IC)",
      staticId: "Статик / ID",
      icAge: "Возраст (IC)",
      oocAge: "Возраст (OOC)",
      discord: "Discord",
      motivation: "Почему SASPA?",
      experience: "Опыт в гос. структурах",
      onlineTime: "Время в онлайне (MSK)",
    };
    return `【${header}】\nID: ${requestId}\n\n${formatKeyValue(values, map)}`;
  };

  const onCopy = async () => {
    hideNotice(result);
    const values = collectFormData(form);
    if (!form.reportValidity()) return;

    const requestId = randomId();
    const text = buildText(values, requestId);
    await copyToClipboard(text);
    storage.set(`request:${requestId}`, { kind: "application", values, at: Date.now() });
    showNotice(result, "ok", `Скопировано. ID: ${requestId}`);
  };

  const copyBtn = document.querySelector('[data-action="copy-application"]');
  if (copyBtn) copyBtn.addEventListener("click", () => void onCopy().catch((e) => showNotice(result, "bad", String(e.message || e))));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideNotice(result);
    if (!form.reportValidity()) return;

    const values = collectFormData(form);
    const requestId = randomId();
    const text = buildText(values, requestId);
    const payload = { requestId, kind: "application", values, text };

    try {
      const outcome = await maybeSubmit(payload);
      storage.set(`request:${requestId}`, { kind: "application", values, at: Date.now() });
      if (outcome.mode === "sent") {
        showNotice(result, "ok", `Отправлено. ID: ${requestId}`);
      } else {
        await copyToClipboard(text);
        showNotice(result, "ok", `Endpoint не задан: скопировано. ID: ${requestId}`);
      }
    } catch (err) {
      await copyToClipboard(text);
      showNotice(result, "bad", `Ошибка отправки: скопировано. ID: ${requestId}`);
    }
  });
}

function initComplaintForm() {
  const form = document.querySelector('form[data-form="complaint"]');
  if (!form) return;

  const formKey = "complaint";
  applyDraft(form, loadDraft(formKey));
  bindDraftAutoSave(form, formKey);

  const result = form.querySelector('[data-slot="form-result"]');

  const buildText = (values, requestId) => {
    const map = {
      authorIc: "Заявитель (IC)",
      authorDiscord: "Discord",
      targetIc: "Сотрудник (IC)",
      when: "Дата/время",
      summary: "Суть жалобы",
      evidence: "Доказательства",
    };
    return `【ЖАЛОБА】\nID: ${requestId}\n\n${formatKeyValue(values, map)}`;
  };

  const onCopy = async () => {
    hideNotice(result);
    const values = collectFormData(form);
    if (!form.reportValidity()) return;
    const requestId = randomId();
    const text = buildText(values, requestId);
    await copyToClipboard(text);
    storage.set(`request:${requestId}`, { kind: "complaint", values, at: Date.now() });
    showNotice(result, "ok", `Скопировано. ID: ${requestId}`);
  };

  const copyBtn = document.querySelector('[data-action="copy-complaint"]');
  if (copyBtn) copyBtn.addEventListener("click", () => void onCopy().catch((e) => showNotice(result, "bad", String(e.message || e))));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideNotice(result);
    if (!form.reportValidity()) return;

    const values = collectFormData(form);
    const requestId = randomId();
    const text = buildText(values, requestId);
    const payload = { requestId, kind: "complaint", values, text };

    try {
      const outcome = await maybeSubmit(payload);
      storage.set(`request:${requestId}`, { kind: "complaint", values, at: Date.now() });
      if (outcome.mode === "sent") showNotice(result, "ok", `Отправлено. ID: ${requestId}`);
      else {
        await copyToClipboard(text);
        showNotice(result, "ok", `Endpoint не задан: скопировано. ID: ${requestId}`);
      }
    } catch (err) {
      await copyToClipboard(text);
      showNotice(result, "bad", `Ошибка отправки: скопировано. ID: ${requestId}`);
    }
  });
}

function initStatusCheck() {
  const button = document.querySelector('[data-action="check-status"]');
  const result = document.querySelector('[data-slot="status-result"]');
  const dialog = document.getElementById("statusDialog");
  if (!button || !result || !dialog) return;

  button.addEventListener("click", () => {
    const input = dialog.querySelector('input[name="requestId"]');
    const id = (input && input.value ? String(input.value).trim() : "").toUpperCase();
    if (!id) {
      showNotice(result, "bad", "Введите ID.");
      return;
    }
    const data = storage.get(`request:${id}`);
    if (!data) {
      showNotice(result, "bad", "Не найдено. Если отправляли вручную — это нормально.");
      return;
    }
    const date = new Date(data.at);
    showNotice(result, "ok", `Найдено локально: ${data.kind}. Дата: ${date.toLocaleString("ru-RU")}`);
  });
}

const AUTH_KEY = "saspa:auth";
const CREDS_KEY = "saspa:creds";
const LEADERSHIP_KEY = "saspa:leadership";
const PAGE_EDITS_PREFIX = "saspa:page:";
const EDIT_STATE_KEY = "saspa:edit-state";

function authGet() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    return JSON.parse(raw || "null");
  } catch {
    return storage.get(AUTH_KEY);
  }
}

function authSet(value) {
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(value));
  } catch {
    storage.set(AUTH_KEY, value);
  }
}

function authClear() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    try {
      localStorage.removeItem(AUTH_KEY);
    } catch {
      return;
    }
  }
}

function pagePath() {
  const p = typeof location !== "undefined" && location && typeof location.pathname === "string" ? location.pathname : "/";
  if (p === "/") return "/index.html";
  return p;
}

function pageEditsKey() {
  return `${PAGE_EDITS_PREFIX}${pagePath()}`;
}

function getPageEdits() {
  const saved = storage.get(pageEditsKey());
  return saved && typeof saved === "object" ? saved : {};
}

function setPageEdits(next) {
  storage.set(pageEditsKey(), next && typeof next === "object" ? next : {});
}

function applyPageEdits() {
  const edits = getPageEdits();
  document.querySelectorAll("[data-edit]").forEach((el) => {
    const slot = el.getAttribute("data-edit");
    if (!slot) return;
    const html = edits[slot];
    if (typeof html !== "string") return;
    el.innerHTML = html;
  });
}

function hasEditableSlots() {
  return document.querySelectorAll("[data-edit]").length > 0;
}

function isEditModeOn() {
  const s = storage.get(EDIT_STATE_KEY);
  if (!s || typeof s !== "object") return false;
  return Boolean(s[pagePath()]);
}

function setEditModeOn(on) {
  const s = storage.get(EDIT_STATE_KEY);
  const next = s && typeof s === "object" ? { ...s } : {};
  next[pagePath()] = Boolean(on);
  storage.set(EDIT_STATE_KEY, next);
}

function setEditable(enabled) {
  document.body.classList.toggle("is-editing", Boolean(enabled));
  document.querySelectorAll("[data-edit]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.contentEditable = enabled ? "true" : "false";
    el.spellcheck = false;
    el.classList.toggle("is-editable", Boolean(enabled));
  });
}

function saveCurrentPageEdits() {
  const next = { ...getPageEdits() };
  document.querySelectorAll("[data-edit]").forEach((el) => {
    const slot = el.getAttribute("data-edit");
    if (!slot) return;
    next[slot] = el.innerHTML;
  });
  setPageEdits(next);
}

function resetCurrentPageEdits() {
  localStorage.removeItem(pageEditsKey());
  applyPageEdits();
}

function ensureAdminToolbar() {
  let bar = document.querySelector('[data-slot="admin-toolbar"]');
  if (bar) return bar;
  bar = document.createElement("div");
  bar.setAttribute("data-slot", "admin-toolbar");
  bar.className = "admin-toolbar";
  bar.hidden = true;

  const title = document.createElement("div");
  title.className = "admin-toolbar-title";
  title.textContent = "Админ";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "button button-secondary";
  toggle.setAttribute("data-action", "toggle-edit");
  toggle.textContent = "Редактировать";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "button button-primary";
  save.setAttribute("data-action", "save-page");
  save.textContent = "Сохранить";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "button button-ghost";
  reset.setAttribute("data-action", "reset-page");
  reset.textContent = "Сброс";

  const addCharterSection = document.createElement("button");
  addCharterSection.type = "button";
  addCharterSection.className = "button button-ghost";
  addCharterSection.setAttribute("data-action", "add-charter-section");
  addCharterSection.textContent = "Добавить раздел";
  addCharterSection.hidden = true;

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.hidden = true;
  notice.setAttribute("data-slot", "admin-toolbar-result");

  bar.appendChild(title);
  bar.appendChild(toggle);
  bar.appendChild(save);
  bar.appendChild(reset);
  bar.appendChild(addCharterSection);
  bar.appendChild(notice);

  document.body.appendChild(bar);
  return bar;
}

function syncAdminTools() {
  const bar = ensureAdminToolbar();
  const canShow = isLoggedIn() && hasEditableSlots();
  bar.hidden = !canShow;
  if (!canShow) setEditable(false);
  if (canShow) setEditable(isEditModeOn());

  const addCharterSection = bar.querySelector('[data-action="add-charter-section"]');
  if (addCharterSection) {
    const isCharterPage = pagePath() === "/charter.html";
    const hasCharter = Boolean(document.querySelector('[data-slot="charter"]'));
    addCharterSection.hidden = !(canShow && isCharterPage && hasCharter);
  }
}

function getAuthCreds() {
  const saved = storage.get(CREDS_KEY);
  if (saved && typeof saved.username === "string" && typeof saved.password === "string") return saved;
  const defaults = { username: "admin", password: "admin" };
  storage.set(CREDS_KEY, defaults);
  return defaults;
}

function isLoggedIn() {
  const a = authGet();
  return Boolean(a && a.loggedIn);
}

function setLoggedIn(loggedIn) {
  if (!loggedIn) {
    authClear();
    return;
  }
  authSet({ loggedIn: true, at: Date.now() });
}

function openAuthDialog() {
  const dialog = document.getElementById("authDialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const form = dialog.querySelector('form[data-form="auth"]');
  if (form) {
    const user = form.elements.namedItem("username");
    if (user && user instanceof HTMLInputElement) user.focus();
  }
  dialog.showModal();
}

function syncAuthUi() {
  const logoutBtn = document.querySelector('[data-slot="logout"]');
  const loginBtn = document.querySelector('[data-action="open-auth"]');
  const logged = isLoggedIn();
  if (logoutBtn) logoutBtn.hidden = !logged;
  if (loginBtn) loginBtn.hidden = logged;

  const adminPanel = document.querySelector('[data-slot="admin-panel"]');
  if (adminPanel) adminPanel.hidden = !logged;
  syncAdminTools();
}

function defaultLeadershipData() {
  return {
    prisonCommand: [
      { title: "Начальник Федеральной тюрьмы", name: "Vasiliy Dargon", meta: "Действующий лидер • Спец.связь: указать" },
      { title: "Зам. начальника тюрьмы", name: "Имя Фамилия", meta: "Курирует внутренний режим • Спец.связь: указать" },
      { title: "Зам. начальника тюрьмы", name: "Имя Фамилия", meta: "Курирует отделы и кадры • Спец.связь: указать" },
      { title: "Зам. начальника тюрьмы", name: "Имя Фамилия", meta: "Курирует безопасность и КПП • Спец.связь: указать" },
    ],
    departmentHeads: [
      { title: "HRD — Human Resource Department", name: "Имя Фамилия", meta: "Набор • обучение • отчётность" },
      { title: "FAS — Federal Advanced Squad", name: "Имя Фамилия", meta: "Тактика • ЧС • подавление бунтов" },
      { title: "MED — Medical Events Department", name: "Имя Фамилия", meta: "Проверки • EMS • мероприятия • СМИ" },
      { title: "PCD — Prisoners Control Department", name: "Имя Фамилия", meta: "Режим • конвой • КПП" },
      { title: "IAG — Internal Affairs Group", name: "Имя Фамилия", meta: "Расследования • контроль • дисциплина" },
    ],
    academy: { title: "Руководитель PA", name: "Имя Фамилия", meta: "Теория • практика • экзамены" },
    history: {
      leaders: [
        "Vasiliy Dargon — Действующий лидер.",
        "Artem Lawson — Отстоял 1 срок.",
        "Arth Hustle — Отстоял 1 срок.",
        "Prescott Washington — Отстоял 1 срок.",
        "Jeremy Hopkins — Не справился.",
        "Enrique Harrison — Не справился.",
        "Oliver Harrison — Отстоял 1 срок.",
        "Huskar Castillio — Отстоял 1 срок.",
        "Thomas Bauer — Отстоял 1 срок.",
        "Nick Sionis — Отстоял 1 срок.",
        "Sergey Lawson — Отстоял 1 срок.",
        "Jeff Preacher — Отстоял 1 срок.",
        "Leo Nice — Не справился.",
        "Antony Gatsby — Отстоял 3 срока.",
        "Enrique Harrison — Отстоял 1 срок.",
        "Ares Provenzano — Отстоял 3 срока.",
        "Kai Ackerman — Не справился.",
        "Roberto Ecstasy — Отстоял 1 срок.",
        "Naomi Reed — Отстояла 6 сроков.",
      ],
      hall: [
        "Black Draken — Отстоял 2 срока.",
        "Hris Reed — Отстояла 3 срока.",
        "Jamik Draken — Отстоял 2 срока.",
        "Steve Codeine — Отстоял 2 срока.",
        "Alina Wisher — Отстояла 2 срока.",
        "Adriano Watson — Отстоял 2 срока.",
        "Jamik Draken — Отстоял 1 срок.",
        "Max Collins — Отстоял 4 срока.",
        "Leoni Draken — Отстоял 6 сроков.",
        "Mari Angelic — Отстояла 5 сроков.",
        "Kyoto Kalashnikov — Не справился.",
      ],
    },
  };
}

function getLeadershipData() {
  const saved = storage.get(LEADERSHIP_KEY);
  if (saved && typeof saved === "object") {
    const next = {
      ...saved,
      prisonCommand: Array.isArray(saved.prisonCommand) ? saved.prisonCommand : defaultLeadershipData().prisonCommand,
      departmentHeads: Array.isArray(saved.departmentHeads) ? saved.departmentHeads : defaultLeadershipData().departmentHeads,
      academy: saved.academy && typeof saved.academy === "object" ? saved.academy : defaultLeadershipData().academy,
      history: saved.history && typeof saved.history === "object" ? saved.history : defaultLeadershipData().history,
    };
    next.departmentHeads = next.departmentHeads.map((x) => {
      const title = String(x && x.title ? x.title : "");
      const mappedTitle = title
        .replace("Facility Administration Service", "Federal Advanced Squad")
        .replace("Human Resources Division", "Human Resource Department")
        .replace("Medical Department", "Medical Events Department")
        .replace("Prisoner Control Division", "Prisoners Control Department");
      return { ...x, title: mappedTitle || "—" };
    });
    return next;
  }
  return defaultLeadershipData();
}

function cardNode(title, text, meta, extraClass) {
  const card = document.createElement("div");
  card.className = `card card-static${extraClass ? ` ${extraClass}` : ""}`;
  const t = document.createElement("div");
  t.className = "card-title";
  t.textContent = title;
  const c = document.createElement("div");
  c.className = "card-text";
  c.textContent = text;
  const m = document.createElement("div");
  m.className = "card-meta";
  m.textContent = meta;
  card.appendChild(t);
  card.appendChild(c);
  card.appendChild(m);
  return card;
}

function fillCard(node, title, text, meta) {
  node.className = "card card-static";
  node.innerHTML = "";
  const t = document.createElement("div");
  t.className = "card-title";
  t.textContent = title;
  const c = document.createElement("div");
  c.className = "card-text";
  c.textContent = text;
  const m = document.createElement("div");
  m.className = "card-meta";
  m.textContent = meta;
  node.appendChild(t);
  node.appendChild(c);
  node.appendChild(m);
}

function historyBlockNode(title, items, kind) {
  const block = document.createElement("div");
  block.className = "history-block";
  const h = document.createElement("div");
  h.className = "history-title";
  h.textContent = title;
  const ol = document.createElement("ol");
  ol.className = "history-list";
  items.forEach((line, idx) => {
    const li = document.createElement("li");
    const mark = document.createElement("span");
    const isFirstLeader = kind === "leaders" && idx === 0;
    const markKind = isFirstLeader ? "crown" : kind === "hall" ? "star" : "heart";
    mark.className = `mark mark-${markKind}`;
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = markKind === "crown" ? "👑" : markKind === "star" ? "✦" : "❤";
    li.appendChild(mark);
    li.appendChild(document.createTextNode(` ${line}`));
    ol.appendChild(li);
  });
  block.appendChild(h);
  block.appendChild(ol);
  return block;
}

function renderLeadership(data) {
  const command = document.querySelector('[data-slot="prison-command"]');
  if (command) {
    command.innerHTML = "";
    (data.prisonCommand || []).forEach((x) => {
      const idx = command.children.length;
      const cls = idx === 0 ? "card-leader" : "card-deputy";
      command.appendChild(cardNode(x.title || "—", x.name || "—", x.meta || "—", cls));
    });
  }

  const heads = document.querySelector('[data-slot="department-heads"]');
  if (heads) {
    heads.innerHTML = "";
    (data.departmentHeads || []).forEach((x) => {
      heads.appendChild(cardNode(x.title || "—", x.name || "—", x.meta || "—"));
    });
  }

  const academy = document.querySelector('[data-slot="academy-card"]');
  if (academy && data.academy) {
    fillCard(academy, data.academy.title || "—", data.academy.name || "—", data.academy.meta || "—");
  }

  const history = document.querySelector('[data-slot="leaders-history"]');
  if (history) {
    history.innerHTML = "";
    const leaders = Array.isArray(data.history && data.history.leaders) ? data.history.leaders : [];
    const hall = Array.isArray(data.history && data.history.hall) ? data.history.hall : [];
    history.appendChild(historyBlockNode("Руководители", leaders, "leaders"));
    history.appendChild(historyBlockNode("Зал славы", hall, "hall"));
  }
}

function buildLeadershipAdmin(panel, data) {
  panel.innerHTML = "";

  const header = document.createElement("div");
  header.className = "panel-header";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Редактирование руководства";
  const sub = document.createElement("div");
  sub.className = "panel-sub";
  sub.textContent = "Сохраняется локально на этом устройстве";
  header.appendChild(title);
  header.appendChild(sub);
  panel.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "grid fields";

  const addInput = (label, name, value) => {
    const lab = document.createElement("label");
    lab.className = "field";
    const s = document.createElement("span");
    s.className = "field-label";
    s.textContent = label;
    const input = document.createElement("input");
    input.className = "input";
    input.name = name;
    input.value = value || "";
    lab.appendChild(s);
    lab.appendChild(input);
    grid.appendChild(lab);
  };

  const addTextarea = (label, name, value) => {
    const lab = document.createElement("label");
    lab.className = "field field-wide";
    const s = document.createElement("span");
    s.className = "field-label";
    s.textContent = label;
    const ta = document.createElement("textarea");
    ta.className = "textarea";
    ta.name = name;
    ta.rows = 8;
    ta.value = value || "";
    lab.appendChild(s);
    lab.appendChild(ta);
    grid.appendChild(lab);
  };

  (data.prisonCommand || []).forEach((x, i) => {
    addInput(`${x.title} — имя`, `pc-${i}-name`, x.name);
    addInput(`${x.title} — подпись`, `pc-${i}-meta`, x.meta);
  });

  (data.departmentHeads || []).forEach((x, i) => {
    addInput(`${x.title} — имя`, `dh-${i}-name`, x.name);
    addInput(`${x.title} — подпись`, `dh-${i}-meta`, x.meta);
  });

  addInput(`${data.academy.title} — имя`, "academy-name", data.academy.name);
  addInput(`${data.academy.title} — подпись`, "academy-meta", data.academy.meta);

  const leadersText = (data.history && Array.isArray(data.history.leaders) ? data.history.leaders : []).join("\n");
  const hallText = (data.history && Array.isArray(data.history.hall) ? data.history.hall : []).join("\n");
  addTextarea("История лидеров (каждая строка отдельно)", "history-leaders", leadersText);
  addTextarea("Зал славы (каждая строка отдельно)", "history-hall", hallText);

  panel.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "panel-actions";
  const saveBtn = document.createElement("button");
  saveBtn.className = "button button-primary";
  saveBtn.type = "button";
  saveBtn.setAttribute("data-action", "save-leadership");
  saveBtn.textContent = "Сохранить";
  actions.appendChild(saveBtn);
  panel.appendChild(actions);

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.hidden = true;
  notice.setAttribute("data-slot", "admin-result");
  panel.appendChild(notice);
}

function saveLeadershipFromPanel() {
  const panel = document.querySelector('[data-slot="admin-panel"]');
  if (!panel) return;
  const notice = panel.querySelector('[data-slot="admin-result"]');
  hideNotice(notice);

  const data = getLeadershipData();
  const next = {
    ...data,
    prisonCommand: (data.prisonCommand || []).map((x, i) => ({
      ...x,
      name: String(panel.querySelector(`input[name="pc-${i}-name"]`)?.value || "").trim() || "—",
      meta: String(panel.querySelector(`input[name="pc-${i}-meta"]`)?.value || "").trim() || "—",
    })),
    departmentHeads: (data.departmentHeads || []).map((x, i) => ({
      ...x,
      name: String(panel.querySelector(`input[name="dh-${i}-name"]`)?.value || "").trim() || "—",
      meta: String(panel.querySelector(`input[name="dh-${i}-meta"]`)?.value || "").trim() || "—",
    })),
    academy: {
      ...data.academy,
      name: String(panel.querySelector('input[name="academy-name"]')?.value || "").trim() || "—",
      meta: String(panel.querySelector('input[name="academy-meta"]')?.value || "").trim() || "—",
    },
    history: {
      leaders: String(panel.querySelector('textarea[name="history-leaders"]')?.value || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
      hall: String(panel.querySelector('textarea[name="history-hall"]')?.value || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    },
  };

  storage.set(LEADERSHIP_KEY, next);
  renderLeadership(next);
  buildLeadershipAdmin(panel, next);
  showNotice(panel.querySelector('[data-slot="admin-result"]'), "ok", "Сохранено локально.");
}

function initLeadership() {
  const panel = document.querySelector('[data-slot="admin-panel"]');
  const command = document.querySelector('[data-slot="prison-command"]');
  const heads = document.querySelector('[data-slot="department-heads"]');
  const history = document.querySelector('[data-slot="leaders-history"]');
  if (!panel && !command && !heads && !history) {
    syncAuthUi();
    return;
  }

  const data = getLeadershipData();
  renderLeadership(data);
  if (panel) buildLeadershipAdmin(panel, data);
  syncAuthUi();
}

function initActions() {
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target.closest("[data-action]") : null;
    if (!target) return;
    const action = target.getAttribute("data-action");
    if (action === "toggle-theme") {
      const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      setTheme(current === "light" ? "dark" : "light");
    }
    if (action === "toggle-nav") toggleNav();
    if (action === "open-status") openStatusDialog();
    if (action === "open-auth") openAuthDialog();
    if (action === "logout") {
      setLoggedIn(false);
      setEditModeOn(false);
      syncAuthUi();
    }
    if (action === "auth-login") {
      const dialog = document.getElementById("authDialog");
      const form = dialog ? dialog.querySelector('form[data-form="auth"]') : null;
      const result = form ? form.querySelector('[data-slot="auth-result"]') : null;
      hideNotice(result);
      if (!form) return;
      const values = collectFormData(form);
      const creds = getAuthCreds();
      const ok = values.username === creds.username && values.password === creds.password;
      if (!ok) {
        showNotice(result, "bad", "Неверный логин или пароль.");
        return;
      }
      setLoggedIn(true);
      syncAuthUi();
      initLeadership();
      if (dialog && typeof dialog.close === "function") dialog.close();
    }
    if (action === "toggle-edit") {
      if (!isLoggedIn()) return;
      if (!hasEditableSlots()) return;
      const next = !isEditModeOn();
      setEditModeOn(next);
      syncAdminTools();
      const notice = document.querySelector('[data-slot="admin-toolbar-result"]');
      showNotice(notice, "ok", next ? "Режим редактирования включён." : "Режим редактирования выключен.");
    }
    if (action === "save-page") {
      if (!isLoggedIn()) return;
      if (!hasEditableSlots()) return;
      saveCurrentPageEdits();
      initCharterToc();
      initPrisonShot();
      const notice = document.querySelector('[data-slot="admin-toolbar-result"]');
      showNotice(notice, "ok", "Сохранено локально.");
    }
    if (action === "reset-page") {
      if (!isLoggedIn()) return;
      if (!hasEditableSlots()) return;
      resetCurrentPageEdits();
      setEditModeOn(false);
      syncAdminTools();
      initCharterToc();
      initPrisonShot();
      const notice = document.querySelector('[data-slot="admin-toolbar-result"]');
      showNotice(notice, "ok", "Сброшено на исходный вариант.");
    }
    if (action === "add-charter-section") {
      if (!isLoggedIn()) return;
      const article = document.querySelector('[data-slot="charter"]');
      if (!(article instanceof HTMLElement)) return;
      const title = String(prompt("Название раздела:", "Новый раздел") || "").trim();
      if (!title) return;
      const h2 = document.createElement("h2");
      h2.textContent = title;
      const p = document.createElement("p");
      p.textContent = "Текст раздела…";
      article.appendChild(h2);
      article.appendChild(p);
      initCharterToc();
      if (h2.id) location.hash = `#${h2.id}`;
      const notice = document.querySelector('[data-slot="admin-toolbar-result"]');
      showNotice(notice, "ok", "Раздел добавлен. Нажмите «Сохранить» для фиксации.");
    }
    if (action === "save-leadership") {
      if (!isLoggedIn()) return;
      saveLeadershipFromPanel();
    }
  });
}

initTheme();
initYear();
applyPageEdits();
initPrisonShot();
initActions();
initTabs();
initApplicationForm();
initComplaintForm();
initCharterToc();
initStatusCheck();
initLeadership();
syncAdminTools();
