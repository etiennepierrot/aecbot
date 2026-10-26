import { CatalogueMarkdown, type DocumentCorpus, type ModeleIA } from "@aecbot/core";
import type { Update, UserFromGetMe } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import { creerBot, rechercher, type DependancesBot, type EvenementQuestion } from "./bot";
import { Limiteur } from "./limiteur";
import { AVERTISSEMENT, MESSAGE_ACCUEIL, MESSAGE_ERREUR, MESSAGE_LIMITE, MESSAGE_TEXTE_SEULEMENT } from "./message";

function document(id: string, surcharge: Partial<DocumentCorpus> = {}): DocumentCorpus {
  return {
    id,
    titre: `Document ${id}`,
    url: `https://exemple.test/${id}.pdf`,
    origine: "wp",
    statut: "qualifie_ia",
    confianceSource: "officielle",
    nomSource: "melenchon2027.fr",
    typeMedia: "pdf",
    corpus: "aec_2027",
    validite: "en_vigueur",
    themes: [],
    tags: [],
    resume: `Résumé ${id}.`,
    verrouilles: [],
    ...surcharge,
  };
}

const CORPUS = [
  document("logement", { titre: "Livret Logement" }),
  document("sdf"),
  document("btp"),
  document("ruralite"),
  document("page", { typeMedia: "page", url: "https://exemple.test/page" }),
];

const iaQuiChoisit = (...ids: string[]): ModeleIA => ({ genererObjet: vi.fn(async () => ({ ids })) });

function dependances(ia: ModeleIA, limiteur = new Limiteur(20, 3_600_000)) {
  const journal: EvenementQuestion[] = [];
  const deps: DependancesBot = {
    recherche: { ia, catalogue: new CatalogueMarkdown(CORPUS) },
    limiteur,
    journal: (e) => journal.push(e),
  };
  return { deps, journal };
}

describe("rechercher", () => {
  it("journalise sans la question ni son auteur", async () => {
    const { deps, journal } = dependances(iaQuiChoisit("logement"));

    const resultat = await rechercher("Que propose le programme sur le logement ?", deps);

    expect(resultat?.documents.map((d) => d.id)).toEqual(["logement"]);
    expect(journal).toEqual([{ mode: "ia", nbDocuments: 1, dureeMs: expect.any(Number) }]);
    expect(JSON.stringify(journal)).not.toContain("programme");
  });

  it("renvoie null et journalise une erreur si la recherche elle-même échoue", async () => {
    const { deps, journal } = dependances(iaQuiChoisit());
    deps.recherche.catalogue = {
      lister: async () => {
        throw new Error("corpus illisible");
      },
      rechercher: async () => [],
    };

    expect(await rechercher("question", deps)).toBeNull();
    expect(journal[0]?.mode).toBe("erreur");
  });
});

describe("creerBot", () => {
  /** Faux serveur Telegram : enregistre les appels ; les PDF dont l'URL est listée échouent. */
  function botDeTest(deps: DependancesBot, urlsEnEchec: string[] = []) {
    const bot = creerBot("123:jeton-de-test", deps);
    bot.botInfo = { id: 1, is_bot: true, first_name: "AECBot", username: "aecbot_test" } as UserFromGetMe;
    const appels: { methode: string; parametres: Record<string, unknown> }[] = [];
    let numero = 0;
    bot.api.config.use(async (_suivant, methode, parametres) => {
      const p = parametres as Record<string, unknown>;
      appels.push({ methode, parametres: p });
      if (methode === "sendDocument") {
        if (urlsEnEchec.includes(String(p.document))) {
          return { ok: false, error_code: 400, description: "Bad Request: file is too big" } as never;
        }
        return { ok: true, result: { message_id: ++numero, date: 0, chat: { id: 42, type: "private" }, document: { file_id: `fichier-${p.document}`, file_unique_id: "u" } } } as never;
      }
      return { ok: true, result: true } as never;
    });
    const parMethode = (m: string) => appels.filter((a) => a.methode === m).map((a) => a.parametres);
    return { bot, appels, parMethode };
  }

  let idMiseAJour = 0;
  function message(texte: string, surcharge: Record<string, unknown> = {}): Update {
    const commande = texte.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: texte.split(" ")[0]!.length }] } : {};
    return {
      update_id: ++idMiseAJour,
      message: {
        message_id: idMiseAJour,
        date: 0,
        chat: { id: 42, type: "private", first_name: "Militant" },
        from: { id: 42, is_bot: false, first_name: "Militant" },
        text: texte,
        ...commande,
        ...surcharge,
      },
    } as Update;
  }

  it("envoie le PDF choisi en fichier, avec sa légende, puis l'avertissement", async () => {
    const { deps } = dependances(iaQuiChoisit("logement"));
    const { bot, appels, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("Que propose le programme sur le logement ?"));

    expect(appels.map((a) => a.methode)).toEqual(["sendChatAction", "sendChatAction", "sendDocument", "sendMessage"]);
    expect(parMethode("sendDocument")[0]).toMatchObject({
      chat_id: 42,
      document: "https://exemple.test/logement.pdf",
      caption: "<b>Livret Logement</b>\nRésumé logement.",
      parse_mode: "HTML",
    });
    expect(parMethode("sendMessage")[0]).toMatchObject({ text: `<i>${AVERTISSEMENT}</i>`, parse_mode: "HTML" });
  });

  it("réutilise l'identifiant Telegram d'un fichier déjà envoyé", async () => {
    const { deps } = dependances(iaQuiChoisit("logement"));
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("logement ?"));
    await bot.handleUpdate(message("logement social ?"));

    expect(parMethode("sendDocument").map((p) => p.document)).toEqual([
      "https://exemple.test/logement.pdf",
      "fichier-https://exemple.test/logement.pdf",
    ]);
  });

  it("envoie au plus 3 fichiers et donne le reste en liens", async () => {
    const { deps } = dependances(iaQuiChoisit("logement", "page", "sdf", "btp", "ruralite"));
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("logement ?"));

    expect(parMethode("sendDocument").map((p) => p.document)).toEqual([
      "https://exemple.test/logement.pdf",
      "https://exemple.test/sdf.pdf",
      "https://exemple.test/btp.pdf",
    ]);
    const texte = String(parMethode("sendMessage")[0]?.text);
    expect(texte).toContain('<a href="https://exemple.test/page">Document page</a>');
    expect(texte).toContain('<a href="https://exemple.test/ruralite.pdf">Document ruralite</a>');
  });

  it("donne en lien un PDF que Telegram n'a pas pu envoyer (trop gros, injoignable)", async () => {
    const { deps } = dependances(iaQuiChoisit("btp", "logement"));
    const { bot, parMethode } = botDeTest(deps, ["https://exemple.test/btp.pdf"]);

    await bot.handleUpdate(message("logement ?"));

    expect(parMethode("sendDocument").map((p) => p.document)).toEqual([
      "https://exemple.test/btp.pdf",
      "https://exemple.test/logement.pdf",
    ]);
    expect(String(parMethode("sendMessage")[0]?.text)).toContain('<a href="https://exemple.test/btp.pdf">Document btp</a>');
  });

  it("n'envoie aucun fichier quand aucun document ne répond", async () => {
    const { deps } = dependances(iaQuiChoisit());
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("Quel temps fera-t-il demain ?"));

    expect(parMethode("sendDocument")).toEqual([]);
    expect(String(parMethode("sendMessage")[0]?.text)).toContain("Aucun document du programme");
  });

  it("prévient en cas de panne de la recherche", async () => {
    const { deps } = dependances(iaQuiChoisit());
    deps.recherche.catalogue = {
      lister: async () => {
        throw new Error("corpus illisible");
      },
      rechercher: async () => [],
    };
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("logement ?"));

    expect(parMethode("sendMessage").map((p) => p.text)).toEqual([MESSAGE_ERREUR]);
  });

  it("présente le bot sur /start et /aide", async () => {
    const { deps } = dependances(iaQuiChoisit());
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("/start"));
    await bot.handleUpdate(message("/aide"));

    expect(parMethode("sendMessage").map((p) => p.text)).toEqual([MESSAGE_ACCUEIL, MESSAGE_ACCUEIL]);
  });

  it("ignore les groupes", async () => {
    const ia = iaQuiChoisit("logement");
    const { deps } = dependances(ia);
    const { bot, appels } = botDeTest(deps);

    await bot.handleUpdate(message("logement ?", { chat: { id: -100, type: "group", title: "Groupe local" } }));

    expect(appels).toEqual([]);
    expect(ia.genererObjet).not.toHaveBeenCalled();
  });

  it("refuse poliment au-delà de la limite, sans appeler l'IA", async () => {
    const ia = iaQuiChoisit("logement");
    const { deps } = dependances(ia, new Limiteur(1, 3_600_000));
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("première question"));
    await bot.handleUpdate(message("seconde question"));

    expect(parMethode("sendMessage").at(-1)?.text).toBe(MESSAGE_LIMITE);
    expect(ia.genererObjet).toHaveBeenCalledTimes(1);
  });

  it("explique qu'il ne comprend que le texte", async () => {
    const { deps } = dependances(iaQuiChoisit());
    const { bot, parMethode } = botDeTest(deps);

    await bot.handleUpdate(message("", { text: undefined, sticker: { file_id: "x" } }));

    expect(parMethode("sendMessage").map((p) => p.text)).toEqual([MESSAGE_TEXTE_SEULEMENT]);
  });
});
