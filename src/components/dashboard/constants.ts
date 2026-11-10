// Constantes du Tableau de bord, hors des modules « use client » : un export d'un tel module devient
// une référence client dans un composant serveur, jamais la valeur elle-même.
export const RECENT_DOCUMENTS_LIMIT = 5;
export const RECENT_DOCUMENTS_HEADING_ID = "derniers-documents";
