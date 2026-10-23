import { z } from "zod";
import { estRenvoyable, type EtatDiffusion, type Resume, type Validite } from "../diffusion";
import { sansAccents } from "../texte";
import type { ModeleIA } from "./modele-ia";
import { INSTRUCTIONS_CHOISIR, contexteCatalogue, entreeQuestion } from "./prompts";

export interface Candidat extends EtatDiffusion {
  id: string;
  titre: string;
  url: string;
  validite: Validite;
  themes: string[];
  tags: string[];
  resume?: Resume;
}

export interface CriteresRecherche {
  motsCles: string[];
  themes: string[];
  limite: number;
}

export interface Catalogue {
  /** Tous les documents diffusables, toujours dans le même ordre (le catalogue sert de préfixe mis en cache). */
  lister(): Promise<Candidat[]>;
  /** Recherche sans IA, utilisée en repli. Candidats classés du plus au moins pertinent. */
  rechercher(criteres: CriteresRecherche): Promise<Candidat[]>;
}

export interface DependancesRecherche {
  ia: ModeleIA;
  catalogue: Catalogue;
}

export interface ResultatRecherche {
  documents: Candidat[];
  mode: "ia" | "repli";
}

export const NB_MAX_RESULTATS = 5;
export const LONGUEUR_MAX_QUESTION = 500;
const LONGUEUR_MAX_RESUME_IA = 200;

const schemaChoix = z.object({
  ids: z.array(z.string()).max(10),
});

const diffusable = (c: Candidat) => estRenvoyable(c) && c.validite === "en_vigueur";

/**
 * Un seul appel à l'IA par question : elle reçoit le catalogue de tous les documents diffusables et
 * ne renvoie que des identifiants, filtrés ensuite contre ce catalogue. Sans IA, repli sur une
 * recherche par les mots de la question.
 */
export async function choisirDocuments(
  question: string,
  deps: DependancesRecherche,
): Promise<ResultatRecherche> {
  const q = question.trim().slice(0, LONGUEUR_MAX_QUESTION);
  if (!q) return { documents: [], mode: "ia" };

  const catalogue = (await deps.catalogue.lister()).filter(diffusable);
  if (catalogue.length === 0) return { documents: [], mode: "ia" };

  try {
    const ids = await choisir(q, catalogue, deps.ia);
    return { documents: retenir(ids, catalogue), mode: "ia" };
  } catch {
    const trouves = await deps.catalogue.rechercher({
      motsCles: motsDeLaQuestion(q),
      themes: [],
      limite: NB_MAX_RESULTATS,
    });
    return { documents: trouves.filter(diffusable).slice(0, NB_MAX_RESULTATS), mode: "repli" };
  }
}

async function choisir(question: string, catalogue: Candidat[], ia: ModeleIA): Promise<string[]> {
  const brut = await ia.genererObjet({
    instructions: INSTRUCTIONS_CHOISIR,
    contexte: contexteCatalogue(
      catalogue.map((c) => ({
        id: c.id,
        titre: c.titre,
        themes: c.themes,
        tags: c.tags,
        // Le résumé non validé sert à choisir, pas forcément à être affiché (voir `apercu`).
        resume: (c.resume?.texte ?? "").slice(0, LONGUEUR_MAX_RESUME_IA),
      })),
    ),
    entree: entreeQuestion(question),
    schema: schemaChoix,
  });
  return schemaChoix.parse(brut).ids;
}

function retenir(ids: string[], catalogue: Candidat[]): Candidat[] {
  const parId = new Map(catalogue.map((c) => [c.id, c]));
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
