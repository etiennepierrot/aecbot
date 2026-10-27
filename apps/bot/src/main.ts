import { chargerCatalogueMarkdown, creerModeleOpenRouter } from "@aecbot/core";
import { creerBot } from "./bot";
import { lireConfiguration } from "./configuration";
import { Limiteur } from "./limiteur";

const config = lireConfiguration(process.env);

const { catalogue, erreurs } = await chargerCatalogueMarkdown(config.dossierCorpus);
for (const { fichier, message } of erreurs) {
  console.warn(`Fichier ignoré : ${fichier} — ${message.split("\n")[0]}`);
}
console.log(`${catalogue.taille} documents diffusables chargés depuis ${config.dossierCorpus}`);

const bot = creerBot(config.jetonTelegram, {
  recherche: {
    catalogue,
    ia: creerModeleOpenRouter({ cleApi: config.cleOpenRouter, modele: config.modele }),
  },
  limiteur: new Limiteur(config.questionsParHeure, 60 * 60 * 1000),
  journal: (evenement) => console.log(JSON.stringify({ evenement: "question", ...evenement })),
});

await bot.api.setMyCommands([{ command: "aide", description: "Comment utiliser AECBot" }]);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => bot.stop());
}

await bot.start({
  onStart: (moi) => console.log(`@${moi.username} démarré (modèle ${config.modele})`),
});
