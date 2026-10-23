import { z } from "zod";
import { estRenvoyable, type EtatDiffusion, type Resume, type Validite } from "../diffusion";
import { sansAccents } from "../texte";
import type { ModeleIA } from "./modele-ia";
import {
  INSTRUCTIONS_CLASSER,
  INSTRUCTIONS_COMPRENDRE,
  entreeClasser,
  entreeComprendre,
} from "./prompts";

export interface Candidat extends EtatDiffusion {
  id: string;
  titre: string;
  url: string;
  validite: Validite;
  themes: string[];
  resume?: Resume;
}

export interface CriteresRecherche {
  motsCles: string[];
  themes: string[];
  limite: number;
}

export interface Catalogue {
  /** Candidats classés du plus au moins pertinent. */
  rechercher(criteres: CriteresRecherche): Promise<Candidat[]>;
}

export interface DependancesRecherche {
  ia: ModeleIA;
  catalogue: Catalogue;
  themes: readonly string[];
}

export interface ResultatRecherche {
  documents: Candidat[];
  mode: "ia" | "repli";
}

export const NB_CANDIDATS = 25;
export const NB_MAX_RESULTATS = 5;
export const LONGUEUR_MAX_QUESTION = 500;
const LONGUEUR_MAX_RESUME_IA = 600;

const schemaComprehension = z.object({
  themes: z.array(z.string()).max(3),
  motsCles: z.array(z.string().min(1)).min(1).max(8),
});

const schemaClassement = z.object({
  ids: z.array(z.string()).max(10),
});

export async function choisirDocuments(
  question: string,
  deps: DependancesRecherche,
): Promise<ResultatRecherche> {
  const q = question.trim().slice(0, LONGUEUR_MAX_QUESTION);
  if (!q) return { documents: [], mode: "ia" };

  let mode: ResultatRecherche["mode"] = "ia";
  let criteres: Omit<CriteresRecherche, "limite">;
  try {
    criteres = await comprendre(q, deps);
  } catch {
    mode = "repli";
    criteres = { motsCles: motsDeLaQuestion(q), themes: [] };
  }

  const candidats = (await deps.catalogue.rechercher({ ...criteres, limite: NB_CANDIDATS })).filter(
    (c) => estRenvoyable(c) && c.validite === "en_vigueur",
  );
  if (candidats.length === 0) return { documents: [], mode };

  try {
    const ids = await classer(q, candidats, deps.ia);
    return { documents: retenir(ids, candidats), mode };
  } catch {
    return { documents: candidats.slice(0, NB_MAX_RESULTATS), mode: "repli" };
  }
}

async function comprendre(question: string, deps: DependancesRecherche) {
  const brut = await deps.ia.genererObjet({
    instructions: INSTRUCTIONS_COMPRENDRE,
    entree: entreeComprendre(question, deps.themes),
    schema: schemaComprehension,
  });
  const { themes, motsCles } = schemaComprehension.parse(brut);
  return { themes: themes.filter((t) => deps.themes.includes(t)), motsCles };
}

async function classer(question: string, candidats: Candidat[], ia: ModeleIA): Promise<string[]> {
  const brut = await ia.genererObjet({
    instructions: INSTRUCTIONS_CLASSER,
    entree: entreeClasser(
      question,
      candidats.map((c) => ({
        id: c.id,
        titre: c.titre,
        themes: c.themes,
        // Le résumé non validé sert à choisir, jamais à être affiché au militant.
        resume: (c.resume?.texte ?? "").slice(0, LONGUEUR_MAX_RESUME_IA),
      })),
    ),
    schema: schemaClassement,
  });
  return schemaClassement.parse(brut).ids;
}

function retenir(ids: string[], candidats: Candidat[]): Candidat[] {
  const parId = new Map(candidats.map((c) => [c.id, c]));
  const retenus = new Set<Candidat>();
  for (const id of ids) {
    const candidat = parId.get(id);
    if (candidat) retenus.add(candidat);
    if (retenus.size === NB_MAX_RESULTATS) break;
  }
  return [...retenus];
}

const MOTS_VIDES = new Set([
  "les", "des", "une", "est", "que", "qui", "quoi", "quel", "quelle", "quels", "quelles",
  "pour", "dans", "sur", "avec", "par", "pas", "plus", "son", "ses", "aux", "mais", "comme",
  "cette", "ces", "comment", "pourquoi", "elle", "ils", "nous", "vous", "leur", "leurs",
  "propose", "proposez", "prevoit", "faire", "fait", "dit", "veut",
]);

export function motsDeLaQuestion(question: string): string[] {
  const mots = sansAccents(question)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
  return [...new Set(mots)].slice(0, 8);
}
