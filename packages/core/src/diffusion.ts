export type Origine = "wp" | "push" | "genere";
export type Statut = "recu" | "qualifie_ia" | "qualifie" | "brouillon" | "valide" | "rejete";
export type Confiance = "officielle" | "verifiee" | "non_verifiee";
export type Validite = "en_vigueur" | "remplace" | "archive";

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

export function apercu(doc: { resume?: Resume; extrait: string }): string {
  return doc.resume?.valideParHumain ? doc.resume.texte : doc.extrait;
}
