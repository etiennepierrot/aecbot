import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogueMarkdown, chargerCatalogueMarkdown } from "./catalogue-markdown";
import type { DocumentCorpus } from "./format-markdown";

function doc(id: string, surcharge: Partial<DocumentCorpus> = {}): DocumentCorpus {
  return {
    id,
    titre: `Document ${id}`,
    url: `https://exemple.test/${id}`,
    origine: "wp",
    statut: "qualifie_ia",
    confianceSource: "officielle",
    nomSource: "melenchon2027.fr",
    typeMedia: "pdf",
    corpus: "aec_2027",
    validite: "en_vigueur",
    themes: [],
    tags: [],
    verrouilles: [],
    ...surcharge,
  };
}

const criteres = (motsCles: string[], themes: string[] = [], limite = 25) => ({ motsCles, themes, limite });

describe("CatalogueMarkdown", () => {
  it("cherche dans le titre, le résumé et les tags, sans tenir compte des accents", async () => {
    const catalogue = new CatalogueMarkdown([
      doc("par-resume", { resume: "La règle verte encadre la planification écologique." }),
      doc("par-titre", { titre: "Plan règle verte" }),
      doc("par-tag", { tags: ["regle verte"] }),
      doc("sans-rapport", { resume: "Les retraites à 60 ans." }),
    ]);

    const resultats = await catalogue.rechercher(criteres(["regle verte"]));

    expect(resultats.map((c) => c.id).sort()).toEqual(["par-resume", "par-tag", "par-titre"]);
    expect(resultats[0]?.id).toBe("par-titre");
  });

  it("n'indexe que les documents diffusables et en vigueur", async () => {
    const resume = "retraite";
    const catalogue = new CatalogueMarkdown([
      doc("ok", { resume }),
      doc("archive", { resume, validite: "archive" }),
      doc("brouillon", { resume, origine: "genere", statut: "brouillon" }),
      doc("non-verifie", { resume, origine: "push", confianceSource: "non_verifiee" }),
    ]);

    const resultats = await catalogue.rechercher(criteres(["retraite"]));

    expect(resultats.map((c) => c.id)).toEqual(["ok"]);
    expect(catalogue.taille).toBe(1);
  });

  it("favorise les documents des thèmes demandés, et ajoute ceux que les mots-clés ont manqués", async () => {
    const catalogue = new CatalogueMarkdown([
      doc("hors-theme", { resume: "pension pension pension" }),
      doc("dans-theme", { themes: ["retraites"], resume: "pension" }),
      doc("theme-seul", { themes: ["retraites"], resume: "âge légal de départ" }),
    ]);

    const resultats = await catalogue.rechercher(criteres(["pension"], ["retraites"]));

    expect(resultats.map((c) => c.id)).toEqual(["dans-theme", "hors-theme", "theme-seul"]);
  });

  it("respecte la limite", async () => {
    const catalogue = new CatalogueMarkdown(["a", "b", "c"].map((id) => doc(id, { resume: "retraite" })));

    expect(await catalogue.rechercher(criteres(["retraite"], [], 2))).toHaveLength(2);
  });

  it("signale si le résumé a été validé par un humain", async () => {
    const catalogue = new CatalogueMarkdown([
      doc("valide", { resume: "Retraite, résumé relu.", verrouilles: ["resume"] }),
      doc("ia", { resume: "Retraite, résumé IA." }),
      doc("sans", { titre: "Retraite" }),
    ]);

    const resultats = await catalogue.rechercher(criteres(["retraite"]));
    const resume = (id: string) => resultats.find((c) => c.id === id)?.resume;

    expect(resume("valide")).toEqual({ texte: "Retraite, résumé relu.", valideParHumain: true });
    expect(resume("ia")).toEqual({ texte: "Retraite, résumé IA.", valideParHumain: false });
    expect(resume("sans")).toBeUndefined();
  });
});

describe("chargerCatalogueMarkdown", () => {
  let dossier = "";
  afterEach(async () => {
    if (dossier) await rm(dossier, { recursive: true, force: true });
  });

  const fichier = (id: string) => `---
id: ${id}
titre: Document ${id}
url: https://exemple.test/${id}
origine: wp
statut: qualifie_ia
source: { nom: melenchon2027.fr, confiance: officielle }
type_media: page
corpus: aec_2027
validite: en_vigueur
---
Résumé sur la retraite.
`;

  it("charge les fichiers valides, y compris dans les sous-dossiers, et liste les erreurs", async () => {
    dossier = await mkdtemp(join(tmpdir(), "aecbot-corpus-"));
    await mkdir(join(dossier, "livrets"));
    await writeFile(join(dossier, "a.md"), fichier("a"));
    await writeFile(join(dossier, "livrets", "b.md"), fichier("b"));
    await writeFile(join(dossier, "livrets", "doublon.md"), fichier("a"));
    await writeFile(join(dossier, "casse.md"), "pas d'en-tête");
    await writeFile(join(dossier, "notes.txt"), "ignoré");

    const { catalogue, erreurs } = await chargerCatalogueMarkdown(dossier);

    expect(catalogue.taille).toBe(2);
    expect(erreurs.map((e) => [e.fichier.slice(dossier.length + 1), e.message.split("\n")[0]])).toEqual([
      ["casse.md", "en-tête YAML manquant (le fichier doit commencer par ---)"],
      [join("livrets", "doublon.md"), `id « a » déjà utilisé par ${join(dossier, "a.md")}`],
    ]);
  });
});
