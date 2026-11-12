// Catalogue des textes de l'interface (EXPERIENCE.md, « Textes clés de l'interface »).
// Tous les libellés affichés viennent d'ici : aucun texte codé en dur dans les composants.
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
    formats: "Formats acceptés : .txt et .md, 1 Mo au maximum.",
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
      textTooLarge: "Le texte dépasse 1 Mo, la taille maximale.",
      saveFailed: "Le Document n'a pas pu être enregistré. Votre saisie est conservée.",
      fileMissing: "Choisissez un fichier.",
      fileFormat: "Ce format n'est pas pris en charge. Formats acceptés : .txt et .md.",
      // 1 Mo = 1 000 000 octets, valeur identique à celle des contrôles.
      fileTooLarge: "Ce fichier dépasse 1 Mo, la taille maximale.",
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
    // Repli : la raison d'un no_text est lue en base (la story 2.6b ajoute un message d'encodage).
    noText: "Ce fichier ne contient aucun texte exploitable. Il ne peut pas être interrogé.",
    retry: "Relancer le traitement",
    retrying: "Relance…",
    // Absents d'EXPERIENCE.md pour la relance : textes validés le 2026-11-09 (story 2.5, Q2 = A).
    retryFailed: "La relance n'a pas abouti. Veuillez réessayer.",
    forbidden: "Cette action n'est pas autorisée.",
    statusUnavailable: "Le Statut n'a pas pu être actualisé.",
    refresh: "Actualiser",
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
    // Décision du 2026-11-12 (Q1 = B) : la fin de phrase « ou posez la question à l'Assistant » et le
    // bouton « Poser la question à l'Assistant » sont rétablis ensemble par la story 5.2b.
    noResults: "Aucun Document ne correspond suffisamment à votre recherche. Essayez d'autres mots.",
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
