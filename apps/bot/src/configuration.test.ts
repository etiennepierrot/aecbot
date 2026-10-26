import { describe, expect, it } from "vitest";
import { lireConfiguration } from "./configuration";

const COMPLET = {
  TELEGRAM_BOT_TOKEN: "jeton",
  OPENROUTER_API_KEY: "cle",
  OPENROUTER_MODEL: "fournisseur/modele",
  AECBOT_CORPUS: "/corpus",
};

describe("lireConfiguration", () => {
  it("lit les variables, avec 20 questions par heure par défaut", () => {
    expect(lireConfiguration(COMPLET)).toEqual({
      jetonTelegram: "jeton",
      cleOpenRouter: "cle",
      modele: "fournisseur/modele",
      dossierCorpus: "/corpus",
      questionsParHeure: 20,
    });
  });

  it("liste toutes les variables manquantes d'un coup", () => {
    expect(() => lireConfiguration({ OPENROUTER_API_KEY: "cle" })).toThrow(
      "Variables d'environnement manquantes : TELEGRAM_BOT_TOKEN, OPENROUTER_MODEL, AECBOT_CORPUS",
    );
  });

  it("refuse une limite de questions invalide", () => {
    expect(() => lireConfiguration({ ...COMPLET, AECBOT_QUESTIONS_PAR_HEURE: "beaucoup" })).toThrow(
      "AECBOT_QUESTIONS_PAR_HEURE",
    );
    expect(lireConfiguration({ ...COMPLET, AECBOT_QUESTIONS_PAR_HEURE: "5" }).questionsParHeure).toBe(5);
  });
});
