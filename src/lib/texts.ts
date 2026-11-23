// Catalogue des textes de l'interface (EXPERIENCE.md, « Textes clés de l'interface »).
// Tous les libellés affichés viennent d'ici : aucun texte codé en dur dans les composants.

// Nombre entier groupé par milliers avec une espace insécable (« 2 000 », EXPERIENCE.md, règle 9).
function formatCount(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export const texts = {
  app: {
    name: "NexaMind AI",
    description: "Copilote documentaire de NexaWorks : retrouvez et interrogez les Documents de l'entreprise.",
  },
  shell: {
    skipLink: "Aller au contenu",
    addAction: "+ Ajouter",
    addDocumentLabel: "Ajouter un Document",
    openMenu: "Ouvrir le menu",
    menuTitle: "Navigation",
    navigationLabel: "Navigation principale",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    accountLabel: "Compte connecté",
  },
  nav: {
    dashboard: "Tableau de bord",
    assistant: "Assistant",
    search: "Recherche",
    library: "Bibliothèque",
  },
  titles: {
    dashboard: "Tableau de bord",
    assistantEmpty: "Que voulez-vous savoir ?",
    search: "Recherche",
    library: "Bibliothèque",
    addDocument: "Ajouter un Document",
  },
  common: {
    close: "Fermer",
    requiredLegend: "* Champ obligatoire",
  },
  auth: {
    emailLabel: "Adresse e-mail",
    passwordLabel: "Mot de passe",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
    signInLink: "Se connecter",
  },
  signUp: {
    pageTitle: "Créer votre Compte",
    passwordHelp: "8 caractères minimum",
    submit: "Créer mon Compte",
    submitting: "Création…",
    alreadyHaveAccount: "J'ai déjà un Compte",
    errors: {
      invalidEmail: "Cette adresse e-mail n'est pas valide.",
      passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères.",
      // Textes validés le 2026-11-04 (revue de la story 1.3), absents d'EXPERIENCE.md.
      passwordTooLong: "Le mot de passe doit contenir au plus 72 caractères.",
      passwordRejected: "Ce mot de passe n'est pas accepté. Choisissez-en un autre.",
      emailTaken: "Cette adresse e-mail est déjà utilisée.",
      // Absent d'EXPERIENCE.md : texte validé le 2026-11-04 (story 1.3, option A).
      unexpectedTitle: "Le Compte n'a pas pu être créé.",
      unexpectedText: "Veuillez réessayer dans quelques instants. Votre saisie est conservée.",
    },
    // Compte demandé sans session ouverte (confirmation par e-mail active sur le serveur, contraire
    // au MVP). Texte ajouté le 2026-11-04 ; neutre, car Supabase répond de même si l'e-mail existe.
    confirmationRequired: {
      title: "Votre Compte n'a pas pu être ouvert directement.",
      text: "Une confirmation par e-mail est demandée. Si vous recevez un e-mail de NexaMind AI, suivez le lien qu'il contient, puis connectez-vous.",
    },
  },
  signIn: {
    pageTitle: "Connexion",
    submit: "Se connecter",
    submitting: "Connexion…",
    createAccount: "Créer un compte",
    signedOut: "Vous êtes déconnecté.",
    retry: "Réessayer",
    errors: {
      invalidCredentials: "E-mail ou mot de passe incorrect.",
      // Absent d'EXPERIENCE.md : texte validé le 2026-11-05 (story 1.4, option A).
      unexpected: "La connexion n'a pas abouti. Veuillez réessayer dans quelques instants.",
      networkLost: "Connexion perdue. Vérifiez votre réseau, puis réessayez.",
    },
  },
  session: {
    expired: "Votre session a expiré. Reconnectez-vous pour continuer.",
  },
  addDocument: {
    noteTab: "Note",
    // Onglet Fichier (story 2.6a, EXPERIENCE.md, E8).
    fileTab: "Fichier",
    chooseFile: "Choisir un fichier",
    formats: "Formats acceptés : .txt et .md, 100 Ko au maximum.",
    uploading: "Dépôt du fichier…",
    // Absents d'EXPERIENCE.md : nom de la zone et état « déposé », ajoutés le 2026-11-12 (story 2.6a).
    fileLabel: "Fichier",
    uploaded: (name: string) => `Fichier déposé : ${name}`,
    importSubmit: "Importer",
    importing: "Import…",
    titleLabel: "Titre",
    categoryLabel: "Catégorie",
    categoryPlaceholder: "Choisir une Catégorie",
    textLabel: "Texte",
    submit: "Enregistrer",
    submitting: "Enregistrement…",
    cancel: "Annuler",
    retry: "Réessayer",
    errors: {
      titleMissing: "Indiquez un titre.",
      // Le catalogue ne fixe que 200 caractères au plus (§6) : texte ajouté le 2026-11-05.
      titleTooLong: "Le titre doit contenir au plus 200 caractères.",
      categoryMissing: "Choisissez une Catégorie.",
      textMissing: "Le texte ne peut pas être vide.",
      // Absent d'EXPERIENCE.md pour une Note : texte validé le 2026-11-05 (story 2.2, option A).
      textTooLarge: "Le texte dépasse 100 Ko, la taille maximale.",
      saveFailed: "Le Document n'a pas pu être enregistré. Votre saisie est conservée.",
      fileMissing: "Choisissez un fichier.",
      fileFormat: "Ce format n'est pas pris en charge. Formats acceptés : .txt et .md.",
      // 100 Ko = 100 000 octets, valeur identique à celle des contrôles (story 2.7).
      fileTooLarge: "Ce fichier dépasse 100 Ko, la taille maximale.",
      uploadFailed: "Le fichier n'a pas pu être déposé.",
    },
    abandon: {
      title: "Abandonner ce Document ?",
      text: "Votre saisie sera perdue.",
      keep: "Continuer la saisie",
      confirm: "Abandonner",
    },
  },
  document: {
    categoryLabel: "Catégorie",
    authorLabel: "Auteur",
    addedOnLabel: "Ajouté le",
    statusLabel: "Statut de traitement",
    textLabel: "Texte du Document",
    actionsLabel: "Actions du Document",
    loadingSlow: "Le chargement prend plus de temps que prévu.",
    loadingRetry: "Réessayer",
  },
  reader: {
    activePassageLabel: "Passage utilisé",
    passagePosition: (position: number, total: number) => `Passage utilisé ${position} sur ${total}`,
    // Arrivée depuis un résultat de Recherche (story 4.1b, EXPERIENCE.md, « Résultat de Recherche »).
    relevantPassageLabel: "Passage pertinent",
    relevantPassagePosition: (position: number, total: number) => `Passage pertinent ${position} sur ${total}`,
    allPassagesMissing: "Le Passage cité n'a pas pu être retrouvé dans ce Document. Le Document est affiché en entier.",
    somePassagesMissing: "Un des Passages cités n'a pas pu être retrouvé dans ce Document.",
  },
  documentStatus: {
    ready: "Votre Document est prêt.",
    // Absent d'EXPERIENCE.md : variante pour un autre Collaborateur, ajoutée le 2026-11-06 (story 2.4).
    readyOther: "Ce Document est prêt.",
    processingTitle: "En cours de traitement",
    processingText: "Le Document sera interrogeable dans quelques instants.",
    processingLong: "Le traitement prend plus de temps que prévu. Vous pouvez quitter cette page sans l'interrompre.",
    // Même texte que la raison enregistrée en base (AD-5).
    temporaryAuthor: "Le traitement n'a pas pu aboutir. Vous pouvez le relancer.",
    temporaryOther: "Le traitement n'a pas pu aboutir. Seul l'Auteur de ce Document peut relancer le traitement.",
    // Repli : la raison d'un no_text est lue en base. Les trois raisons possibles, écrites par
    // process-document (textes identiques, vérifiés par un test) :
    noText: "Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé.",
    // EXPERIENCE.md, « Encodage illisible » (story 2.6b).
    noTextEncoding: "Le texte de ce fichier n'a pas pu être lu (encodage non pris en charge).",
    // Décision du 2026-11-12 (story 2.6b, Q1 = A).
    noTextTooLarge: "Une fois converti, le texte de ce fichier dépasse 100 Ko, la taille maximale. Il ne peut pas être interrogé.",
    retry: "Relancer le traitement",
    retrying: "Relance…",
    // Absents d'EXPERIENCE.md pour la relance : textes validés le 2026-11-09 (story 2.5, Q2 = A).
    retryFailed: "La relance n'a pas abouti. Veuillez réessayer.",
    forbidden: "Cette action n'est pas autorisée.",
    statusUnavailable: "Le Statut n'a pas pu être actualisé.",
    refresh: "Actualiser",
    // EXPERIENCE.md, « Document supprimé pendant la consultation » (story 3.4).
    deleted: "Ce Document a été supprimé.",
    backToLibrary: "Retour à la Bibliothèque",
  },
  // Suppression d'un Document (story 3.4, EXPERIENCE.md, « Supprimer un Document »).
  deleteDocument: {
    action: "Supprimer",
    deleting: "Suppression…",
    title: (title: string) => `Supprimer « ${title} » ?`,
    text: "Ce Document disparaîtra de la Bibliothèque, de la Recherche et des réponses futures de l'Assistant. Cette action est définitive.",
    cancel: "Annuler",
    confirm: "Supprimer",
    done: "Document supprimé.",
    forbidden: "Cette action n'est pas autorisée.",
    // Absent d'EXPERIENCE.md : sur le modèle de la relance (story 2.5), ajouté le 2026-11-13.
    failed: "La suppression n'a pas abouti. Veuillez réessayer.",
  },
  library: {
    categoryLabel: "Catégorie",
    allCategories: "Toutes les Catégories",
    mine: "Mes Documents",
    searchLabel: "Rechercher un titre",
    sortLabel: "Trier par",
    sortRecent: "Plus récents d'abord",
    sortOldest: "Plus anciens d'abord",
    filtersLabel: "Filtres de la Bibliothèque",
    resetFilters: "Réinitialiser les filtres",
    addDocument: "Ajouter un Document",
    emptyBase: "La Base commune est encore vide.",
    emptyMine: "Vous n'avez encore ajouté aucun Document.",
    noResults: "Aucun Document ne correspond à ces filtres.",
    loadFailed: "Cette liste n'a pas pu être chargée.",
    retry: "Réessayer",
    // Décisions du 2026-11-10 (story 3.3) : Q1 (nombre), Q2 (plafond de 200 lignes), Q4 (annonce).
    count: (total: number) => (total === 0 ? "Aucun Document" : total === 1 ? "1 Document" : `${total} Documents`),
    truncated: (shown: number) => `Seuls les ${shown} premiers Documents sont affichés. Affinez les filtres.`,
    statusChanged: (title: string, status: string) => `« ${title} » : ${status}.`,
    columns: {
      title: "Titre",
      category: "Catégorie",
      author: "Auteur",
      addedOn: "Date d'ajout",
      status: "Statut",
    },
  },
  search: {
    // EXPERIENCE.md, « Panne de la Recherche ». Repris pour une Requête invalide : aucun texte propre
    // au catalogue, et le champ de la page Recherche (4.1b) empêche déjà une Requête vide.
    failed: "La Recherche n'a pas pu aboutir.",
    // Page Recherche (story 4.1b, EXPERIENCE.md, E5).
    help: "Décrivez ce que vous cherchez avec vos propres mots.",
    fieldLabel: "Votre recherche",
    submit: "Rechercher",
    retry: "Réessayer",
    examplesLabel: "Exemples de Requêtes",
    // Requêtes du mini Jeu de démonstration (décision du 2026-11-12).
    examples: ["organisation des congés", "remboursement des notes de frais", "revue après un incident critique"],
    // Noms accessibles des listes (absents d'EXPERIENCE.md, ajoutés le 2026-11-12, story 4.1b).
    resultsLabel: "Résultats de la Recherche",
    count: (total: number) => (total === 1 ? "1 Document pertinent" : `${total} Documents pertinents`),
    // Phrase complète de FR-15, rétablie avec le bouton vers l'Assistant (story 5.2b).
    noResults:
      "Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots ou posez la question à l'Assistant.",
    askAssistant: "Poser la question à l'Assistant",
  },
  // Assistant (story 5.2a-2, EXPERIENCE.md, « Textes clés de l'interface »).
  assistant: {
    // « Information absente » : texte enregistré par chat (supabase/functions/chat, test d'égalité).
    refusalInfoAbsente:
      "Je n'ai pas trouvé cette information dans la Base commune de NexaWorks. Je préfère ne pas répondre plutôt que d'inventer.",
    // « Hors cadre » (story 5.3) : texte enregistré par chat (test d'égalité).
    refusalHorsCadre: "Je réponds uniquement à partir des Documents de NexaWorks.",
    // Suites du bloc de refus (UX-DR11, EXPERIENCE.md, « Bloc de refus ») ; hors cadre : « Reformuler » seul.
    reformulate: "Reformuler la question",
    searchDocuments: "Rechercher dans les Documents",
    addDocument: "Ajouter un Document",
    failedTitle: "La réponse n'a pas pu être générée.",
    failed: "Le service d'IA ne répond pas pour le moment. Votre question est conservée.",
    unverifiable: "Je n'ai pas pu vérifier cette réponse à partir des Documents. Veuillez réessayer.",
    budgetExhausted: "Le service d'IA est momentanément indisponible. Réessayez plus tard.",
    questionTooLong: "Votre question dépasse 2 000 caractères. Raccourcissez-la pour l'envoyer.",
    quotaExceeded: (moment: string) =>
      `Vous avez atteint votre limite quotidienne de questions et de Résumés. Elle sera rétablie ${moment}. La Recherche reste disponible.`,
    // Bloc de limite atteinte (story 5.10, EXPERIENCE.md, « Quota atteint : Assistant ») : raison reliée
    // au champ et à « Envoyer » par aria-describedby, lien vers la Recherche.
    quotaReason: "Limite quotidienne atteinte",
    openSearch: "Ouvrir la Recherche",
    // Plafond global du projet : texte validé le 2026-11-16 (story 5.2a-2), ajouté à EXPERIENCE.md.
    dailyCapReached: (moment: string) =>
      `L'Assistant a atteint sa limite d'utilisation pour aujourd'hui. Il sera de nouveau disponible ${moment}. La Recherche reste disponible.`,
    // Rejeu d'une question déjà reçue (story 5.2a-2 ; rejeu complet en 5.9), ajouté à EXPERIENCE.md en 5.2b.
    inProgress: "Cette question est déjà en cours de traitement.",
    // Saisie invalide (story 5.2b, report g de la 5.2a-2), ajoutés à EXPERIENCE.md.
    questionEmpty: "Écrivez votre question avant de l'envoyer.",
    invalidRequest: "Votre question n'a pas pu être envoyée. Vérifiez-la puis réessayez.",
    // Page Assistant (story 5.2b, EXPERIENCE.md, E4).
    intro: "L'Assistant répond uniquement à partir des Documents de NexaWorks et cite ses Sources.",
    fieldLabel: "Votre question",
    placeholder: "Posez une question sur les Documents de NexaWorks…",
    keyboardHelp: "Entrée pour envoyer · Maj + Entrée pour aller à la ligne",
    submit: "Envoyer",
    counter: (length: number, max: number) => `${formatCount(length)} / ${formatCount(max)}`,
    pending: "Recherche dans les Documents…",
    retry: "Réessayer",
    // Noms accessibles du fil (EXPERIENCE.md, Accessibilité : chaque message précédé de « Vous » ou « Assistant »).
    threadLabel: "Conversation",
    you: "Vous",
    assistantLabel: "Assistant",
    sourcesLabel: "Sources",
    passagesCount: (count: number) => `${count} Passages`,
    sourceDeleted: (title: string) => `${title} — Document supprimé`,
    // Renvoi ¹ ² (story 5.4, EXPERIENCE.md) : numéro précédé de ce texte masqué (lu « Source 1 »).
    citationPrefix: "Source",
    // Nom accessible de la puce de Source (EXPERIENCE.md) : « Source {n} : {titre}, {k} Passages »,
    // sans les points médians affichés ; « , {k} Passages » seulement si plusieurs Passages.
    sourceName: (ordinal: number, label: string, passages: number) =>
      `Source ${ordinal} : ${label}${passages > 1 ? `, ${passages} Passages` : ""}`,
    // Entrées vers l'Assistant : Tableau de bord et page Document (Document prêt).
    askQuestion: "Poser une question",
    // Texte provisoire en cours d'écriture (story 5.5), hors de la région d'annonce : nom accessible.
    provisionalLabel: "Réponse en cours d'écriture",
    // Instrument de mesure du flux (story 5.5, ?mesure=1 seulement, jamais lié depuis la navigation).
    measureTitle: "Mesure du flux",
    measureHelp: "Posez les questions du mini Jeu une à une, puis copiez le résultat.",
    measureCount: (count: number) => `${count} question${count > 1 ? "s" : ""} mesurée${count > 1 ? "s" : ""}`,
    measureCopy: "Copier le résultat",
    measureCopied: "Résultat copié.",
    measureCopyFailed: "Copie impossible : sélectionnez le résultat ci-dessous.",
  },
  // Résumé d'un Document (story 6.1, EXPERIENCE.md, E7 et « Textes clés de l'interface »).
  summary: {
    // Titre du bloc Résumé (terme du Glossaire).
    title: "Résumé",
    generate: "Générer le Résumé",
    generating: "Génération du Résumé…",
    // Annonce aux lecteurs d'écran (région status).
    generated: "Résumé généré.",
    mention: (date: string) => `Résumé généré par l'IA à partir de ce Document · ${date}`,
    // Document pas encore prêt (bloc Résumé) ; même texte renvoyé par summarize (DOCUMENT_NOT_READY).
    notReady: "Le Résumé sera disponible quand le Document sera prêt.",
    // Panne du Résumé ; même texte renvoyé par summarize (test d'égalité).
    failed: "Le Résumé n'a pas pu être généré.",
    retry: "Réessayer",
    // Verrou de demande par Document déjà pris (correctif de revue R1 = A, 2026-11-23) : alerte avec
    // « Réessayer » ; même texte renvoyé par summarize (REQUEST_IN_PROGRESS, test d'égalité).
    inProgress: "Un Résumé de ce Document est déjà en cours de génération. Réessayez dans un instant.",
    // « Quota atteint : Résumé » (EXPERIENCE.md) : bloc neutre, bouton en aria-disabled.
    quotaExceeded: (moment: string) =>
      `Vous avez atteint votre limite quotidienne de questions et de Résumés. Elle sera rétablie ${moment}.`,
    quotaReason: "Limite quotidienne atteinte",
    // Plafond global du projet atteint pendant une demande de Résumé : texte validé par l'utilisateur
    // après revue (2026-11-23, story 6.1), ajouté à EXPERIENCE.md.
    dailyCapReached: (moment: string) =>
      `Le service d'IA a atteint sa limite d'utilisation pour aujourd'hui. Il sera de nouveau disponible ${moment}.`,
  },
  // Conversations et Historique (story 5.6, EXPERIENCE.md, E3, E4 et E4b).
  history: {
    // En-tête de l'Assistant.
    open: "Historique",
    newConversation: "+ Nouvelle Conversation",
    // Panneau Historique (E4b) : titre du panneau et nom accessible de la liste.
    title: "Historique",
    empty: "Aucune Conversation pour le moment.",
    firstQuestion: "Poser une première question",
    loadFailed: "L'Historique n'a pas pu être chargé.",
    retry: "Réessayer",
    seeAll: "Voir tout l'Historique",
    // Dernier échange sans réponse (échec, ou question restée sans réponse), décision Q2 = A du 2026-11-18.
    unanswered: "Sans réponse",
    // Tableau de bord et état vide de l'Assistant : 5 dernières Conversations.
    recentTitle: "Mes dernières Conversations",
    noQuestionYet: "Vous n'avez pas encore posé de question.",
    // Nom accessible des exemples (absent d'EXPERIENCE.md, ajouté le 2026-11-18, story 5.6).
    examplesLabel: "Exemples de questions",
    // Questions du mini Jeu de démonstration : préremplissent le champ (?question=), jamais envoyées d'office.
    examples: ["Comment poser mes congés ?", "Comment relancer un client qui n'a pas payé ?"],
  },
  // Panneau Source (story 5.7, EXPERIENCE.md, E4a et « Textes clés de l'interface »).
  sourcePanel: {
    openFullPage: "Ouvrir la page complète",
    close: "Fermer",
    back: "← Retour à la Conversation",
    // « Passage {i} sur {k} », « Précédent » / « Suivant » (plusieurs Passages).
    position: (index: number, total: number) => `Passage ${index} sur ${total}`,
    previous: "Précédent",
    next: "Suivant",
    // Nom accessible du groupe de navigation (absent d'EXPERIENCE.md, ajouté le 2026-11-19, story 5.7).
    navigationLabel: "Passages utilisés",
    // EXPERIENCE.md, « Document supprimé pendant la consultation » : sans « Réessayer ».
    deleted: "Ce Document a été supprimé.",
    // Lecture en panne (absent d'EXPERIENCE.md, ajouté le 2026-11-19, story 5.7) : avec « Réessayer ».
    loadFailed: "Ce Document n'a pas pu être chargé.",
    retry: "Réessayer",
    // Nom accessible du Lecteur dans le panneau.
    textLabel: "Texte du Document",
  },
  dashboard: {
    recentDocuments: "Derniers Documents",
    seeLibrary: "Voir la Bibliothèque",
    // Champ de Recherche (story 4.1b) : libellé masqué et texte indicatif (EXPERIENCE.md, E3).
    searchLabel: "Rechercher dans les Documents",
    searchPlaceholder: "Rechercher dans les Documents…",
    searchSubmit: "Rechercher",
  },
  categories: {
    procedure: "Procédure",
    faq: "FAQ",
    meeting_note: "Note de réunion",
    project_sheet: "Fiche projet",
    client_report: "Compte rendu client",
    business_resource: "Ressource métier",
    other: "Autre",
  },
  status: {
    ready: "prêt",
    processing: "en cours de traitement",
    error: "en erreur",
  },
  notFound: {
    title: "Page introuvable",
    text: "Cette page n'existe pas ou ne vous est pas accessible.",
    backToDashboard: "Retour au Tableau de bord",
    openAssistant: "Ouvrir l'Assistant",
  },
} as const;
