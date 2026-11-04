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
  },
} as const;
