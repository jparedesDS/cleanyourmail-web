import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const APP_JS = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const ENDPOINT = "https://cleanyourmail-feedback.subtitleme.workers.dev";

const COPY = {
  en: {
    consent: "Accept the consent line before sending.",
    empty: "Write a message or a checklist before sending.",
    sending: "Sending...",
    success: "Sent. Thanks for helping.",
    rateLimited: "Please wait a few minutes before sending again.",
    failed: "Could not send. Please try again later.",
    notConfigured: "Feedback is not configured in this build.",
  },
  es: {
    consent: "Acepta enviar el mensaje al Discord de CleanYourMail.",
    empty: "Escribe un mensaje o un checklist antes de enviar.",
    sending: "Enviando...",
    success: "Enviado. Gracias por ayudar.",
    rateLimited: "Espera unos minutos antes de volver a enviar.",
    failed: "No se pudo enviar. Inténtalo de nuevo más tarde.",
    notConfigured: "El feedback no está configurado en esta versión.",
  },
};

class FakeElement {
  constructor(id) {
    this.id = id;
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.textContent = "";
    this.dataset = {};
    this.listeners = new Map();
    this.focused = false;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  focus() {
    this.focused = true;
  }
}

function okResponse(body = { ok: true }, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function loadPage({ lang = "en", endpoint = ENDPOINT, fetchImpl } = {}) {
  const ids = [
    "toast",
    "feedback-form",
    "feedback-kind",
    "feedback-message",
    "feedback-checklist",
    "feedback-contact",
    "feedback-website",
    "feedback-consent",
    "feedback-submit",
    "feedback-status",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  const form = elements["feedback-form"];
  form.dataset.endpoint = endpoint;
  form.resetCalls = 0;
  form.reset = () => {
    form.resetCalls += 1;
    elements["feedback-kind"].value = "feedback";
    elements["feedback-message"].value = "";
    elements["feedback-checklist"].value = "";
    elements["feedback-contact"].value = "";
    elements["feedback-website"].value = "";
    elements["feedback-consent"].checked = false;
  };
  elements["feedback-kind"].value = "feedback";
  elements["feedback-submit"].textContent = lang === "es" ? "Enviar feedback" : "Send feedback";

  const document = {
    documentElement: { lang },
    body: { appendChild() {} },
    getElementById: (id) => elements[id] ?? null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement("created"),
    execCommand: () => true,
  };

  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url, init });
    if (fetchImpl) return fetchImpl(url, init, calls);
    return okResponse();
  };

  vm.runInNewContext(
    APP_JS,
    {
      document,
      window: { isSecureContext: false },
      navigator: {},
      fetch: fetchStub,
      AbortSignal,
      setTimeout,
      clearTimeout,
      console,
    },
    { filename: "app.js" },
  );

  return {
    elements,
    calls,
    submit: async () => {
      const handler = form.listeners.get("submit")?.[0];
      assert.ok(handler, "app.js did not register a submit handler");
      await handler({ preventDefault() {} });
    },
  };
}

test("no consent means no fetch and a consent message", async () => {
  const page = loadPage();
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = false;

  await page.submit();

  assert.equal(page.calls.length, 0);
  assert.equal(page.elements["feedback-status"].textContent, COPY.en.consent);
  assert.equal(page.elements["feedback-consent"].focused, true);
});

test("an empty message and checklist means no fetch", async () => {
  const page = loadPage();
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.calls.length, 0);
  assert.equal(page.elements["feedback-status"].textContent, COPY.en.empty);
  assert.equal(page.elements["feedback-message"].focused, true);
});

test("a valid submit sends exactly one request with the expected JSON", async () => {
  const page = loadPage();
  page.elements["feedback-kind"].value = "bug";
  page.elements["feedback-message"].value = "  The export crashes.  ";
  page.elements["feedback-checklist"].value = "  Windows 11  ";
  page.elements["feedback-contact"].value = "  tester  ";
  page.elements["feedback-website"].value = "";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.calls.length, 1);
  const [{ url, init }] = page.calls;
  assert.equal(url, ENDPOINT);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    kind: "bug",
    message: "The export crashes.",
    checklist: "Windows 11",
    contact: "tester",
    app_version: "web",
    website: "",
  });
  assert.ok(init.signal instanceof AbortSignal, "request has no abort signal");
});

test("the button is disabled while the request is pending", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const page = loadPage({ fetchImpl: () => pending });
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = true;

  const submitted = page.submit();

  assert.equal(page.elements["feedback-submit"].disabled, true);
  assert.equal(page.elements["feedback-submit"].textContent, COPY.en.sending);
  assert.equal(page.elements["feedback-status"].textContent, COPY.en.sending);

  release(okResponse());
  await submitted;

  assert.equal(page.elements["feedback-submit"].disabled, false);
  assert.equal(page.elements["feedback-submit"].textContent, "Send feedback");
});

test("a 429 maps to the rate-limit status", async () => {
  const page = loadPage({ fetchImpl: async () => okResponse({ ok: false }, 429) });
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-status"].textContent, COPY.en.rateLimited);
  assert.equal(page.elements["feedback-status"].dataset.tone, "error");
});

test("a 503 maps to the not-configured status", async () => {
  const page = loadPage({ fetchImpl: async () => okResponse({ ok: false }, 503) });
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-status"].textContent, COPY.en.notConfigured);
  assert.equal(page.elements["feedback-status"].dataset.tone, "error");
});

test("a 2xx without {ok:true} is a failure, not a success", async () => {
  const page = loadPage({ fetchImpl: async () => okResponse({ ok: false }, 200) });
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-status"].textContent, COPY.en.failed);
  assert.equal(page.elements["feedback-form"].resetCalls, 0);
});

test("a timeout maps to the failure status", async () => {
  const page = loadPage({
    fetchImpl: async () => {
      const error = new Error("The operation timed out.");
      error.name = "TimeoutError";
      throw error;
    },
  });
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-status"].textContent, COPY.en.failed);
});

test("success resets the form and shows the success status", async () => {
  const page = loadPage();
  page.elements["feedback-kind"].value = "bug";
  page.elements["feedback-message"].value = "A real report";
  page.elements["feedback-checklist"].value = "Windows 11";
  page.elements["feedback-contact"].value = "tester";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-form"].resetCalls, 1);
  assert.equal(page.elements["feedback-message"].value, "");
  assert.equal(page.elements["feedback-checklist"].value, "");
  assert.equal(page.elements["feedback-contact"].value, "");
  assert.equal(page.elements["feedback-consent"].checked, false);
  assert.equal(page.elements["feedback-status"].textContent, COPY.en.success);
  assert.equal(page.elements["feedback-status"].dataset.tone, "success");
});

test("the same behavior is localized in Spanish", async () => {
  const page = loadPage({ lang: "es", fetchImpl: async () => okResponse({ ok: false }, 429) });
  page.elements["feedback-message"].value = "Un informe";
  page.elements["feedback-consent"].checked = true;

  await page.submit();

  assert.equal(page.elements["feedback-status"].textContent, COPY.es.rateLimited);
});
