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
  },
  documentStatus: {
    processingTitle: "En cours de traitement",
    processingText: "Le Document sera interrogeable dans quelques instants.",
    // Provisoire jusqu'à la story 2.5 : la relance n'existe pas encore (décision du 2026-11-06).
    temporaryAuthor: "Le traitement n'a pas pu aboutir. La relance sera bientôt disponible.",
    // Raison enregistrée en base (AD-5), non affichée avant la story 2.5.
    temporaryReason: "Le traitement n'a pas pu aboutir. Vous pouvez le relancer.",
    temporaryOther: "Le traitement n'a pas pu aboutir. Seul l'Auteur de ce Document peut relancer le traitement.",
    retry: "Relancer le traitement",
    statusUnavailable: "Le Statut n'a pas pu être actualisé.",
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
