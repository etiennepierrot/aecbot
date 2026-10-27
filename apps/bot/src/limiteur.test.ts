import { describe, expect, it } from "vitest";
import { Limiteur } from "./limiteur";

describe("Limiteur", () => {
  it("autorise jusqu'au maximum dans la fenêtre, puis refuse", () => {
    const limiteur = new Limiteur(2, 1000, () => 0);

    expect([limiteur.autoriser(1), limiteur.autoriser(1), limiteur.autoriser(1)]).toEqual([true, true, false]);
  });

  it("compte chaque utilisateur séparément", () => {
    const limiteur = new Limiteur(1, 1000, () => 0);

    expect([limiteur.autoriser(1), limiteur.autoriser(2), limiteur.autoriser(1)]).toEqual([true, true, false]);
  });

  it("libère des questions quand la fenêtre glisse", () => {
    let instant = 0;
    const limiteur = new Limiteur(1, 1000, () => instant);

    limiteur.autoriser(1);
    instant = 999;
    expect(limiteur.autoriser(1)).toBe(false);
    instant = 1000;
    expect(limiteur.autoriser(1)).toBe(true);
  });
});
