import type { MessageTree } from "@/lib/i18n/types";

function nestFromDots(flat: Record<string, string>): MessageTree {
  const root: MessageTree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let cur: MessageTree = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      const next = cur[p];
      if (next == null || typeof next === "string") {
        cur[p] = {};
      }
      cur = cur[p] as MessageTree;
    }
    cur[parts[parts.length - 1]!] = value;
  }
  return root;
}

/** UI chrome for Terms gate + footer link (legal body stays English). */
export const termsChromeByLocale: Record<string, MessageTree> = {
  es: nestFromDots({
    "nav.terms": "Términos",
    "settings.termsOfService": "Términos del servicio",
    "settings.readMoreLegal": "Consulta también nuestros {terms} y {privacy}.",
    "terms.eyebrow": "Acuerdo",
    "terms.title": "Términos del servicio",
    "terms.lead":
      "Revisa y acepta los Términos del servicio antes de continuar en Family Memory Vault.",
    "terms.documentVersion": "Versión del documento: {version}",
    "terms.docAria": "Términos del servicio",
    "terms.agreeCheckbox": "He leído y acepto los Términos del servicio",
    "terms.errorSave": "No se pudo guardar tu aceptación.",
    "terms.errorNetwork": "Error de red. Inténtalo de nuevo.",
    "terms.submit": "Acepto – Continuar",
  }),
  fr: nestFromDots({
    "nav.terms": "Conditions",
    "settings.termsOfService": "Conditions d’utilisation",
    "settings.readMoreLegal": "Consultez aussi nos {terms} et {privacy}.",
    "terms.eyebrow": "Accord",
    "terms.title": "Conditions d’utilisation",
    "terms.lead":
      "Veuillez lire et accepter les Conditions d’utilisation avant de continuer dans Family Memory Vault.",
    "terms.documentVersion": "Version du document : {version}",
    "terms.docAria": "Conditions d’utilisation",
    "terms.agreeCheckbox":
      "J’ai lu et j’accepte les Conditions d’utilisation",
    "terms.errorSave": "Impossible d’enregistrer votre acceptation.",
    "terms.errorNetwork": "Erreur réseau. Réessayez.",
    "terms.submit": "J’accepte – Continuer",
  }),
  de: nestFromDots({
    "nav.terms": "Bedingungen",
    "settings.termsOfService": "Nutzungsbedingungen",
    "settings.readMoreLegal": "Siehe auch unsere {terms} und {privacy}.",
    "terms.eyebrow": "Vereinbarung",
    "terms.title": "Nutzungsbedingungen",
    "terms.lead":
      "Bitte lesen und akzeptieren Sie die Nutzungsbedingungen, bevor Sie mit Family Memory Vault fortfahren.",
    "terms.documentVersion": "Dokumentversion: {version}",
    "terms.docAria": "Nutzungsbedingungen",
    "terms.agreeCheckbox":
      "Ich habe die Nutzungsbedingungen gelesen und stimme zu",
    "terms.errorSave": "Ihre Zustimmung konnte nicht gespeichert werden.",
    "terms.errorNetwork": "Netzwerkfehler. Bitte erneut versuchen.",
    "terms.submit": "Ich stimme zu – Weiter",
  }),
  "pt-BR": nestFromDots({
    "nav.terms": "Termos",
    "settings.termsOfService": "Termos de Serviço",
    "settings.readMoreLegal": "Veja também nossos {terms} e {privacy}.",
    "terms.eyebrow": "Acordo",
    "terms.title": "Termos de Serviço",
    "terms.lead":
      "Revise e aceite os Termos de Serviço antes de continuar no Family Memory Vault.",
    "terms.documentVersion": "Versão do documento: {version}",
    "terms.docAria": "Termos de Serviço",
    "terms.agreeCheckbox": "Li e aceito os Termos de Serviço",
    "terms.errorSave": "Não foi possível salvar sua aceitação.",
    "terms.errorNetwork": "Erro de rede. Tente novamente.",
    "terms.submit": "Aceito – Continuar",
  }),
  "zh-CN": nestFromDots({
    "nav.terms": "条款",
    "settings.termsOfService": "服务条款",
    "settings.readMoreLegal": "另请参阅我们的{terms}和{privacy}。",
    "terms.eyebrow": "协议",
    "terms.title": "服务条款",
    "terms.lead": "请在继续使用 Family Memory Vault 前阅读并接受服务条款。",
    "terms.documentVersion": "文档版本：{version}",
    "terms.docAria": "服务条款",
    "terms.agreeCheckbox": "我已阅读并同意服务条款",
    "terms.errorSave": "无法保存您的同意。",
    "terms.errorNetwork": "网络错误。请重试。",
    "terms.submit": "我同意 – 继续",
  }),
  ja: nestFromDots({
    "nav.terms": "利用規約",
    "settings.termsOfService": "利用規約",
    "settings.readMoreLegal": "{terms}と{privacy}もご確認ください。",
    "terms.eyebrow": "同意",
    "terms.title": "利用規約",
    "terms.lead":
      "Family Memory Vault を続ける前に、利用規約を確認して同意してください。",
    "terms.documentVersion": "文書バージョン：{version}",
    "terms.docAria": "利用規約",
    "terms.agreeCheckbox": "利用規約を読み、同意します",
    "terms.errorSave": "同意を保存できませんでした。",
    "terms.errorNetwork": "ネットワークエラーです。もう一度お試しください。",
    "terms.submit": "同意して続行",
  }),
  ko: nestFromDots({
    "nav.terms": "약관",
    "settings.termsOfService": "서비스 약관",
    "settings.readMoreLegal": "{terms} 및 {privacy}도 확인하세요.",
    "terms.eyebrow": "동의",
    "terms.title": "서비스 약관",
    "terms.lead":
      "Family Memory Vault를 계속하기 전에 서비스 약관을 검토하고 동의해 주세요.",
    "terms.documentVersion": "문서 버전: {version}",
    "terms.docAria": "서비스 약관",
    "terms.agreeCheckbox": "서비스 약관을 읽었으며 이에 동의합니다",
    "terms.errorSave": "동의를 저장할 수 없습니다.",
    "terms.errorNetwork": "네트워크 오류입니다. 다시 시도해 주세요.",
    "terms.submit": "동의하고 계속",
  }),
  it: nestFromDots({
    "nav.terms": "Termini",
    "settings.termsOfService": "Termini di servizio",
    "settings.readMoreLegal": "Consulta anche i nostri {terms} e {privacy}.",
    "terms.eyebrow": "Accordo",
    "terms.title": "Termini di servizio",
    "terms.lead":
      "Rivedi e accetta i Termini di servizio prima di continuare in Family Memory Vault.",
    "terms.documentVersion": "Versione del documento: {version}",
    "terms.docAria": "Termini di servizio",
    "terms.agreeCheckbox": "Ho letto e accetto i Termini di servizio",
    "terms.errorSave": "Impossibile salvare l’accettazione.",
    "terms.errorNetwork": "Errore di rete. Riprova.",
    "terms.submit": "Accetto – Continua",
  }),
  nl: nestFromDots({
    "nav.terms": "Voorwaarden",
    "settings.termsOfService": "Servicevoorwaarden",
    "settings.readMoreLegal": "Bekijk ook onze {terms} en {privacy}.",
    "terms.eyebrow": "Overeenkomst",
    "terms.title": "Servicevoorwaarden",
    "terms.lead":
      "Lees en accepteer de Servicevoorwaarden voordat je verdergaat in Family Memory Vault.",
    "terms.documentVersion": "Documentversie: {version}",
    "terms.docAria": "Servicevoorwaarden",
    "terms.agreeCheckbox": "Ik heb de Servicevoorwaarden gelezen en ga akkoord",
    "terms.errorSave": "Je akkoord kon niet worden opgeslagen.",
    "terms.errorNetwork": "Netwerkfout. Probeer het opnieuw.",
    "terms.submit": "Ik ga akkoord – Doorgaan",
  }),
};
