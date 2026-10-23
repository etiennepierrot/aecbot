import { describe, expect, it } from "vitest";
import { apercu, estRenvoyable } from "./diffusion";

describe("estRenvoyable", () => {
  it("ne renvoie un document généré qu'une fois validé", () => {
    expect(estRenvoyable({ origine: "genere", statut: "valide", confianceSource: "non_verifiee" })).toBe(true);
    expect(estRenvoyable({ origine: "genere", statut: "brouillon", confianceSource: "officielle" })).toBe(false);
  });

  it("renvoie un document collecté relu par un humain, quelle que soit sa source", () => {
    expect(estRenvoyable({ origine: "push", statut: "qualifie", confianceSource: "non_verifiee" })).toBe(true);
  });

  it("ne renvoie un document qualifié par l'IA seule que si la source est officielle", () => {
    expect(estRenvoyable({ origine: "wp", statut: "qualifie_ia", confianceSource: "officielle" })).toBe(true);
    expect(estRenvoyable({ origine: "push", statut: "qualifie_ia", confianceSource: "verifiee" })).toBe(false);
  });

  it("ne renvoie jamais un document simplement reçu", () => {
    expect(estRenvoyable({ origine: "wp", statut: "recu", confianceSource: "officielle" })).toBe(false);
  });
});

describe("apercu", () => {
  it("affiche le résumé seulement s'il est validé par un humain", () => {
    expect(apercu({ extrait: "extrait", resume: { texte: "résumé", valideParHumain: true } })).toBe("résumé");
    expect(apercu({ extrait: "extrait", resume: { texte: "résumé", valideParHumain: false } })).toBe("extrait");
    expect(apercu({ extrait: "extrait" })).toBe("extrait");
  });
});
