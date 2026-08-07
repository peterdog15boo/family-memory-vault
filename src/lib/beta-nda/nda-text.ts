/**
 * Exact Beta Tester NDA body for the clickwrap page.
 * Keep in sync with BETA_NDA_VERSION when updating.
 */

export type NdaSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  afterBullets?: string[];
};

export const BETA_NDA_TITLE = "BETA TESTER NON-DISCLOSURE AGREEMENT";

export const BETA_NDA_INTRO = [
  "This Beta Tester Non-Disclosure Agreement (“Agreement”) is entered into as of the date of acceptance below (the “Effective Date”) by and between:",
  "Family Memory Vault (or the legal entity operating Family Memory Vault) (“Company”),",
  "and the individual accepting this Agreement (“Tester”).",
];

export const BETA_NDA_SECTIONS: NdaSection[] = [
  {
    heading: "1. Purpose",
    paragraphs: [
      "Company is allowing Tester to access and evaluate a pre-release version of the Family Memory Vault platform and related materials (the “Beta”) solely for the purpose of testing and providing feedback.",
    ],
  },
  {
    heading: "2. Confidential Information",
    paragraphs: [
      "“Confidential Information” means all non-public information disclosed by Company to Tester, including but not limited to: the existence, features, functionality, design, user interface, and performance of the Beta; screenshots, videos, documentation, and any materials related to the Beta; business plans, pricing ideas, marketing plans, and product roadmap; and any feedback, comments, or suggestions provided by Tester (once submitted to Company).",
      "Confidential Information does not include information that is or becomes publicly available through no fault of Tester, was already known to Tester before disclosure by Company, is independently developed by Tester without use of Company’s Confidential Information, or is rightfully received from a third party without restriction.",
    ],
  },
  {
    heading: "3. Tester-Uploaded Content",
    paragraphs: [
      "Any photos, videos, documents, or other files that Tester uploads to the Beta during testing (“Tester Content”) will be treated with a high degree of confidence and confidentiality.",
      "Company agrees that:",
    ],
    bullets: [
      "Tester Content will be used solely for the limited purpose of enabling and evaluating the Beta testing experience.",
      "Tester Content will not be retained permanently on Company’s servers or in its databases.",
      "After the testing period ends (or earlier upon Tester’s request), Company will delete Tester Content from its systems, except for any temporary technical backups that are routinely overwritten or deleted in the ordinary course of system maintenance.",
      "Company will not use, share, publish, or commercially exploit Tester Content for any purpose beyond the Beta testing described in this Agreement.",
    ],
    afterBullets: [
      "Tester remains solely responsible for the content they choose to upload and should avoid uploading highly sensitive or irreplaceable files during testing.",
    ],
  },
  {
    heading: "4. Tester Obligations",
    paragraphs: [
      "Tester agrees to: use the Confidential Information solely for testing the Beta and providing feedback to Company; not disclose, share, publish, or otherwise make available any Confidential Information to any third party; not reverse engineer, decompile, disassemble, or attempt to discover the source code or underlying ideas of the Beta; not use the Beta or Confidential Information to create a competing product or service; not take screenshots, screen recordings, or photographs of the Beta and share them publicly without prior written permission from Company; and keep any login credentials secure and not share access with others.",
    ],
  },
  {
    heading: "5. Ownership and Feedback",
    paragraphs: [
      "Company retains all right, title, and interest in and to the Beta and all Confidential Information. Any feedback, suggestions, ideas, or recommendations that Tester provides regarding the Beta become the exclusive property of Company. Tester hereby assigns all rights in such feedback to Company and agrees that Company may use it without restriction or compensation.",
    ],
  },
  {
    heading: "6. Term",
    paragraphs: [
      "This Agreement begins on the Effective Date and continues for three (3) years after Tester’s access to the Beta ends, or until the Confidential Information becomes publicly available through no fault of Tester, whichever occurs first. The obligations of confidentiality shall survive termination of this Agreement.",
    ],
  },
  {
    heading: "7. No Obligation",
    paragraphs: [
      "Company has no obligation to release the Beta publicly, continue providing access, or implement any feedback. Access to the Beta may be terminated by Company at any time.",
    ],
  },
  {
    heading: "8. No License",
    paragraphs: [
      "Nothing in this Agreement grants Tester any license or rights under any intellectual property of Company, except the limited right to use the Beta for testing purposes as described herein.",
    ],
  },
  {
    heading: "9. Return or Destruction",
    paragraphs: [
      "Upon request by Company or upon termination of access to the Beta, Tester will promptly return or destroy all Confidential Information in Tester’s possession. Company will likewise delete Tester Content as described in Section 3.",
    ],
  },
  {
    heading: "10. Governing Law",
    paragraphs: [
      "This Agreement shall be governed by the laws of the State of Texas, without regard to conflict of law principles.",
    ],
  },
  {
    heading: "11. General",
    paragraphs: [
      "This Agreement constitutes the entire understanding between the parties concerning the subject matter hereof and supersedes all prior agreements. It may only be amended in a writing signed by both parties. If any provision is found unenforceable, the remaining provisions will continue in full force.",
    ],
  },
];

export const BETA_NDA_CLOSING =
  "By checking the box and clicking “I Agree – Continue to Beta,” Tester acknowledges that they have read, understood, and agree to be bound by this Agreement.";
