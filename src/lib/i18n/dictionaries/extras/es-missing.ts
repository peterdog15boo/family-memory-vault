import type { MessageTree } from "@/lib/i18n/types";

/** Nested tree for keys missing from es overlay (mostly feedback modal + a few common/assistant). */
export const esMissing: MessageTree = {
  common: {
    deleteConfirmPhoto:
      "¿Eliminar “{name}”? Se quita de forma permanente de Fotos y no se puede deshacer.",
    thisPhoto: "esta foto",
    required: "obligatorio",
  },
  assistant: {
    messageLabel: "Tu mensaje para Preguntar a la IA",
  },
  feedback: {
    linkAriaBeta: "Enviar comentarios de la beta",
    betaBadge: "Beta",
    bannerBodyWithSurvey:
      "Envía un error o una idea desde la app, o responde la encuesta más larga cuando tengas unos minutos.",
    bannerCta: "Enviar comentarios",
    surveyLink: "¿Prefieres una encuesta más larga?",
    surveyPromoTitle: "¿Tienes unos minutos más?",
    surveyPromoBody:
      "Nuestra encuesta de la beta cubre el panorama completo: cómo se siente la bóveda para tu familia.",
    surveyOpensNew: "(se abre en una pestaña nueva)",
    modalEyebrow: "Comentarios de la beta",
    modalTitle: "Ayúdanos a mejorar",
    modalLead:
      "Tanto los errores como las ideas ayudan. Los detalles técnicos se incluyen automáticamente.",
    modalLeadWithSurvey:
      "Envía un reporte rápido aquí cuando quieras — o responde la encuesta más larga de la beta cuando puedas.",
    modeAria: "Tipo de comentario",
    modeBug: "Reporte de error",
    modeFeature: "Solicitud de función",
    fieldTitle: "Título",
    fieldWhatHappened: "Qué ocurrió",
    fieldDescription: "Descripción",
    fieldExpected: "Comportamiento esperado",
    fieldSeverity: "Gravedad",
    fieldProblem: "Problema a resolver",
    fieldSolution: "Solución sugerida",
    fieldCategory: "Categoría",
    categoryFromPage: "Sugerido desde esta página: {category}",
    optional: "opcional",
    titlePlaceholderBug: "Resumen breve del problema",
    titlePlaceholderFeature: "Nombre corto para la idea",
    descPlaceholderBug:
      "Pasos para reproducirlo, qué viste y cuándo ocurrió.",
    descPlaceholderFeature: "Describe la idea y a quién ayudaría.",
    expectedPlaceholder: "¿Qué esperabas en su lugar?",
    problemPlaceholder: "¿Qué problema resuelve esto para tu familia?",
    solutionPlaceholder: "Cualquier enfoque que tengas en mente…",
    severity: {
      low: "Baja",
      medium: "Media",
      high: "Alta",
      blocking: "Bloqueante",
    },
    historyTitle: "Tus comentarios recientes",
    historyLead:
      "Mantendremos el estado actualizado aquí mientras revisamos los reportes.",
    historyLoading: "Cargando…",
    historyAria: "Tus envíos recientes de comentarios",
    status: {
      new: "Nuevo",
      triaged: "Clasificado",
      "in-progress": "En progreso",
      resolved: "Resuelto",
    },
    techDetails: "Detalles técnicos",
    techUrl: "URL",
    techPath: "Ruta",
    techCategory: "Categoría",
    techBrowser: "Navegador",
    techViewport: "Ventana",
    techUser: "Cuenta",
    techSignedOut: "Sin iniciar sesión",
    techTime: "Marca de tiempo",
    techConsole: "Errores recientes de la consola",
    techConsoleEmpty: "Ninguno capturado",
    copyDebug: "Copiar info de depuración",
    copyDebugDone: "Copiado",
    copyDebugAria: "Copiar detalles técnicos al portapapeles",
    copyDebugFailed:
      "No se pudo copiar la info de depuración. Selecciona y copia manualmente.",
    screenshotLabel: "Captura de pantalla",
    screenshotPasteTitle: "Pega una captura de pantalla",
    screenshotPasteHint:
      "Toma una captura con las herramientas de tu sistema y luego pulsa Ctrl+V o ⌘V aquí. También puedes soltar una imagen.",
    screenshotCapture: "Capturar página actual",
    screenshotCapturing: "Capturando…",
    screenshotBrowse: "Elegir imagen",
    screenshotRemove: "Quitar",
    screenshotRemoveAria: "Quitar captura de pantalla",
    screenshotPreviewAlt: "Vista previa de la captura adjunta",
    screenshotNoImage: "No se encontró ninguna imagen en el portapapeles.",
    screenshotFailed:
      "No se pudo adjuntar esa imagen. Prueba con otro archivo.",
    screenshotCaptureFallback:
      "No se pudo capturar esta página automáticamente. Pega una captura en su lugar (Ctrl+V / ⌘V).",
    cancel: "Cancelar",
    submit: "Enviar comentarios",
    sending: "Enviando…",
    done: "Listo",
    closeAria: "Cerrar comentarios",
    successTitle: "Gracias",
    successThanksBeta:
      "¡Gracias por ayudarnos a mejorar Family Memory Vault durante la beta!",
    successBody:
      "Recibimos tu nota. Nos ayuda a priorizar qué corregir y qué construir a continuación.",
    successTicket: "Ticket {ticketId}",
    successTicketLabel: "Tu ticket",
    successTicketHint:
      "Guarda este ID por si necesitas hacer un seguimiento con nosotros.",
    successBodyWithTicket:
      "Guarda este ID de ticket si necesitas hacer un seguimiento: {ticketId}.",
    errorGeneric: "No se pudieron enviar los comentarios. Inténtalo de nuevo.",
  },
};
