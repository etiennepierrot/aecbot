import { describe, expect, it, vi } from "vitest";
import {
  choisirDocuments,
  motsDeLaQuestion,
  NB_MAX_RESULTATS,
  type Candidat,
  type Catalogue,
  type CriteresRecherche,
} from "./choisir-documents";
import type { ModeleIA } from "./modele-ia";

function candidat(id: string, surcharge: Partial<Candidat> = {}): Candidat {
  return {
    id,
    titre: `Document ${id}`,
    url: `https://exemple.test/${id}`,
    typeMedia: "pdf",
    origine: "wp",
    statut: "qualifie",
    confianceSource: "officielle",
    validite: "en_vigueur",
    themes: [],
    tags: [],
    resume: { texte: `résumé ${id}`, valideParHumain: false },
    ...surcharge,
  };
}

function fauxCatalogue(tous: Candidat[], trouves: Candidat[] = tous) {
  const recherches: CriteresRecherche[] = [];
  const catalogue: Catalogue = {
    lister: async () => tous,
    rechercher: async (criteres) => {
      recherches.push(criteres);
      return trouves;
    },
  };
  return { catalogue, recherches };
}

function fauxModele(...reponses: (unknown | Error)[]) {
  const genererObjet = vi.fn<ModeleIA["genererObjet"]>();
  for (const r of reponses) {
    if (r instanceof Error) genererObjet.mockRejectedValueOnce(r);
    else genererObjet.mockResolvedValueOnce(r);
  }
  return { genererObjet };
}

const requete = (ia: ReturnType<typeof fauxModele>, appel = 0) => ia.genererObjet.mock.calls[appel]?.[0];

describe("choisirDocuments", () => {
  it("renvoie les documents choisis par l'IA, dans son ordre, en un seul appel", async () => {
    const { catalogue } = fauxCatalogue([candidat("a"), candidat("b"), candidat("c")]);
    const ia = fauxModele({ ids: ["c", "a"] });

    const resultat = await choisirDocuments("Retraite à 60 ans ?", { ia, catalogue });

    expect(resultat.mode).toBe("ia");
    expect(resultat.documents.map((d) => d.id)).toEqual(["c", "a"]);
    expect(ia.genererObjet).toHaveBeenCalledTimes(1);
  });

  it("met le catalogue dans le contexte stable et la question dans l'entrée", async () => {
    const { catalogue } = fauxCatalogue([candidat("a", { tags: ["règle verte"] })]);
    const ia = fauxModele({ ids: [] }, { ids: [] });

    await choisirDocuments("première question", { ia, catalogue });
    await choisirDocuments("seconde question", { ia, catalogue });

    expect(requete(ia, 0)?.contexte).toContain('"id":"a"');
    expect(requete(ia, 0)?.contexte).toContain("règle verte");
    expect(requete(ia, 0)?.contexte).not.toContain("question");
    expect(requete(ia, 0)?.contexte).toBe(requete(ia, 1)?.contexte);
    expect(requete(ia, 0)?.entree).toContain("première question");
  });

  it("ignore les identifiants absents du catalogue, et les doublons", async () => {
    const { catalogue } = fauxCatalogue([candidat("a"), candidat("b")]);
    const ia = fauxModele({ ids: ["inconnu", "b", "b", "a"] });

    const resultat = await choisirDocuments("question", { ia, catalogue });

    expect(resultat.documents.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("ne montre ni ne renvoie jamais un document non diffusable, même si le catalogue le liste", async () => {
    const { catalogue } = fauxCatalogue([
      candidat("brouillon", { origine: "genere", statut: "brouillon" }),
      candidat("archive", { validite: "archive" }),
      candidat("non-verifie", { origine: "push", statut: "qualifie_ia", confianceSource: "non_verifiee" }),
      candidat("ok"),
    ]);
    const ia = fauxModele({ ids: ["brouillon", "archive", "non-verifie", "ok"] });

    const resultat = await choisirDocuments("question", { ia, catalogue });

    expect(resultat.documents.map((d) => d.id)).toEqual(["ok"]);
    const contexte = requete(ia)?.contexte ?? "";
    for (const id of ["brouillon", "archive", "non-verifie"]) expect(contexte).not.toContain(`"id":"${id}"`);
  });

  it(`renvoie au plus ${NB_MAX_RESULTATS} documents`, async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const { catalogue } = fauxCatalogue(ids.map((id) => candidat(id)));
    const ia = fauxModele({ ids });

    const resultat = await choisirDocuments("question", { ia, catalogue });

    expect(resultat.documents).toHaveLength(NB_MAX_RESULTATS);
  });

  it("renvoie une liste vide si l'IA juge qu'aucun document ne répond", async () => {
    const { catalogue } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele({ ids: [] });

    expect(await choisirDocuments("question", { ia, catalogue })).toEqual({ documents: [], mode: "ia" });
  });

  it("n'appelle pas l'IA quand aucun document n'est diffusable", async () => {
    const { catalogue } = fauxCatalogue([candidat("a", { validite: "archive" })]);
    const ia = fauxModele();

    const resultat = await choisirDocuments("question", { ia, catalogue });

    expect(resultat.documents).toEqual([]);
    expect(ia.genererObjet).not.toHaveBeenCalled();
  });

  it("ne fait rien pour une question vide", async () => {
    const { catalogue, recherches } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele();

    const resultat = await choisirDocuments("   ", { ia, catalogue });

    expect(resultat.documents).toEqual([]);
    expect(ia.genererObjet).not.toHaveBeenCalled();
    expect(recherches).toEqual([]);
  });

  it("tronque une question trop longue avant de l'envoyer à l'IA", async () => {
    const { catalogue } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele({ ids: [] });

    await choisirDocuments("x".repeat(2000), { ia, catalogue });

    const entree = requete(ia)?.entree ?? "";
    expect(entree).toContain("x".repeat(500));
    expect(entree).not.toContain("x".repeat(501));
  });

  describe("repli sans IA", () => {
    it("cherche avec les mots de la question si l'IA échoue", async () => {
      const { catalogue, recherches } = fauxCatalogue([candidat("a"), candidat("b")], [candidat("b")]);
      const ia = fauxModele(new Error("API indisponible"));

      const resultat = await choisirDocuments("Que propose le programme sur la retraite ?", { ia, catalogue });

      expect(resultat).toMatchObject({ mode: "repli", documents: [{ id: "b" }] });
      expect(recherches).toEqual([{ motsCles: ["programme", "retraite"], themes: [], limite: NB_MAX_RESULTATS }]);
    });

    it("se replie aussi si la réponse de l'IA est mal formée", async () => {
      const { catalogue } = fauxCatalogue([candidat("a")]);
      const ia = fauxModele({ documents: ["a"] });

      expect((await choisirDocuments("retraite", { ia, catalogue })).mode).toBe("repli");
    });

    it("ne renvoie pas de document non diffusable, même en repli", async () => {
      const { catalogue } = fauxCatalogue([candidat("a")], [candidat("archive", { validite: "archive" }), candidat("a")]);
      const ia = fauxModele(new Error("timeout"));

      const resultat = await choisirDocuments("question", { ia, catalogue });

      expect(resultat.documents.map((d) => d.id)).toEqual(["a"]);
    });
  });
});

describe("motsDeLaQuestion", () => {
  it("garde les mots porteurs de sens, sans accents ni doublons", () => {
    expect(motsDeLaQuestion("Qu'est-ce que l'AEC prévoit pour l'écologie et l'écologie ?")).toEqual([
      "aec",
      "ecologie",
    ]);
  });
});
