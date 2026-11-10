(() => {
  const doc = document;
  const lang = doc.documentElement.lang || "en";
  const toast = doc.getElementById("toast");
  let toastTimer = null;

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  };

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "copy-helper";
    doc.body.appendChild(area);
    area.select();
    const ok = doc.execCommand("copy");
    area.remove();
    if (!ok) throw new Error("copy failed");
  };

  const feedbackCopy = lang === "es"
    ? {
        notConfigured: "El feedback no está configurado en esta versión.",
        consent: "Acepta enviar el mensaje al Discord de CleanYourMail.",
        empty: "Escribe un mensaje o un checklist antes de enviar.",
        messageTooLong: "El mensaje supera los 2800 caracteres.",
        checklistTooLong: "El checklist supera los 2500 caracteres.",
        sending: "Enviando...",
        success: "Enviado. Gracias por ayudar.",
        rateLimited: "Espera unos minutos antes de volver a enviar.",
        failed: "No se pudo enviar. Inténtalo de nuevo más tarde.",
      }
    : {
        notConfigured: "Feedback is not configured in this build.",
        consent: "Accept the consent line before sending.",
        empty: "Write a message or a checklist before sending.",
        messageTooLong: "The message is over 2800 characters.",
        checklistTooLong: "The checklist is over 2500 characters.",
        sending: "Sending...",
        success: "Sent. Thanks for helping.",
        rateLimited: "Please wait a few minutes before sending again.",
        failed: "Could not send. Please try again later.",
      };

  const initFeedback = () => {
    const form = doc.getElementById("feedback-form");
    if (!form) return;
    const kind = doc.getElementById("feedback-kind");
    const message = doc.getElementById("feedback-message");
    const checklist = doc.getElementById("feedback-checklist");
    const contact = doc.getElementById("feedback-contact");
    const website = doc.getElementById("feedback-website");
    const consent = doc.getElementById("feedback-consent");
    const button = doc.getElementById("feedback-submit");
    const status = doc.getElementById("feedback-status");
    const endpoint = (form.dataset.endpoint || "").trim();
    const originalLabel = button ? button.textContent.trim() : "";
    let sending = false;

    const setStatus = (text, tone) => {
      if (!status) return;
      status.textContent = text;
      if (tone) {
        status.dataset.tone = tone;
      } else {
        delete status.dataset.tone;
      }
    };

    if (!endpoint) {
      if (button) button.disabled = true;
      setStatus(feedbackCopy.notConfigured, "error");
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending || !button || !kind || !message || !checklist || !consent) return;

      const messageText = message.value.trim();
      const checklistText = checklist.value.trim();
      if (!consent.checked) {
        setStatus(feedbackCopy.consent, "error");
        consent.focus();
        return;
      }
      if (!messageText && !checklistText) {
        setStatus(feedbackCopy.empty, "error");
        message.focus();
        return;
      }
      if (messageText.length > 2800) {
        setStatus(feedbackCopy.messageTooLong, "error");
        message.focus();
        return;
      }
      if (checklistText.length > 2500) {
        setStatus(feedbackCopy.checklistTooLong, "error");
        checklist.focus();
        return;
      }

      sending = true;
      button.disabled = true;
      button.textContent = feedbackCopy.sending;
      setStatus(feedbackCopy.sending);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: kind.value,
            message: messageText,
            checklist: checklistText,
            contact: contact ? contact.value.trim() : "",
            app_version: "web",
            website: website ? website.value : "",
          }),
          signal: AbortSignal.timeout(20000),
        });

        if (response.status === 429) {
          setStatus(feedbackCopy.rateLimited, "error");
          return;
        }
        if (response.status === 503) {
          setStatus(feedbackCopy.notConfigured, "error");
          return;
        }
        if (!response.ok) {
          setStatus(feedbackCopy.failed, "error");
          return;
        }

        let result = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        if (!result || result.ok !== true) {
          setStatus(feedbackCopy.failed, "error");
          return;
        }

        form.reset();
        setStatus(feedbackCopy.success, "success");
      } catch {
        setStatus(feedbackCopy.failed, "error");
      } finally {
        sending = false;
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  };

  initFeedback();

  doc.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = button.textContent;
      try {
        await copyText(button.dataset.copy || "");
        button.textContent = lang === "es" ? "Copiado" : "Copied";
        showToast(lang === "es" ? "Copiado al portapapeles" : "Copied to clipboard");
        setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        showToast(lang === "es" ? "No se pudo copiar" : "Could not copy");
      }
    });
  });
})();
