import { describe, expect, it } from "vitest";
import { LONGUEUR_MAX_RESUME, lireDocumentMarkdown } from "./format-markdown";

const EN_TETE = `id: wp-15699
titre: Programme L'Avenir en commun
url: https://melenchon2027.fr/programme.pdf
origine: wp
statut: qualifie_ia
source:
  nom: melenchon2027.fr
  confiance: officielle
type_media: pdf
date_publication: "2026-03-01"
corpus: aec_2027
validite: en_vigueur
themes: [retraites, travail]
verrouilles: [themes]`;

describe("lireDocumentMarkdown", () => {
  it("lit les métadonnées de l'en-tête et le résumé dans le corps", () => {
    const doc = lireDocumentMarkdown(`---\n${EN_TETE}\n---\n\nLe programme général,\nen quelques lignes.\n`);

    expect(doc).toEqual({
      id: "wp-15699",
      titre: "Programme L'Avenir en commun",
      url: "https://melenchon2027.fr/programme.pdf",
      origine: "wp",
      statut: "qualifie_ia",
      confianceSource: "officielle",
      nomSource: "melenchon2027.fr",
      typeMedia: "pdf",
      datePublication: "2026-03-01",
      corpus: "aec_2027",
      validite: "en_vigueur",
      themes: ["retraites", "travail"],
      tags: [],
      resume: "Le programme général,\nen quelques lignes.",
      verrouilles: ["themes"],
    });
  });

  it("accepte un document sans résumé", () => {
    expect(lireDocumentMarkdown(`---\n${EN_TETE}\n---\n`).resume).toBeUndefined();
  });

  it("refuse un corps trop long : le contenu du document n'a pas sa place dans le corpus", () => {
    const contenu = `---\n${EN_TETE}\n---\n${"x".repeat(LONGUEUR_MAX_RESUME + 1)}`;

    expect(() => lireDocumentMarkdown(contenu)).toThrow("résumé de quelques lignes");
  });

  it("refuse un fichier sans en-tête", () => {
    expect(() => lireDocumentMarkdown("# Juste du texte")).toThrow("en-tête YAML manquant");
  });

  it("refuse une valeur hors liste en nommant le champ", () => {
    const contenu = `---\n${EN_TETE.replace("statut: qualifie_ia", "statut: publié")}\n---\n`;

    expect(() => lireDocumentMarkdown(contenu)).toThrow(/statut/);
  });

  it("refuse un champ obligatoire manquant", () => {
    const contenu = `---\n${EN_TETE.replace("corpus: aec_2027\n", "")}\n---\n`;

    expect(() => lireDocumentMarkdown(contenu)).toThrow(/corpus/);
  });
});
