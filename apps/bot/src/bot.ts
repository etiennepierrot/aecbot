import { choisirDocuments, type Candidat, type DependancesRecherche, type ResultatRecherche } from "@aecbot/core";
import { Bot } from "grammy";
import type { Limiteur } from "./limiteur";
import {
  MESSAGE_ACCUEIL,
  MESSAGE_ERREUR,
  MESSAGE_LIMITE,
  MESSAGE_TEXTE_SEULEMENT,
  legende,
  planifierReponse,
  texteFinal,
} from "./message";

/** Ce qui est journalisé pour chaque question : ni l'auteur, ni le texte de la question. */
export interface EvenementQuestion {
  mode: ResultatRecherche["mode"] | "erreur";
  nbDocuments: number;
  dureeMs: number;
}

export interface DependancesBot {
  recherche: DependancesRecherche;
  limiteur: Limiteur;
  journal: (evenement: EvenementQuestion) => void;
}

export async function rechercher(question: string, deps: DependancesBot): Promise<ResultatRecherche | null> {
  const debut = performance.now();
  const duree = () => Math.round(performance.now() - debut);
  try {
    const resultat = await choisirDocuments(question, deps.recherche);
    deps.journal({ mode: resultat.mode, nbDocuments: resultat.documents.length, dureeMs: duree() });
    return resultat;
  } catch {
    deps.journal({ mode: "erreur", nbDocuments: 0, dureeMs: duree() });
    return null;
  }
}

export function creerBot(jeton: string, deps: DependancesBot): Bot {
  const bot = new Bot(jeton);
  const prive = bot.chatType("private");
  // URL du PDF → identifiant du fichier chez Telegram, pour ne pas le lui faire retélécharger.
  const fichiersConnus = new Map<string, string>();

  prive.command(["start", "aide"], (ctx) => ctx.reply(MESSAGE_ACCUEIL, { parse_mode: "HTML" }));

  prive.on("message:text", async (ctx) => {
    if (!deps.limiteur.autoriser(ctx.from.id)) {
      await ctx.reply(MESSAGE_LIMITE);
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    const resultat = await rechercher(ctx.message.text, deps);
    if (!resultat) {
      await ctx.reply(MESSAGE_ERREUR);
      return;
    }

    const { fichiers, liens } = planifierReponse(resultat);
    const nonEnvoyes: Candidat[] = [];
    for (const doc of fichiers) {
      await ctx.replyWithChatAction("upload_document").catch(() => undefined);
      try {
        const envoi = await ctx.replyWithDocument(fichiersConnus.get(doc.url) ?? doc.url, {
          caption: legende(doc),
          parse_mode: "HTML",
        });
        fichiersConnus.set(doc.url, envoi.document.file_id);
      } catch {
        // PDF de plus de 20 Mo, site injoignable, identifiant périmé : le document passe en lien.
        fichiersConnus.delete(doc.url);
        nonEnvoyes.push(doc);
      }
    }

    await ctx.reply(texteFinal([...nonEnvoyes, ...liens], resultat.documents.length === 0), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  });

  prive.on("message", (ctx) => ctx.reply(MESSAGE_TEXTE_SEULEMENT));

  bot.catch(({ error }) => console.error("Erreur du bot :", error));
  return bot;
}
