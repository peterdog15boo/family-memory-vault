/**
 * Ask AI product-help layer.
 */

export { HELP_KNOWLEDGE, type HelpKnowledgeEntry, type HelpTopicId } from "@/lib/ai/help/knowledge";
export {
  answerProductHelp,
  formatSecondaryHelpTip,
  hasStrongMediaRequest,
  isMixedHelpAndMediaRequest,
  isProductHelpQuestion,
  retrieveHelpEntries,
  shouldOverrideWithProductHelp,
  type HelpAnswer,
  type HelpAnswerLink,
} from "@/lib/ai/help/retrieve";
