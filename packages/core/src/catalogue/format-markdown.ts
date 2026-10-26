import { parse as parserYaml } from "yaml";
import { z } from "zod";
import {
  CONFIANCES,
  ORIGINES,
  STATUTS,
  TYPES_MEDIA,
  VALIDITES,
  type EtatDiffusion,
  type TypeMedia,
  type Validite,
} from "../diffusion";

export const CORPUS = ["aec_2027", "aec_2022", "nfp_2024", "autre"] as const;
export const LONGUEUR_MAX_RESUME = 1500;

const schemaEnTete = z.object({
  id: z.string().min(1),
  titre: z.string().min(1),
  url: z.string().min(1),
  origine: z.enum(ORIGINES),
  statut: z.enum(STATUTS),
  source: z.object({
    nom: z.string().min(1),
    confiance: z.enum(CONFIANCES),
  }),
  type_media: z.enum(TYPES_MEDIA),
  date_publication: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format attendu : AAAA-MM-JJ").optional(),
  corpus: z.enum(CORPUS),
  validite: z.enum(VALIDITES),
  themes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  verrouilles: z.array(z.string()).default([]),
});

export interface DocumentCorpus extends EtatDiffusion {
  id: string;
  titre: string;
  url: string;
  nomSource: string;
  typeMedia: TypeMedia;
  datePublication?: string;
  corpus: (typeof CORPUS)[number];
  validite: Validite;
  themes: string[];
  tags: string[];
  resume?: string;
  /** Champs relus par un humain : une ré-qualification par l'IA ne doit pas les modifier. */
  verrouilles: string[];
}

const EN_TETE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export function lireDocumentMarkdown(contenu: string): DocumentCorpus {
  const morceaux = EN_TETE.exec(contenu);
  if (!morceaux) throw new Error("en-tête YAML manquant (le fichier doit commencer par ---)");

  const resultat = schemaEnTete.safeParse(parserYaml(morceaux[1] ?? ""));
  if (!resultat.success) throw new Error(`en-tête invalide :\n${z.prettifyError(resultat.error)}`);
  const e = resultat.data;

  const resume = (morceaux[2] ?? "").trim();
  if (resume.length > LONGUEUR_MAX_RESUME) {
    throw new Error(
      `le corps du fichier doit être un résumé de quelques lignes (${LONGUEUR_MAX_RESUME} caractères au plus), pas le contenu du document`,
    );
  }

  return {
    id: e.id,
    titre: e.titre,
    url: e.url,
    origine: e.origine,
    statut: e.statut,
    confianceSource: e.source.confiance,
    nomSource: e.source.nom,
    typeMedia: e.type_media,
    datePublication: e.date_publication,
    corpus: e.corpus,
    validite: e.validite,
    themes: e.themes,
    tags: e.tags,
    resume: resume || undefined,
    verrouilles: e.verrouilles,
  };
}
