import type { Candidat } from "@aecbot/core";
import { describe, expect, it } from "vitest";
import {
  AVERTISSEMENT,
  MESSAGE_AUCUN_DOCUMENT,
  NB_MAX_FICHIERS,
  echapperHtml,
  legende,
  planifierReponse,
  texteFinal,
} from "./message";

function doc(id: string, surcharge: Partial<Candidat> = {}): Candidat {
  return {
    id,
    titre: `Document ${id}`,
    url: `https://exemple.test/${id}.pdf`,
    typeMedia: "pdf",
    origine: "wp",
    statut: "qualifie_ia",
    confianceSource: "officielle",
    validite: "en_vigueur",
    themes: [],
    tags: [],
    resume: { texte: `Résumé ${id}.`, valideParHumain: false },
    ...surcharge,
  };
}

const ids = (docs: Candidat[]) => docs.map((d) => d.id);

describe("planifierReponse", () => {
  it(`envoie en fichiers les ${NB_MAX_FICHIERS} premiers PDF en ligne, le reste en liens, dans l'ordre de l'IA`, () => {
    const documents = [
      doc("a"),
      doc("page", { typeMedia: "page", url: "https://exemple.test/page" }),
      doc("b"),
      doc("c"),
      doc("d"),
    ];

    const plan = planifierReponse({ mode: "ia", documents });

    expect(ids(plan.fichiers)).toEqual(["a", "b", "c"]);
    expect(ids(plan.liens)).toEqual(["page", "d"]);
  });

  it("n'envoie pas en fichier un PDF sans URL publique", () => {
    const plan = planifierReponse({ mode: "ia", documents: [doc("pousse", { url: "push par Camille" })] });

    expect(plan.fichiers).toEqual([]);
    expect(ids(plan.liens)).toEqual(["pousse"]);
  });
});

describe("legende", () => {
  it("donne le titre en gras puis le résumé affichable", () => {
    expect(legende(doc("a"))).toBe("<b>Document a</b>\nRésumé a.");
  });

  it("omet le résumé non relu d'un document généré", () => {
    const fiche = doc("fiche", { origine: "genere", statut: "valide" });

    expect(legende(fiche)).toBe("<b>Document fiche</b>");
  });

  it("échappe le HTML et reste sous la limite de 1 024 caractères des légendes", () => {
    const enorme = doc("a", { titre: "<b>".repeat(2000), resume: { texte: "&".repeat(5000), valideParHumain: false } });
    const affiche = legende(enorme).replace(/<\/?b>/g, "").replace(/&(lt|gt|amp|quot);/g, "x");

    expect(legende(enorme)).not.toContain("<b><b>");
    expect(affiche.length).toBeLessThan(1024);
  });
});

describe("texteFinal", () => {
  it("liste les documents restants en liens, puis l'avertissement", () => {
    const texte = texteFinal([doc("a"), doc("pousse", { url: "push par Camille" })], false);

    expect(texte).toBe(
      [
        "Autres documents utiles :",
        '• <a href="https://exemple.test/a.pdf">Document a</a>',
        "• Document pousse (source : push par Camille)",
        "",
        `<i>${AVERTISSEMENT}</i>`,
      ].join("\n"),
    );
  });

  it("se réduit à l'avertissement quand tout a été envoyé en fichiers", () => {
    expect(texteFinal([], false)).toBe(`<i>${AVERTISSEMENT}</i>`);
  });

  it("dit clairement quand aucun document ne répond", () => {
    expect(texteFinal([], true)).toBe(`${MESSAGE_AUCUN_DOCUMENT}\n\n<i>${AVERTISSEMENT}</i>`);
  });
});

describe("echapperHtml", () => {
  it("échappe les caractères spéciaux du mode HTML de Telegram, guillemets compris", () => {
    expect(echapperHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});
