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

  const MESSAGES = {
    en: {
      copied: "Copied",
      copied_toast: "Copied to clipboard",
      copy_failed: "Could not copy",
      not_configured: "Feedback is not configured in this build.",
      consent: "Accept the consent line before sending.",
      empty: "Write a message or a checklist before sending.",
      message_too_long: "The message is over 2800 characters.",
      checklist_too_long: "The checklist is over 2500 characters.",
      sending: "Sending...",
      success: "Sent. Thanks for helping.",
      rate_limited: "Please wait a few minutes before sending again.",
      failed: "Could not send. Please try again later.",
    },
    es: {
      copied: "Copiado",
      copied_toast: "Copiado al portapapeles",
      copy_failed: "No se pudo copiar",
      not_configured: "El feedback no está configurado en esta versión.",
      consent: "Acepta enviar el mensaje al Discord de CleanYourMail.",
      empty: "Escribe un mensaje o un checklist antes de enviar.",
      message_too_long: "El mensaje supera los 2800 caracteres.",
      checklist_too_long: "El checklist supera los 2500 caracteres.",
      sending: "Enviando...",
      success: "Enviado. Gracias por ayudar.",
      rate_limited: "Espera unos minutos antes de volver a enviar.",
      failed: "No se pudo enviar. Inténtalo de nuevo más tarde.",
    },
    de: {
      copied: "Kopiert",
      copied_toast: "In die Zwischenablage kopiert",
      copy_failed: "Kopieren fehlgeschlagen",
      not_configured: "Feedback ist in dieser Version nicht konfiguriert.",
      consent: "Bestätige die Einwilligung vor dem Senden.",
      empty: "Schreibe eine Nachricht oder eine Checkliste vor dem Senden.",
      message_too_long: "Die Nachricht überschreitet 2800 Zeichen.",
      checklist_too_long: "Die Checkliste überschreitet 2500 Zeichen.",
      sending: "Wird gesendet...",
      success: "Gesendet. Danke für die Hilfe.",
      rate_limited: "Bitte warte ein paar Minuten, bevor du erneut sendest.",
      failed: "Senden fehlgeschlagen. Bitte versuche es später erneut.",
    },
    fr: {
      copied: "Copié",
      copied_toast: "Copié dans le presse-papiers",
      copy_failed: "Impossible de copier",
      not_configured: "Les retours ne sont pas configurés dans cette version.",
      consent: "Acceptez d'envoyer le message au Discord de CleanYourMail.",
      empty: "Écrivez un message ou une checklist avant d'envoyer.",
      message_too_long: "Le message dépasse 2800 caractères.",
      checklist_too_long: "La checklist dépasse 2500 caractères.",
      sending: "Envoi...",
      success: "Envoyé. Merci pour votre aide.",
      rate_limited: "Patientez quelques minutes avant de renvoyer.",
      failed: "Impossible d'envoyer. Réessayez plus tard.",
    },
    it: {
      copied: "Copiato",
      copied_toast: "Copiato negli appunti",
      copy_failed: "Impossibile copiare",
      not_configured: "Il feedback non è configurato in questa versione.",
      consent: "Accetta di inviare il messaggio al Discord di CleanYourMail.",
      empty: "Scrivi un messaggio o una checklist prima di inviare.",
      message_too_long: "Il messaggio supera i 2800 caratteri.",
      checklist_too_long: "La checklist supera i 2500 caratteri.",
      sending: "Invio...",
      success: "Inviato. Grazie per l'aiuto.",
      rate_limited: "Attendi qualche minuto prima di inviare di nuovo.",
      failed: "Impossibile inviare. Riprova più tardi.",
    },
    ja: {
      copied: "コピーしました",
      copied_toast: "クリップボードにコピーしました",
      copy_failed: "コピーできませんでした",
      not_configured: "このビルドではフィードバックが設定されていません。",
      consent: "送信前に、CleanYourMail の Discord への送信に同意してください。",
      empty: "送信前にメッセージまたはチェックリストを入力してください。",
      message_too_long: "メッセージが 2800 文字を超えています。",
      checklist_too_long: "チェックリストが 2500 文字を超えています。",
      sending: "送信中...",
      success: "送信しました。ご協力ありがとうございます。",
      rate_limited: "数分待ってから再送信してください。",
      failed: "送信できませんでした。後でもう一度お試しください。",
    },
    ko: {
      copied: "복사됨",
      copied_toast: "클립보드에 복사됨",
      copy_failed: "복사할 수 없습니다",
      not_configured: "이 빌드에는 피드백이 설정되어 있지 않습니다.",
      consent: "보내기 전에 CleanYourMail Discord로의 전송에 동의하세요.",
      empty: "보내기 전에 메시지나 체크리스트를 작성하세요.",
      message_too_long: "메시지가 2800자를 초과합니다.",
      checklist_too_long: "체크리스트가 2500자를 초과합니다.",
      sending: "보내는 중...",
      success: "보냈습니다. 도와주셔서 감사합니다.",
      rate_limited: "몇 분 후에 다시 보내세요.",
      failed: "보낼 수 없습니다. 나중에 다시 시도하세요.",
    },
    "pt-BR": {
      copied: "Copiado",
      copied_toast: "Copiado para a área de transferência",
      copy_failed: "Não foi possível copiar",
      not_configured: "O feedback não está configurado nesta versão.",
      consent: "Aceite enviar a mensagem para o Discord do CleanYourMail.",
      empty: "Escreva uma mensagem ou um checklist antes de enviar.",
      message_too_long: "A mensagem ultrapassa 2800 caracteres.",
      checklist_too_long: "O checklist ultrapassa 2500 caracteres.",
      sending: "Enviando...",
      success: "Enviado. Obrigado por ajudar.",
      rate_limited: "Aguarde alguns minutos antes de enviar novamente.",
      failed: "Não foi possível enviar. Tente novamente mais tarde.",
    },
    "zh-CN": {
      copied: "已复制",
      copied_toast: "已复制到剪贴板",
      copy_failed: "无法复制",
      not_configured: "此版本未配置反馈。",
      consent: "发送前请同意将消息发送到 CleanYourMail 的 Discord。",
      empty: "发送前请填写消息或检查清单。",
      message_too_long: "消息超过 2800 个字符。",
      checklist_too_long: "检查清单超过 2500 个字符。",
      sending: "正在发送...",
      success: "已发送。感谢你的帮助。",
      rate_limited: "请等待几分钟后再发送。",
      failed: "无法发送。请稍后再试。",
    },
    "zh-TW": {
      copied: "已複製",
      copied_toast: "已複製到剪貼簿",
      copy_failed: "無法複製",
      not_configured: "此版本未設定意見回饋。",
      consent: "送出前請同意將訊息傳送到 CleanYourMail 的 Discord。",
      empty: "送出前請填寫訊息或檢查清單。",
      message_too_long: "訊息超過 2800 個字元。",
      checklist_too_long: "檢查清單超過 2500 個字元。",
      sending: "傳送中...",
      success: "已送出。感謝你的協助。",
      rate_limited: "請等待幾分鐘後再送出。",
      failed: "無法送出。請稍後再試。",
    },
  };

  const messages = MESSAGES[lang] || MESSAGES.en;

  const languageSelect = doc.getElementById("language-select");
  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      if (languageSelect.value) {
        window.location.assign(languageSelect.value);
      }
    });
  }

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
      setStatus(messages.not_configured, "error");
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending || !button || !kind || !message || !checklist || !consent) return;

      const messageText = message.value.trim();
      const checklistText = checklist.value.trim();
      if (!consent.checked) {
        setStatus(messages.consent, "error");
        consent.focus();
        return;
      }
      if (!messageText && !checklistText) {
        setStatus(messages.empty, "error");
        message.focus();
        return;
      }
      if (messageText.length > 2800) {
        setStatus(messages.message_too_long, "error");
        message.focus();
        return;
      }
      if (checklistText.length > 2500) {
        setStatus(messages.checklist_too_long, "error");
        checklist.focus();
        return;
      }

      sending = true;
      button.disabled = true;
      button.textContent = messages.sending;
      setStatus(messages.sending);

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
          setStatus(messages.rate_limited, "error");
          return;
        }
        if (response.status === 503) {
          setStatus(messages.not_configured, "error");
          return;
        }
        if (!response.ok) {
          setStatus(messages.failed, "error");
          return;
        }

        let result = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        if (!result || result.ok !== true) {
          setStatus(messages.failed, "error");
          return;
        }

        form.reset();
        setStatus(messages.success, "success");
      } catch {
        setStatus(messages.failed, "error");
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
        button.textContent = messages.copied;
        showToast(messages.copied_toast);
        setTimeout(() => { button.textContent = original; }, 1600);
      } catch {
        showToast(messages.copy_failed);
      }
    });
  });
})();
