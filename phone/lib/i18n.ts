export type Locale = 'fr' | 'en';

export type Copy = {
  brandSub: string;
  start: string;
  readyTitle: string;
  readyBody: string;
  home: string;
  history: string;
  reports: string;
  more: string;
  online: string;
  placeholder: string;
  shareCamera: string;
  seeReport: string;
  greet: string;
  sampleUser: string;
  sampleBot: string;
  generic: string;
  measureSaved: string;
  ignored: string;
  listening: string;
  voiceHint: string;
  voiceMissing: string;
  voiceLiveTitle: string;
  voiceLiveBody: string;
  send: string;
  close: string;
  polarity: string;
  junction: string;
  refTension: string;
  approx: string;
  cameraDenied: string;
  allowCamera: string;
  measureTitle: string;
  measureHelp: string;
  valid: string;
  validate: string;
  ignore: string;
  confidenceIndex: string;
  resultTitle: string;
  confirmed: string;
  summary: string;
  actionsTitle: string;
  action1: string;
  action2: string;
  action3: string;
  confidence: string;
  newInquiry: string;
  reportTitle: string;
  details: string;
  dateLabel: string;
  equipmentLabel: string;
  problemLabel: string;
  causeLabel: string;
  solutionLabel: string;
  exportPdf: string;
  share: string;
  pdfReady: string;
  shared: string;
  settings: string;
  techName: string;
  techEmail: string;
  theme: string;
  language: string;
  notifications: string;
  about: string;
  help: string;
  french: string;
  english: string;
  aboutLead: string;
  aboutBody: string;
  helpLead: string;
  help1: string;
  help2: string;
  help3: string;
  helpMail: string;
  scanPc: string;
  scanPcHelp: string;
  sameAsPc: string;
  precisionNote: string;
  codeLabel: string;
  notif1: string;
  notif2: string;
  notifOff: string;
  enable: string;
  open: string;
};

const fr: Copy = {
  brandSub: 'Votre assistant d’enquête technique\nintelligent',
  start: 'Commencer une enquête',
  readyTitle: 'Prêt à diagnostiquer ?',
  readyBody: 'Parlez ou scannez un équipement.',
  home: 'Accueil',
  history: 'Historique',
  reports: 'Rapports',
  more: 'Plus',
  online: 'En ligne',
  placeholder: 'Écrivez un message...',
  shareCamera: 'Partager la caméra',
  seeReport: 'Voir le rapport',
  greet: 'Bonjour.\nDécrivez votre problème ou montrez-moi l’équipement.',
  sampleUser: 'Le panneau solaire ne produit plus assez d’énergie.',
  sampleBot: 'Je vais analyser la situation.\nVeuillez autoriser l’accès à votre caméra.',
  generic: 'Je vous écoute. Dites-moi ce dont vous avez besoin, ou montrez-moi l’équipement.',
  measureSaved: 'Mesure enregistrée : 45,2 V. Le diagnostic est confirmé.',
  ignored: 'Mesure ignorée. Vous pouvez reprendre la caméra ou préciser le problème.',
  listening: 'Discussion orale en direct…',
  voiceHint: 'Parlez naturellement. BINTU vous répond à voix haute, sans écrire dans le champ.',
  voiceMissing: 'La discussion vocale temps réel marche sur Expo Web / Chrome. Sur le PC : http://127.0.0.1:8000/live-test',
  voiceLiveTitle: 'En conversation vocale',
  voiceLiveBody: 'Micro ouvert — BINTU écoute et répond en audio.',
  send: 'Envoyer',
  close: 'Fermer',
  polarity: 'Contrôler la polarité',
  junction: 'Boîte de jonction PV1',
  refTension: 'Tension de référence',
  approx: '≈ 380 V',
  cameraDenied: 'Caméra non autorisée. Le guidage reste affiché.',
  allowCamera: 'Autoriser la caméra',
  measureTitle: 'Mesure requise',
  measureHelp: 'Mesurez la tension en circuit ouvert (Voc) aux bornes de la chaîne.',
  valid: 'Valeur valide !',
  validate: 'Valider',
  ignore: 'Ignorer',
  confidenceIndex: 'Indice de confiance',
  resultTitle: 'Résultat du diagnostic',
  confirmed: 'Diagnostic confirmé !',
  summary: 'Déficit de tension sur la chaîne PV1 suite à une diode ouverte.',
  actionsTitle: 'Actions recommandées',
  action1: 'Vérifier la diode',
  action2: 'Contrôler le câblage MC4',
  action3: 'Mesurer à nouveau',
  confidence: 'Confiance',
  newInquiry: 'Nouvelle enquête',
  reportTitle: 'Rapport d’intervention',
  details: 'Détails de l’enquête',
  dateLabel: 'Date',
  equipmentLabel: 'Équipement',
  problemLabel: 'Problème',
  causeLabel: 'Cause',
  solutionLabel: 'Solution',
  exportPdf: 'Exporter PDF',
  share: 'Partager',
  pdfReady: 'Rapport PDF téléchargé',
  shared: 'Rapport prêt à partager',
  settings: 'Paramètres',
  techName: 'Technicien Pro',
  techEmail: 'technicien@bintu.ai',
  theme: 'Mode Thème',
  language: 'Langue',
  notifications: 'Notifications',
  about: 'À propos de BINTU',
  help: 'Aide & Support',
  french: 'Français',
  english: 'English',
  aboutLead: 'L’IA d’enquête technique et de diagnostic en réalité augmentée.',
  aboutBody: 'Diagnostiquer · Guider · Résoudre',
  helpLead: 'Trois gestes suffisent.',
  help1: 'Décrivez le problème dans le chat, ou utilisez le micro.',
  help2: 'Partagez la caméra pour montrer l’équipement.',
  help3: 'Validez la mesure, puis ouvrez le rapport.',
  helpMail: 'support@bintu.ai',
  scanPc: 'Scanner le PC',
  scanPcHelp: 'Scannez le code du diagnostic affiché sur le PC. Le téléphone voit les mêmes étapes.',
  sameAsPc: 'Même diagnostic que le PC',
  precisionNote: 'Le PC prolonge la précision.',
  codeLabel: 'Code affiché sur le PC',
  notif1: 'Diagnostic confirmé · chaîne PV1',
  notif2: 'Rapport prêt à exporter',
  notifOff: 'Les notifications sont désactivées.',
  enable: 'Activer',
  open: 'Ouvrir',
};

const en: Copy = {
  brandSub: 'Your intelligent technical\ninvestigation assistant',
  start: 'Start an investigation',
  readyTitle: 'Ready to diagnose?',
  readyBody: 'Speak or scan a piece of equipment.',
  home: 'Home',
  history: 'History',
  reports: 'Reports',
  more: 'More',
  online: 'Online',
  placeholder: 'Write a message...',
  shareCamera: 'Share camera',
  seeReport: 'View report',
  greet: 'Hello.\nDescribe the problem or show me the equipment.',
  sampleUser: 'The solar panel is not producing enough energy.',
  sampleBot: 'I will analyse the situation.\nPlease allow access to your camera.',
  generic: 'Noted. Describe the symptom, or show me the equipment with the camera.',
  measureSaved: 'Measurement saved: 45.2 V. The diagnosis is confirmed.',
  ignored: 'Measurement skipped. You can reopen the camera or add more detail.',
  listening: 'Live voice conversation…',
  voiceHint: 'Speak naturally. BINTU answers out loud — nothing is typed into the input.',
  voiceMissing: 'Realtime voice works on Expo Web / Chrome. On PC open http://127.0.0.1:8000/live-test',
  voiceLiveTitle: 'In a voice call',
  voiceLiveBody: 'Mic open — BINTU listens and answers with audio.',
  send: 'Send',
  close: 'Close',
  polarity: 'Check polarity',
  junction: 'PV1 junction box',
  refTension: 'Reference voltage',
  approx: '≈ 380 V',
  cameraDenied: 'Camera not allowed. Guidance stays on screen.',
  allowCamera: 'Allow camera',
  measureTitle: 'Measurement required',
  measureHelp: 'Measure the open-circuit voltage (Voc) at the string terminals.',
  valid: 'Valid value!',
  validate: 'Confirm',
  ignore: 'Skip',
  confidenceIndex: 'Confidence index',
  resultTitle: 'Diagnosis result',
  confirmed: 'Diagnosis confirmed!',
  summary: 'Voltage deficit on PV string 1 caused by an open diode.',
  actionsTitle: 'Recommended actions',
  action1: 'Check the diode',
  action2: 'Inspect the MC4 cabling',
  action3: 'Measure again',
  confidence: 'Confidence',
  newInquiry: 'New investigation',
  reportTitle: 'Intervention report',
  details: 'Investigation details',
  dateLabel: 'Date',
  equipmentLabel: 'Equipment',
  problemLabel: 'Problem',
  causeLabel: 'Cause',
  solutionLabel: 'Solution',
  exportPdf: 'Export PDF',
  share: 'Share',
  pdfReady: 'PDF report downloaded',
  shared: 'Report ready to share',
  settings: 'Settings',
  techName: 'Technician Pro',
  techEmail: 'technicien@bintu.ai',
  theme: 'Theme',
  language: 'Language',
  notifications: 'Notifications',
  about: 'About BINTU',
  help: 'Help & support',
  french: 'Français',
  english: 'English',
  aboutLead: 'AI for technical investigation and augmented-reality diagnosis.',
  aboutBody: 'Diagnose · Guide · Resolve',
  helpLead: 'Three steps are enough.',
  help1: 'Describe the problem in the chat, or use the microphone.',
  help2: 'Share the camera to show the equipment.',
  help3: 'Confirm the measurement, then open the report.',
  helpMail: 'support@bintu.ai',
  scanPc: 'Scan the PC',
  scanPcHelp: 'Scan the diagnosis code shown on the PC. The phone sees the same steps.',
  sameAsPc: 'Same diagnosis as the PC',
  precisionNote: 'The PC extends the precision.',
  codeLabel: 'Code shown on the PC',
  notif1: 'Diagnosis confirmed · PV string 1',
  notif2: 'Report ready to export',
  notifOff: 'Notifications are off.',
  enable: 'Turn on',
  open: 'Open',
};

export const copy: Record<Locale, Copy> = { fr, en };

export type ReportItem = {
  id: string;
  title: string;
  equipment: string;
  date: string;
  problem: string;
  cause: string;
  solution: string;
  confidence: number;
  actions: string[];
};

export function reportsFor(locale: Locale): ReportItem[] {
  const t = copy[locale];
  const frLocale = locale === 'fr';
  return [
    {
      id: 'pv1',
      title: frLocale ? 'Baisse de production' : 'Output drop',
      equipment: frLocale ? 'Panneau PV' : 'PV panel',
      date: '26/10/2026 - 15:20',
      problem: frLocale ? 'Baisse de production' : 'Lower output',
      cause: frLocale ? 'Diode ouverte' : 'Open diode',
      solution: frLocale ? 'Remplacement diode' : 'Diode replacement',
      confidence: 98,
      actions: [t.action1, t.action2, t.action3],
    },
    {
      id: 'arm1',
      title: frLocale ? 'Surchauffe armoire' : 'Cabinet overheating',
      equipment: frLocale ? 'Armoire électrique' : 'Electrical cabinet',
      date: '24/10/2026 - 11:05',
      problem: frLocale ? 'Surchauffe' : 'Overheating',
      cause: frLocale ? 'Ventilation obstruée' : 'Blocked ventilation',
      solution: frLocale ? 'Nettoyer le filtre' : 'Clean the filter',
      confidence: 91,
      actions: frLocale
        ? ['Dégager les ouïes', 'Contrôler le ventilateur', 'Relever la température']
        : ['Clear the vents', 'Check the fan', 'Read the temperature again'],
    },
  ];
}

export type HistoryItem = {
  id: string;
  reportId?: string;
  title: string;
  date: string;
  status: string;
  tone: 'green' | 'blue' | 'orange';
};

export function historyFor(locale: Locale): HistoryItem[] {
  const frLocale = locale === 'fr';
  return [
    {
      id: 'pv1',
      reportId: 'pv1',
      title: frLocale ? 'Baisse de production PV-01' : 'PV-01 output drop',
      date: '26/10/2026 · 15:20',
      status: frLocale ? 'Confirmé' : 'Confirmed',
      tone: 'green',
    },
    {
      id: 'arm1',
      reportId: 'arm1',
      title: frLocale ? 'Surchauffe armoire électrique' : 'Electrical cabinet overheating',
      date: '24/10/2026 · 11:05',
      status: frLocale ? 'Confirmé' : 'Confirmed',
      tone: 'green',
    },
    {
      id: 'cap1',
      title: frLocale ? 'Défaut capteur pression' : 'Pressure sensor fault',
      date: '22/10/2026 · 16:42',
      status: frLocale ? 'En cours' : 'In progress',
      tone: 'orange',
    },
  ];
}
