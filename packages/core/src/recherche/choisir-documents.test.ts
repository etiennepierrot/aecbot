import { describe, expect, it, vi } from "vitest";
import {
  choisirDocuments,
  motsDeLaQuestion,
  NB_CANDIDATS,
  type Candidat,
  type Catalogue,
  type CriteresRecherche,
} from "./choisir-documents";
import type { ModeleIA } from "./modele-ia";

const THEMES = ["retraites", "écologie", "institutions"];

function candidat(id: string, surcharge: Partial<Candidat> = {}): Candidat {
  return {
    id,
    titre: `Document ${id}`,
    url: `https://exemple.test/${id}`,
    origine: "wp",
    statut: "qualifie",
    confianceSource: "officielle",
    validite: "en_vigueur",
    themes: [],
    extrait: `extrait ${id}`,
    ...surcharge,
  };
}

function fauxCatalogue(candidats: Candidat[]) {
  const appels: CriteresRecherche[] = [];
  const catalogue: Catalogue = {
    rechercher: async (criteres) => {
      appels.push(criteres);
      return candidats;
    },
  };
  return { catalogue, appels };
}

function fauxModele(...reponses: (unknown | Error)[]) {
  const genererObjet = vi.fn<ModeleIA["genererObjet"]>();
  for (const r of reponses) {
    if (r instanceof Error) genererObjet.mockRejectedValueOnce(r);
    else genererObjet.mockResolvedValueOnce(r);
  }
  return { genererObjet };
}

const COMPREHENSION = { themes: ["retraites"], motsCles: ["retraite", "60 ans"] };

describe("choisirDocuments", () => {
  it("renvoie les documents choisis par l'IA, dans son ordre", async () => {
    const { catalogue, appels } = fauxCatalogue([candidat("a"), candidat("b"), candidat("c")]);
    const ia = fauxModele(COMPREHENSION, { ids: ["c", "a"] });

    const resultat = await choisirDocuments("Retraite à 60 ans ?", { ia, catalogue, themes: THEMES });

    expect(resultat.mode).toBe("ia");
    expect(resultat.documents.map((d) => d.id)).toEqual(["c", "a"]);
    expect(appels).toEqual([{ themes: ["retraites"], motsCles: ["retraite", "60 ans"], limite: NB_CANDIDATS }]);
  });

  it("ignore les thèmes hors de la liste fermée", async () => {
    const { catalogue, appels } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele({ themes: ["retraites", "inventé"], motsCles: ["x"] }, { ids: ["a"] });

    await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(appels[0]?.themes).toEqual(["retraites"]);
  });

  it("ignore les identifiants qui ne sont pas parmi les candidats, et les doublons", async () => {
    const { catalogue } = fauxCatalogue([candidat("a"), candidat("b")]);
    const ia = fauxModele(COMPREHENSION, { ids: ["inconnu", "b", "b", "a"] });

    const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(resultat.documents.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("ne renvoie jamais un document non diffusable, même si le catalogue le propose", async () => {
    const { catalogue } = fauxCatalogue([
      candidat("brouillon", { origine: "genere", statut: "brouillon" }),
      candidat("archive", { validite: "archive" }),
      candidat("non-verifie", { origine: "push", statut: "qualifie_ia", confianceSource: "non_verifiee" }),
      candidat("ok"),
    ]);
    const ia = fauxModele(COMPREHENSION, { ids: ["brouillon", "archive", "non-verifie", "ok"] });

    const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(resultat.documents.map((d) => d.id)).toEqual(["ok"]);
    const entreeClassement = ia.genererObjet.mock.calls[1]?.[0].entree ?? "";
    expect(entreeClassement).not.toContain("brouillon");
    expect(entreeClassement).not.toContain("non-verifie");
  });

  it("renvoie au plus 5 documents", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const { catalogue } = fauxCatalogue(ids.map((id) => candidat(id)));
    const ia = fauxModele(COMPREHENSION, { ids });

    const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(resultat.documents).toHaveLength(5);
  });

  it("renvoie une liste vide si l'IA juge qu'aucun candidat ne répond", async () => {
    const { catalogue } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele(COMPREHENSION, { ids: [] });

    const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(resultat).toEqual({ documents: [], mode: "ia" });
  });

  it("n'appelle pas l'IA pour classer quand il n'y a aucun candidat", async () => {
    const { catalogue } = fauxCatalogue([]);
    const ia = fauxModele(COMPREHENSION);

    const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

    expect(resultat.documents).toEqual([]);
    expect(ia.genererObjet).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien pour une question vide", async () => {
    const { catalogue, appels } = fauxCatalogue([candidat("a")]);
    const ia = fauxModele();

    const resultat = await choisirDocuments("   ", { ia, catalogue, themes: THEMES });

    expect(resultat.documents).toEqual([]);
    expect(ia.genererObjet).not.toHaveBeenCalled();
    expect(appels).toEqual([]);
  });

  it("tronque une question trop longue avant de l'envoyer à l'IA", async () => {
    const { catalogue } = fauxCatalogue([]);
    const ia = fauxModele(COMPREHENSION);

    await choisirDocuments("x".repeat(2000), { ia, catalogue, themes: THEMES });

    const entree = ia.genererObjet.mock.calls[0]?.[0].entree ?? "";
    expect(entree).toContain("x".repeat(500));
    expect(entree).not.toContain("x".repeat(501));
  });

  describe("repli", () => {
    it("cherche avec les mots de la question si l'étape « comprendre » échoue", async () => {
      const { catalogue, appels } = fauxCatalogue([candidat("a")]);
      const ia = fauxModele(new Error("API indisponible"), { ids: ["a"] });

      const resultat = await choisirDocuments("Que propose le programme sur la retraite ?", {
        ia,
        catalogue,
        themes: THEMES,
      });

      expect(resultat.mode).toBe("repli");
      expect(resultat.documents.map((d) => d.id)).toEqual(["a"]);
      expect(appels[0]).toEqual({ motsCles: ["programme", "retraite"], themes: [], limite: NB_CANDIDATS });
    });

    it("cherche avec les mots de la question si la réponse de l'IA est mal formée", async () => {
      const { catalogue, appels } = fauxCatalogue([candidat("a")]);
      const ia = fauxModele({ motsCles: [] }, { ids: ["a"] });

      const resultat = await choisirDocuments("retraite", { ia, catalogue, themes: THEMES });

      expect(resultat.mode).toBe("repli");
      expect(appels[0]?.motsCles).toEqual(["retraite"]);
    });

    it("garde l'ordre du catalogue si l'étape « choisir » échoue", async () => {
      const ids = ["a", "b", "c", "d", "e", "f"];
      const { catalogue } = fauxCatalogue(ids.map((id) => candidat(id)));
      const ia = fauxModele(COMPREHENSION, new Error("timeout"));

      const resultat = await choisirDocuments("question", { ia, catalogue, themes: THEMES });

      expect(resultat.mode).toBe("repli");
      expect(resultat.documents.map((d) => d.id)).toEqual(["a", "b", "c", "d", "e"]);
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
