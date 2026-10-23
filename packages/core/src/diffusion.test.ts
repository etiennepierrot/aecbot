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
  it("affiche le résumé de l'IA pour un document écrit par des humains", () => {
    expect(apercu({ origine: "wp", resume: { texte: "résumé", valideParHumain: false } })).toBe("résumé");
    expect(apercu({ origine: "push", resume: { texte: "résumé", valideParHumain: false } })).toBe("résumé");
  });

  it("n'affiche le résumé d'un document généré que s'il a été relu", () => {
    expect(apercu({ origine: "genere", resume: { texte: "résumé", valideParHumain: true } })).toBe("résumé");
    expect(apercu({ origine: "genere", resume: { texte: "résumé", valideParHumain: false } })).toBeUndefined();
  });

  it("n'affiche rien sans résumé", () => {
    expect(apercu({ origine: "wp" })).toBeUndefined();
  });
});
