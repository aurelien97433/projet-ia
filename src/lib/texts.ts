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
    signedOut: "Non connecté",
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
} as const;
