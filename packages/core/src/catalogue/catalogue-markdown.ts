import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import MiniSearch from "minisearch";
import { estRenvoyable } from "../diffusion";
import type { Candidat, Catalogue, CriteresRecherche } from "../recherche/choisir-documents";
import { sansAccents } from "../texte";
import { lireDocumentMarkdown, type DocumentCorpus } from "./format-markdown";

const BONUS_THEME = 1.5;

interface Entree {
  id: string;
  titre: string;
  resume: string;
  tags: string;
}

/** Index en mémoire des seuls documents diffusables et en vigueur, sur leurs métadonnées et leur résumé. */
export class CatalogueMarkdown implements Catalogue {
  private readonly documents = new Map<string, DocumentCorpus>();
  private readonly index = new MiniSearch<Entree>({
    fields: ["titre", "resume", "tags"],
    processTerm: (terme) => {
      const t = sansAccents(terme);
      return t.length > 1 ? t : null;
    },
    searchOptions: {
      boost: { titre: 3, tags: 2 },
      prefix: (terme) => terme.length > 3,
      fuzzy: (terme) => (terme.length > 5 ? 0.2 : false),
      combineWith: "OR",
    },
  });

  constructor(documents: DocumentCorpus[]) {
    for (const doc of documents) {
      if (!estRenvoyable(doc) || doc.validite !== "en_vigueur") continue;
      this.documents.set(doc.id, doc);
      this.index.add({
        id: doc.id,
        titre: doc.titre,
        resume: doc.resume ?? "",
        tags: [...doc.themes, ...doc.tags].join(" "),
      });
    }
  }

  get taille(): number {
    return this.documents.size;
  }

  async lister(): Promise<Candidat[]> {
    return [...this.documents.values()].map(versCandidat);
  }

  async rechercher({ motsCles, themes, limite }: CriteresRecherche): Promise<Candidat[]> {
    const trouves = motsCles.length > 0 ? this.index.search(motsCles.join(" ")) : [];
    const classes = trouves
      .map((r) => {
        const doc = this.documents.get(r.id)!;
        return { doc, score: partageUnTheme(doc, themes) ? r.score * BONUS_THEME : r.score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ doc }) => doc);

    const dejaTrouves = new Set(classes.map((d) => d.id));
    for (const doc of this.documents.values()) {
      if (!dejaTrouves.has(doc.id) && partageUnTheme(doc, themes)) classes.push(doc);
    }

    return classes.slice(0, limite).map(versCandidat);
  }
}

function partageUnTheme(doc: DocumentCorpus, themes: string[]): boolean {
  return doc.themes.some((t) => themes.includes(t));
}

function versCandidat(doc: DocumentCorpus): Candidat {
  return {
    id: doc.id,
    titre: doc.titre,
    url: doc.url,
    origine: doc.origine,
    statut: doc.statut,
    confianceSource: doc.confianceSource,
    validite: doc.validite,
    themes: doc.themes,
    tags: doc.tags,
    resume: doc.resume ? { texte: doc.resume, valideParHumain: doc.verrouilles.includes("resume") } : undefined,
  };
}

export interface ErreurChargement {
  fichier: string;
  message: string;
}

export async function chargerCatalogueMarkdown(
  dossier: string,
): Promise<{ catalogue: CatalogueMarkdown; erreurs: ErreurChargement[] }> {
  const fichiers = (await readdir(dossier, { recursive: true })).filter((f) => f.endsWith(".md")).sort();
  const documents: DocumentCorpus[] = [];
  const erreurs: ErreurChargement[] = [];
  const cheminParId = new Map<string, string>();

  for (const relatif of fichiers) {
    const fichier = join(dossier, relatif);
    try {
      const doc = lireDocumentMarkdown(await readFile(fichier, "utf8"));
      const dejaVu = cheminParId.get(doc.id);
      if (dejaVu) {
        erreurs.push({ fichier, message: `id « ${doc.id} » déjà utilisé par ${dejaVu}` });
        continue;
      }
      cheminParId.set(doc.id, fichier);
      documents.push(doc);
    } catch (erreur) {
      erreurs.push({ fichier, message: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }

  return { catalogue: new CatalogueMarkdown(documents), erreurs };
}
