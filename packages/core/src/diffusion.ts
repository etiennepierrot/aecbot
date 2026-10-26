export const ORIGINES = ["wp", "push", "genere"] as const;
export const STATUTS = ["recu", "qualifie_ia", "qualifie", "brouillon", "valide", "rejete"] as const;
export const CONFIANCES = ["officielle", "verifiee", "non_verifiee"] as const;
export const VALIDITES = ["en_vigueur", "remplace", "archive"] as const;
export const TYPES_MEDIA = ["pdf", "page", "texte", "image"] as const;

export type Origine = (typeof ORIGINES)[number];
export type Statut = (typeof STATUTS)[number];
export type Confiance = (typeof CONFIANCES)[number];
export type Validite = (typeof VALIDITES)[number];
export type TypeMedia = (typeof TYPES_MEDIA)[number];

export interface EtatDiffusion {
  origine: Origine;
  statut: Statut;
  confianceSource: Confiance;
}

export function estRenvoyable(doc: EtatDiffusion): boolean {
  if (doc.origine === "genere") return doc.statut === "valide";
  if (doc.statut === "qualifie") return true;
  return doc.statut === "qualifie_ia" && doc.confianceSource === "officielle";
}

export interface Resume {
  texte: string;
  valideParHumain: boolean;
}

/**
 * Résumé que le bot peut afficher. Un document écrit par des humains peut montrer le résumé proposé
 * par l'IA ; pour un document généré, le résumé doit avoir été relu.
 */
export function apercu(doc: { origine: Origine; resume?: Resume }): string | undefined {
  if (!doc.resume) return undefined;
  return doc.origine !== "genere" || doc.resume.valideParHumain ? doc.resume.texte : undefined;
}
