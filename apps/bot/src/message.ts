import { apercu, type Candidat, type ResultatRecherche } from "@aecbot/core";

export const AVERTISSEMENT =
  "AECBot est une initiative personnelle, non officielle, non endossée par La France insoumise.";

export const MESSAGE_ACCUEIL = [
  "<b>Bienvenue sur AECBot.</b>",
  "Ce bot envoie les documents du programme « L'Avenir en commun » qui répondent à une question. " +
    "Il suffit de l'écrire ici, par exemple : <i>Que propose le programme sur le logement ?</i>",
  "AECBot ne conserve pas les questions.",
  `<i>${AVERTISSEMENT}</i>`,
].join("\n\n");

export const MESSAGE_AUCUN_DOCUMENT =
  "Aucun document du programme ne répond à cette question. Reformuler avec d'autres mots peut aider.";
export const MESSAGE_LIMITE = "Beaucoup de questions en peu de temps : merci de réessayer dans un moment.";
export const MESSAGE_ERREUR = "Un problème technique empêche de répondre pour le moment. Merci de réessayer plus tard.";
export const MESSAGE_TEXTE_SEULEMENT = "Pour l'instant, AECBot ne comprend que les questions écrites.";

/** Au-delà, les documents choisis sont donnés en liens, pour ne pas inonder la conversation. */
export const NB_MAX_FICHIERS = 3;

// Les légendes de fichiers sont limitées à 1 024 caractères affichés, les messages à 4 096.
const LONGUEUR_MAX_TITRE = 150;
const LONGUEUR_MAX_RESUME_LEGENDE = 300;
const LONGUEUR_MAX_SOURCE = 100;

export function echapperHtml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tronquer(texte: string, maximum: number): string {
  return texte.length <= maximum ? texte : `${texte.slice(0, maximum).trimEnd()}…`;
}

const estUrl = (url: string) => /^https?:\/\//.test(url);

/** Telegram peut récupérer lui-même un PDF publié en ligne (20 Mo au plus). */
export function estEnvoyableEnFichier(doc: Candidat): boolean {
  return doc.typeMedia === "pdf" && estUrl(doc.url);
}

export function planifierReponse({ documents }: ResultatRecherche): { fichiers: Candidat[]; liens: Candidat[] } {
  const fichiers = documents.filter(estEnvoyableEnFichier).slice(0, NB_MAX_FICHIERS);
  return { fichiers, liens: documents.filter((d) => !fichiers.includes(d)) };
}

/** Légende HTML d'un fichier envoyé : titre, puis résumé s'il est affichable (règle `apercu`). */
export function legende(doc: Candidat): string {
  const titre = `<b>${echapperHtml(tronquer(doc.titre, LONGUEUR_MAX_TITRE))}</b>`;
  const resume = apercu(doc);
  return resume ? `${titre}\n${echapperHtml(tronquer(resume, LONGUEUR_MAX_RESUME_LEGENDE))}` : titre;
}

function ligneDeLien(doc: Candidat): string {
  const titre = echapperHtml(tronquer(doc.titre, LONGUEUR_MAX_TITRE));
  return estUrl(doc.url)
    ? `• <a href="${echapperHtml(doc.url)}">${titre}</a>`
    : `• ${titre} (source : ${echapperHtml(tronquer(doc.url, LONGUEUR_MAX_SOURCE))})`;
}

/** Message HTML qui suit les fichiers : documents à ouvrir en lien, puis l'avertissement. */
export function texteFinal(liens: Candidat[], aucunDocument: boolean): string {
  const corps = aucunDocument
    ? [MESSAGE_AUCUN_DOCUMENT]
    : liens.length > 0
      ? [["Autres documents utiles :", ...liens.map(ligneDeLien)].join("\n")]
      : [];
  return [...corps, `<i>${AVERTISSEMENT}</i>`].join("\n\n");
}
